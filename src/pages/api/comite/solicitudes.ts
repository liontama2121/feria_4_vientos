// El comité aprueba o rechaza que un vecino abra otro emprendimiento. Aprobar crea el borrador
// ligado a su cuenta (con sus datos de conjunto/apto/WhatsApp). Solo admin (middleware).
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { avisoSolicitudRespuesta } from '../../../lib/avisos';
import { borrarRegistro, cerrarSolicitud, crearEmprendimiento, filaComite, obtenerCuenta, obtenerRegistro, obtenerSolicitud } from '../../../lib/db';
import { texto } from '../../../lib/validacion';

export const PATCH: APIRoute = async ({ locals, request, url }) => {
  const body = await leerJson<{ id?: string; accion?: 'aprobar' | 'rechazar'; respuesta?: string }>(request);
  const id = texto(body?.id, 60);
  if (!body || !id || !['aprobar', 'rechazar'].includes(body.accion ?? '')) return error('Faltan datos.');
  const db = locals.runtime.env.DB;
  const revisor = locals.usuario!.email;

  const s = await obtenerSolicitud(db, id);
  if (!s) return error('No encontramos la solicitud.', 404);
  if (s.estado !== 'pendiente') return error('Esa solicitud ya se respondió.', 409);
  const cuenta = await obtenerCuenta(db, s.email);
  if (!cuenta) return error('La cuenta del vecino ya no existe.', 404);

  const respuesta = texto(body.respuesta, 300);
  let slug: string | null = null;
  if (body.accion === 'aprobar') {
    if (cuenta.estado !== 'active') return error('La cuenta del vecino no está activa.', 409);
    slug = await crearEmprendimiento(
      db,
      { nombre_vecino: cuenta.nombre, torre: cuenta.torre, apartamento: cuenta.apartamento, whatsapp: cuenta.whatsapp, nombre_emprendimiento: s.nombre_emprendimiento },
      cuenta.email,
    );
  }
  if (!(await cerrarSolicitud(db, id, body.accion === 'aprobar' ? 'aprobada' : 'rechazada', respuesta, revisor, slug))) {
    // Otro admin la respondió al mismo tiempo: se deshace el borrador recién creado.
    if (slug) await borrarRegistro(db, slug);
    return error('Esa solicitud ya se respondió.', 409);
  }

  const cerrada = (await obtenerSolicitud(db, id))!;
  const notificacion = await avisoSolicitudRespuesta(db, cuenta, cerrada, body.accion === 'aprobar', url.origin, respuesta);
  const registro = slug ? await obtenerRegistro(db, slug) : null;
  return json({ solicitud: cerrada, fila: registro ? filaComite(registro) : null, notificacion });
};
