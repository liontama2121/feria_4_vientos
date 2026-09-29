// El vecino abre el link que le mandó el comité y pone su contraseña nueva. Queda con la sesión iniciada.
import type { APIRoute } from 'astro';
import { COOKIE_SESION, crearSesion, hashClave, hashToken, opcionesCookie } from '../../../lib/auth';
import { obtenerCuenta, usarLinkClave } from '../../../lib/db';

export const POST: APIRoute = async ({ request, locals, redirect, cookies, url }) => {
  const form = await request.formData().catch(() => null);
  const token = typeof form?.get('t') === 'string' ? String(form!.get('t')).slice(0, 100) : '';
  const clave = form?.get('clave');
  const clave2 = form?.get('clave2');
  const volver = (e: string) => redirect(`/clave/nueva?t=${encodeURIComponent(token)}&error=${e}`, 303);

  if (!token) return redirect('/clave/nueva', 303);
  if (typeof clave !== 'string' || clave.length < 8 || clave.length > 200) return volver('corta');
  if (clave !== clave2) return volver('distintas');

  const env = locals.runtime.env;
  const email = await usarLinkClave(env.DB, await hashToken(token), await hashClave(clave));
  if (!email) return redirect('/clave/nueva?error=link', 303);

  const cuenta = await obtenerCuenta(env.DB, email);
  if (cuenta?.estado !== 'active') return redirect('/admin/login?error=inactiva', 303);
  cookies.set(COOKIE_SESION, await crearSesion(env, { tipo: 'cuenta', email }), opcionesCookie(url));
  return redirect('/admin?clave=ok', 303);
};
