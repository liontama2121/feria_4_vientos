// Moderación de calificaciones (ocultar / mostrar / borrar) y reportes (resolver / descartar /
// reabrir). Solo admin (lo garantiza el middleware).
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { borrarCalificacion, ocultarCalificacion, revisarReporte, type EstadoReporte } from '../../../lib/db';
import { texto } from '../../../lib/validacion';

const ESTADOS: EstadoReporte[] = ['abierto', 'resuelto', 'descartado'];

export const PATCH: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ tipo?: 'calificacion' | 'reporte'; id?: string; oculta?: boolean; estado?: EstadoReporte; nota?: string }>(request);
  const id = texto(body?.id, 60);
  if (!body || !id) return error('Faltan datos.');
  const db = locals.runtime.env.DB;

  if (body.tipo === 'calificacion') {
    await ocultarCalificacion(db, id, body.oculta === true);
    return json({ ok: true });
  }
  if (body.tipo === 'reporte') {
    if (!body.estado || !ESTADOS.includes(body.estado)) return error('Estado inválido.');
    const reporte = await revisarReporte(db, id, body.estado, texto(body.nota, 400), locals.usuario!.email);
    if (!reporte) return error('No encontramos el reporte.', 404);
    return json({ reporte });
  }
  return error('Tipo desconocido.');
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ id?: string }>(request);
  const id = texto(body?.id, 60);
  if (!id) return error('Falta la calificación.');
  await borrarCalificacion(locals.runtime.env.DB, id);
  return json({ ok: true });
};
