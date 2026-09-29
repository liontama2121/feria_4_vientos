// Cuentas de vecinos creadas en /registro: el comité las activa o rechaza, y autoriza cambios de contraseña.
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { HORAS_LINK_CLAVE, nuevoTokenClave } from '../../../lib/auth';
import { avisoCuenta, avisoLinkClave } from '../../../lib/avisos';
import { autorizarCambioClave, listarCambiosClave, listarCuentas, negarCambioClave, obtenerCuenta, revisarCuenta } from '../../../lib/db';
import { texto } from '../../../lib/validacion';

export const GET: APIRoute = async ({ locals }) => json(await listarCuentas(locals.runtime.env.DB));

const ACCIONES = ['activar', 'rechazar', 'clave', 'clave_no'] as const;
type Accion = (typeof ACCIONES)[number];

export const PATCH: APIRoute = async ({ locals, request, url }) => {
  const body = await leerJson<{ email?: string; accion?: Accion; motivo?: string }>(request);
  const email = texto(body?.email, 200).toLowerCase();
  if (!email || !body?.accion) return error('Falta la cuenta o la acción.');
  if (!ACCIONES.includes(body.accion)) return error('Acción desconocida.');
  const db = locals.runtime.env.DB;
  const cuenta = await obtenerCuenta(db, email);
  if (!cuenta) return error('No encontramos la cuenta.', 404);
  const revisor = locals.usuario!.email;

  if (body.accion === 'clave_no') {
    await negarCambioClave(db, email, revisor);
    return json({ cuenta, notificacion: null, cambiosClave: await listarCambiosClave(db) });
  }
  if (body.accion === 'clave') {
    if (cuenta.estado !== 'active') return error('Primero activa la cuenta: solo las cuentas activas pueden entrar.', 409);
    const { token, hash, vence } = await nuevoTokenClave();
    await autorizarCambioClave(db, email, hash, vence, revisor);
    const link = new URL(`/clave/nueva?t=${token}`, url.origin).toString();
    const notificacion = await avisoLinkClave(db, cuenta, link, HORAS_LINK_CLAVE);
    return json({ cuenta, notificacion, cambiosClave: await listarCambiosClave(db) });
  }

  const activar = body.accion === 'activar';
  const motivo = activar ? '' : texto(body.motivo, 300);
  await revisarCuenta(db, email, activar ? 'active' : 'rejected', revisor, motivo);
  const actualizada = (await obtenerCuenta(db, email))!;
  const notificacion = await avisoCuenta(db, actualizada, activar, url.origin, motivo);
  return json({ cuenta: actualizada, notificacion });
};
