// Bandeja de notificaciones: el comité las manda a mano por WhatsApp y las marca como enviadas.
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { listarNotificaciones, marcarNotificacion } from '../../../lib/db';

export const GET: APIRoute = async ({ locals }) => json(await listarNotificaciones(locals.runtime.env.DB));

export const PATCH: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ id?: string; enviada?: boolean }>(request);
  if (!body?.id) return error('Falta la notificación.');
  await marcarNotificacion(locals.runtime.env.DB, body.id, body.enviada !== false);
  return json({ ok: true });
};
