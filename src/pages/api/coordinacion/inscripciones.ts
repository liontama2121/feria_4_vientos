// Inscripciones a ferias. Los permisos se validan AQUÍ (el middleware ya dejó pasar solo a
// coordinadoras y comité):
// - Coordinadora y comité: ubicar (uno, varios o desde Excel), aprobar, rechazar, registrar aviso.
// - Solo comité (admin): aprobar pago, marcar "participa" y reabrir una rechazada.
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { avisoInscripcionRechazada } from '../../../lib/avisos';
import { listarFechas, listarInscripciones, marcarAvisada, moverInscripcion, obtenerInscripcion, ubicarInscripciones, quitarUbicacion } from '../../../lib/db';
import { UBICADOS, celularCO, type EstadoInscripcion } from '../../../lib/ferias';
import { esTorre, texto } from '../../../lib/validacion';
import type { TorreId } from '../../../lib/constantes';

const DE_COORDINACION = ['ubicar', 'aprobar', 'rechazar', 'avisado'] as const;
const SOLO_COMITE = ['aprobar_pago', 'participando', 'reabrir'] as const;
type Accion = (typeof DE_COORDINACION)[number] | (typeof SOLO_COMITE)[number];

interface Cuerpo {
  accion?: Accion;
  feria?: string;
  id?: string;
  /** ubicar: [{ id, conjunto }] (conjunto vacío = quitar ubicación, solo si sigue en espera). */
  cambios?: { id?: string; conjunto?: string }[];
  nota?: string;
}

