// Coordinación aprueba (o rechaza) cuentas NUEVAS de emprendedores. Nada más: no desactiva,
// no cambia contraseñas ni datos (eso sigue en /api/comite/cuentas, solo admin).
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { adminEmails } from '../../../lib/auth';
import { avisoCuenta } from '../../../lib/avisos';
import { obtenerCuenta, revisarCuenta } from '../../../lib/db';
import { texto } from '../../../lib/validacion';

export const PATCH: APIRoute = async ({ locals, request, url }) => {
  const u = locals.usuario!;
  const env = locals.runtime.env;
  const body = await leerJson<{ email?: string; accion?: 'activar' | 'rechazar'; motivo?: string }>(request);
  const email = texto(body?.email, 200).toLowerCase();
  if (!email || (body?.accion !== 'activar' && body?.accion !== 'rechazar')) return error('Falta la cuenta o la acción.');
  const cuenta = await obtenerCuenta(env.DB, email);
  if (!cuenta) return error('No encontramos la cuenta.', 404);
  if (cuenta.estado !== 'pending_activation') return error('Esa cuenta ya fue revisada.', 409);
  // Una cuenta con correo de ADMIN_EMAILS tendría acceso total: solo otro administrador la activa.
  if (u.rol !== 'admin' && adminEmails(env).includes(email)) return error('Esta cuenta es de administración: solo el administrador puede activarla.', 403);

  const activar = body.accion === 'activar';
  const motivo = activar ? '' : texto(body.motivo, 300);
  await revisarCuenta(env.DB, email, activar ? 'active' : 'rejected', u.email, motivo);
  const actualizada = (await obtenerCuenta(env.DB, email))!;
  const notificacion = await avisoCuenta(env.DB, actualizada, activar, url.origin, motivo);
  return json({ cuenta: actualizada, notificacion });
};
