// Cuentas de vecinos creadas en /registro: el comité las activa o rechaza.
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { avisoCuenta } from '../../../lib/avisos';
import { listarCuentas, obtenerCuenta, revisarCuenta } from '../../../lib/db';
import { texto } from '../../../lib/validacion';

export const GET: APIRoute = async ({ locals }) => json(await listarCuentas(locals.runtime.env.DB));

export const PATCH: APIRoute = async ({ locals, request, url }) => {
  const body = await leerJson<{ email?: string; accion?: 'activar' | 'rechazar'; motivo?: string }>(request);
  const email = texto(body?.email, 200).toLowerCase();
  if (!email || !body?.accion) return error('Falta la cuenta o la acción.');
  if (body.accion !== 'activar' && body.accion !== 'rechazar') return error('Acción desconocida.');
  const db = locals.runtime.env.DB;
  if (!(await obtenerCuenta(db, email))) return error('No encontramos la cuenta.', 404);

  const activar = body.accion === 'activar';
  const motivo = activar ? '' : texto(body.motivo, 300);
  await revisarCuenta(db, email, activar ? 'active' : 'rejected', locals.usuario!.email, motivo);
  const cuenta = (await obtenerCuenta(db, email))!;
  const notificacion = await avisoCuenta(db, cuenta, activar, url.origin, motivo);
  return json({ cuenta, notificacion });
};
