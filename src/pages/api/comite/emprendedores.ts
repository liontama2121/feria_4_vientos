// Gestión de emprendedores por el comité: listar, crear, moderar (aprobar / rechazar /
// pedir cambios), destacar, ocultar, marcar "en la feria" y borrar. Solo admin (lo garantiza el middleware).
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { avisoAprobado, avisoCambios, avisoRechazado } from '../../../lib/avisos';
import {
  aprobarRegistro,
  borrarRegistro,
  crearEmprendimiento,
  filaComite,
  listarRegistros,
  marcarCampo,
  obtenerRegistro,
  pedirCambios,
  rechazarRegistro,
  type Notificacion,
} from '../../../lib/db';
import { esTorre, texto, validarPublicacion } from '../../../lib/validacion';

export const GET: APIRoute = async ({ locals }) => {
  const registros = await listarRegistros(locals.runtime.env.DB);
  return json(registros.map(filaComite));
};

/** Crea un emprendimiento vacío (draft); el comité lo completa en /admin?slug=… */
export const POST: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ nombre_vecino?: string; torre?: string; apartamento?: string; nombre_emprendimiento?: string }>(request);
  if (!body || !esTorre(body.torre)) return error('Elige el conjunto.');
  const apartamento = texto(body.apartamento, 10);
  const slug = await crearEmprendimiento(locals.runtime.env.DB, {
    nombre_vecino: texto(body.nombre_vecino, 80),
    torre: body.torre,
    apartamento,
    nombre_emprendimiento: texto(body.nombre_emprendimiento, 80),
  });
  return json({ slug }, 201);
};

type Accion = 'aprobar' | 'rechazar' | 'pedir_cambios' | 'destacar' | 'visible' | 'en_feria';

export const PATCH: APIRoute = async ({ locals, request, url }) => {
  const body = await leerJson<{ slug?: string; accion?: Accion; valor?: boolean; motivo?: string; nota?: string }>(request);
  if (!body?.slug || !body.accion) return error('Falta el emprendimiento o la acción.');
  const db = locals.runtime.env.DB;
  const revisor = locals.usuario!.email;
  const registro = await obtenerRegistro(db, body.slug);
  if (!registro) return error('No encontramos el emprendimiento.', 404);

  let notificacion: Notificacion | null = null;
  switch (body.accion) {
    case 'aprobar': {
      const faltantes = validarPublicacion(registro.borrador);
      if (faltantes.length) return error(`No se puede aprobar todavía: ${faltantes.map((f) => f.mensaje.toLowerCase()).join(', ')}.`, 422);
      await aprobarRegistro(db, body.slug, registro.borrador, revisor);
      notificacion = await avisoAprobado(db, registro, url.origin);
      break;
    }
    case 'rechazar': {
      const motivo = texto(body.motivo, 400);
      if (!motivo) return error('Escribe el motivo del rechazo.');
      await rechazarRegistro(db, body.slug, motivo, revisor);
      notificacion = await avisoRechazado(db, registro, motivo);
      break;
    }
    case 'pedir_cambios': {
      const nota = texto(body.nota, 600);
      if (!nota) return error('Escribe qué debe ajustar el vecino.');
      await pedirCambios(db, body.slug, nota, revisor);
      notificacion = await avisoCambios(db, registro, nota, url.origin);
      break;
    }
    case 'destacar':
      await marcarCampo(db, body.slug, 'destacado', body.valor === true);
      break;
    case 'visible':
      await marcarCampo(db, body.slug, 'publicado', body.valor === true);
      break;
    case 'en_feria':
      await marcarCampo(db, body.slug, 'en_feria', body.valor === true);
      break;
    default:
      return error('Acción desconocida.');
  }
  return json({ fila: filaComite((await obtenerRegistro(db, body.slug))!), notificacion });
};

/** Borrar es exclusivo del comité: el vecino nunca elimina. */
export const DELETE: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ slug?: string }>(request);
  if (!body?.slug) return error('Falta el emprendimiento.');
  await borrarRegistro(locals.runtime.env.DB, body.slug);
  return json({ ok: true });
};
