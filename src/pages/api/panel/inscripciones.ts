// El vecino inscribe uno o varios de SUS emprendimientos a una feria con inscripciones abiertas
// (formulario HTML de /admin/ferias). No elige conjunto: lo ubica el comité.
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
  let creadas = 0;
  for (const slug of slugs) {
    // Solo los suyos: un slug ajeno devuelve null.
    const r = await registroDeVecino(db, u.email, slug);
    if (!r || r.estado === 'rejected') continue;
    const queVende = texto(form.get(`que_vende_${slug}`), 300);
    if (!queVende) return volver(`error=que_vende&feria=${encodeURIComponent(feriaId)}`);
    const ok = await crearInscripcion(db, {
      feria_id: feria.id,
      slug,
      email: u.email,
      que_vende: queVende,
      necesidades: texto(form.get(`necesidades_${slug}`), 300),
      conjunto_asignado: null,
    });
    if (ok) {
      creadas++;
      await avisoInscripcion(db, { nombre: r.borrador.nombre_emprendimiento || 'Sin nombre', emprendedor: r.borrador.nombre_vecino || u.nombre, slug }, feria);
    }
  }
  return volver(creadas ? `recibida=${creadas}` : 'error=repetida');
};
