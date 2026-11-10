// El vecino inscribe uno o varios de SUS emprendimientos a una feria con inscripciones abiertas
// (formulario HTML de /admin/ferias). Solo marca cuál(es): no escribe qué vende ni elige conjunto.
// Si marca varios, van como UNA solicitud en bloque (mismo `grupo`).
// accion=retirar borra una inscripción suya que siga en espera.
import type { APIRoute } from 'astro';
import { avisoInscripcion } from '../../../lib/avisos';
import { crearInscripcion, listarFechas, registroDeVecino, retirarInscripcion } from '../../../lib/db';
import { aceptaInscripciones } from '../../../lib/fechas';
import { texto } from '../../../lib/validacion';

export const POST: APIRoute = async ({ locals, request, redirect }) => {
  const u = locals.usuario!;
  // El admin no tiene emprendimientos propios; se inscribe desde el comité editando al vecino.
  if (u.rol !== 'vecino') return redirect('/admin/comite', 303);
  const db = locals.runtime.env.DB;
  const form = await request.formData().catch(() => null);
  const volver = (q: string) => redirect(`/admin/ferias?${q}`, 303);
  if (!form) return volver('error=datos');

  if (form.get('accion') === 'retirar') {
    const ok = await retirarInscripcion(db, texto(form.get('id'), 60), u.email);
    return volver(ok ? 'retirada=1' : 'error=retirar');
  }

  const feriaId = texto(form.get('feria'), 80);
  const feria = (await listarFechas(db)).find((f) => f.id === feriaId);
  if (!feria || !aceptaInscripciones(feria)) return volver('error=cerrada');

  const slugs = [...new Set(form.getAll('slug').map((s) => texto(s, 120)).filter(Boolean))];
  if (!slugs.length) return volver(`error=ninguno&feria=${encodeURIComponent(feriaId)}`);
  // Solo los suyos (un slug ajeno devuelve null) y no rechazados en el directorio.
  const propios = (await Promise.all(slugs.map((s) => registroDeVecino(db, u.email, s)))).filter((r) => r && r.estado !== 'rejected');
  // Varios marcados = UNA solicitud en bloque: el comité los ubica, aprueba y avisa juntos.
  const grupo = propios.length > 1 ? crypto.randomUUID() : null;
  const creados: string[] = [];
  for (const r of propios) {
    const ok = await crearInscripcion(db, { feria_id: feria.id, slug: r!.slug, email: u.email, que_vende: '', necesidades: '', conjunto_asignado: null, grupo });
    if (ok) creados.push(r!.borrador.nombre_emprendimiento || 'Sin nombre');
  }
  if (!creados.length) return volver('error=repetida');
  // Un solo aviso al comité por solicitud (aunque traiga dos emprendimientos).
  const nombre = creados.length > 1 ? `${creados.slice(0, -1).join(', ')} y ${creados.at(-1)} (en bloque)` : creados[0];
  await avisoInscripcion(db, { nombre, emprendedor: propios[0]!.borrador.nombre_vecino || u.nombre, slug: propios[0]!.slug }, feria);
  return volver(`recibida=${creados.length}`);
};
