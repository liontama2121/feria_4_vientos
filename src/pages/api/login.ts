// Inicia sesión con ADMIN_USER / ADMIN_PASSWORD y deja la cookie firmada.
import type { APIRoute } from 'astro';
import { COOKIE_SESION, crearSesion, credencialesValidas, opcionesCookie } from '../../lib/auth';

/** Solo se vuelve a rutas internas del panel (evita redirecciones abiertas). */
function destinoSeguro(next: unknown) {
  return typeof next === 'string' && /^\/admin(\/|\?|#|$)/.test(next) && !next.startsWith('/admin/login') ? next : '/admin/comite';
}

export const POST: APIRoute = async ({ request, locals, cookies, redirect, url }) => {
  const env = locals.runtime.env;
  const form = await request.formData().catch(() => null);
  const usuario = String(form?.get('usuario') ?? '');
  const clave = String(form?.get('clave') ?? '');
  const next = destinoSeguro(form?.get('next'));

  if (!(await credencialesValidas(env, usuario, clave))) {
    // Frena un poco los intentos por fuerza bruta.
    await new Promise((r) => setTimeout(r, 800));
    return redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`, 303);
  }

  cookies.set(COOKIE_SESION, await crearSesion(env), opcionesCookie(url));
  return redirect(next, 303);
};
