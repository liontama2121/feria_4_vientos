// Vista "Configuración": email de notificaciones del vecino.
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { actualizarCuenta, obtenerUsuario } from '../../../lib/db';
import { esEmail } from '../../../lib/validacion';

export const PUT: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ email_avisos?: string }>(request);
  const email = locals.usuario!.email;
  if (!body || !esEmail(body.email_avisos?.trim())) return error('Escribe un correo válido.');

  const db = locals.runtime.env.DB;
  if (!(await obtenerUsuario(db, email))) return error('Tu cuenta no existe en la base del comité.', 404);
  const u = await actualizarCuenta(db, email, { email_avisos: body.email_avisos!.trim().toLowerCase() });
  return json({ ok: true, email_avisos: u?.email_avisos });
};