export const PATCH: APIRoute = async ({ locals, request }) => {
  const u = locals.usuario!;
  const db = locals.runtime.env.DB;
  const body = await leerJson<Cuerpo>(request);
  const accion = body?.accion;
  if (!body || !accion) return error('Falta la acción.');
  const deCoord = (DE_COORDINACION as readonly string[]).includes(accion);
  if (!deCoord && !(SOLO_COMITE as readonly string[]).includes(accion)) return error('Acción desconocida.');
  if (!deCoord && u.rol !== 'admin') return error('Solo el administrador aprueba pagos y cambia estas etapas.', 403);
  const quien = u.email;
  const ferias = await listarFechas(db);

  // ── Ubicar (selector por fila, masivo o Excel) ──
  if (accion === 'ubicar') {
    const feria = ferias.find((f) => f.id === body.feria);
    if (!feria) return error('Elige la feria.', 404);
    if (!Array.isArray(body.cambios) || !body.cambios.length) return error('No hay cambios para aplicar.');
    if (body.cambios.length > 500) return error('Son demasiados cambios de una vez.');
    const actuales = new Map((await listarInscripciones(db, feria.id)).map((i) => [i.id, i]));
    const validos: { id: string; conjunto: TorreId }[] = [];
    const quitar: string[] = [];
    const errores: string[] = [];
    for (const c of body.cambios) {
      const ins = c.id ? actuales.get(c.id) : undefined;
      if (!ins) {
        errores.push(`La inscripción ${c.id ?? '?'} no es de esta feria.`);
        continue;
      }
      if (ins.estado === 'rechazada') {
        errores.push(`${ins.nombre}: está rechazada.`);
        continue;
      }
      if (!c.conjunto) {
        if (ins.estado !== 'pendiente') errores.push(`${ins.nombre}: ya está aprobado; cámbielo de conjunto en vez de quitarlo.`);
        else quitar.push(ins.id);
        continue;
      }
      if (!esTorre(c.conjunto)) {
        errores.push(`${ins.nombre}: "${c.conjunto}" no es un conjunto.`);
        continue;
      }
      if (feria.conjuntos?.length && !feria.conjuntos.includes(c.conjunto)) {
        errores.push(`${ins.nombre}: ${c.conjunto} no participa en esta feria.`);
        continue;
      }
      validos.push({ id: ins.id, conjunto: c.conjunto });
    }
    // Solicitud en bloque: los emprendimientos del mismo grupo van SIEMPRE al mismo conjunto.
    for (const v of [...validos]) {
      const g = actuales.get(v.id)!.grupo;
      if (!g) continue;
      const otro = validos.find((x) => x.id !== v.id && actuales.get(x.id)!.grupo === g && x.conjunto !== v.conjunto);
      if (otro) {
        errores.push(`${actuales.get(v.id)!.nombre}: va en bloque con ${actuales.get(otro.id)!.nombre}; deben quedar en el mismo conjunto.`);
        validos.splice(0, validos.length, ...validos.filter((x) => actuales.get(x.id)!.grupo !== g));
        continue;
      }
      for (const h of actuales.values())
        if (h.grupo === g && h.estado !== 'rechazada' && !validos.some((x) => x.id === h.id)) validos.push({ id: h.id, conjunto: v.conjunto });
    }
    for (const id of [...quitar]) {
      const g = actuales.get(id)!.grupo;
      if (g) for (const h of actuales.values()) if (h.grupo === g && h.estado === 'pendiente' && !quitar.includes(h.id)) quitar.push(h.id);
    }
    const sinCupo = await ubicarInscripciones(db, feria, validos, quien);
    if (quitar.length) await quitarUbicacion(db, feria.id, quitar);
    for (const id of sinCupo) {
      const ins = actuales.get(id)!;
      const c = validos.find((v) => v.id === id)!.conjunto;
      errores.push(`${ins.nombre}: ${c} ya no tiene cupos.`);
    }
    return json({ filas: await listarInscripciones(db, feria.id), aplicados: validos.length - sinCupo.length + quitar.length, errores });
  }

  // ── Acciones sobre una inscripción ──
  const ins = body.id ? await obtenerInscripcion(db, body.id) : null;
  if (!ins) return error('No encontramos esa inscripción.', 404);
  const feria = ferias.find((f) => f.id === ins.feria_id);
  if (!feria) return error('La feria de esta inscripción ya no existe.', 404);
  // Solicitud en bloque: la decisión vale para todos los emprendimientos del grupo.
  const grupo = ins.grupo ? (await listarInscripciones(db, feria.id)).filter((x) => x.grupo === ins.grupo) : [ins];
  const mover = async (desde: readonly EstadoInscripcion[], a: EstadoInscripcion, nota?: string) => {
    let alguno = false;
    for (const g of grupo) if (await moverInscripcion(db, g.id, desde, a, quien, nota)) alguno = true;
    return alguno;
  };
  const respuesta = async (notificacion: unknown) => {
    const filas = await Promise.all(grupo.map((g) => obtenerInscripcion(db, g.id)));
    return json({ fila: filas.find((f) => f?.id === ins.id), filas: filas.filter(Boolean), notificacion });
  };

  if (accion === 'avisado') {
    if (!UBICADOS.includes(ins.estado) || !ins.conjunto_asignado) return error('Solo se avisa a quienes están aprobados y ubicados.', 409);
    if (!celularCO(ins.whatsapp)) return error('El WhatsApp de este emprendimiento no es un celular colombiano válido (10 dígitos, empieza por 3).', 409);
    for (const g of grupo) if (UBICADOS.includes(g.estado) && g.conjunto_asignado) await marcarAvisada(db, g.id, g.conjunto_asignado, quien);
    return respuesta(null);
  }

  let ok = false;
  let notificacion = null;
  if (accion === 'aprobar') {
    if (grupo.some((g) => g.estado === 'pendiente' && !g.conjunto_asignado)) return error('Primero ubíquelo: elija el conjunto donde va a vender.', 409);
    // Si la feria no cobra, aprobar ya deja el pago listo.
    ok = await mover(['pendiente'], (feria.valor ?? 0) > 0 ? 'aprobado' : 'pago_aprobado', '');
  } else if (accion === 'rechazar') {
    const motivo = texto(body.nota, 300);
    // La coordinadora no deshace un pago ya confirmado: eso es del administrador.
    ok = await mover(u.rol === 'admin' ? ['pendiente', 'aprobado', 'pago_aprobado'] : ['pendiente', 'aprobado'], 'rechazada', motivo);
    const nombres = grupo.map((g) => g.nombre);
    const nombre = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0];
    if (ok) notificacion = await avisoInscripcionRechazada(db, { ...ins, nombre }, feria, motivo);
  } else if (accion === 'aprobar_pago') {
    ok = await mover(['aprobado'], 'pago_aprobado');
  } else if (accion === 'participando') {
    ok = await mover(['pago_aprobado'], 'participando');
  } else if (accion === 'reabrir') {
    ok = await mover(['rechazada'], 'pendiente', '');
  }
  if (!ok) return error('Esta inscripción ya cambió de estado. Recargue la página.', 409);
  return respuesta(notificacion);
};
