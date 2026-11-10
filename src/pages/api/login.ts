// Inicia sesión con el usuario del comité (ADMIN_USER / ADMIN_PASSWORD) o con una cuenta de
// vecino activa (correo + contraseña) y deja la cookie firmada.
import type { APIRoute } from 'astro';
import {
  COOKIE_SESION,
  coordinadoraValida,
  credencialesValidas,
  crearSesion,
  opcionesCookie,
  rolDeEmail,
  sujetoCoordinadora,
  verificarClave,
  type Sujeto,
} from '../../lib/auth';
import { obtenerCuentaConClave, type Rol } from '../../lib/db';

/** Solo se vuelve a rutas internas del panel (evita redirecciones abiertas). */
function destinoSeguro(next: unknown, rol: Rol) {
  if (rol === 'coordinadora') return '/coordinacion';
  const inicio = rol === 'admin' ? '/admin/comite' : '/admin';
  if (typeof next !== 'string') return inicio;
  if (rol === 'admin' && /^\/coordinacion(\/|\?|#|$)/.test(next)) return next;
  if (!/^\/admin(\/|\?|#|$)/.test(next) || next.startsWith('/admin/login')) return inicio;
  return rol !== 'admin' && next.startsWith('/admin/comite') ? inicio : next;
}

export const POST: APIRoute = async ({ request, locals, cookies, redirect, url }) => {
  const env = locals.runtime.env;
  const form = await request.formData().catch(() => null);
  const usuario = String(form?.get('usuario') ?? '').trim();
  const clave = String(form?.get('clave') ?? '');
  const next = String(form?.get('next') ?? '');
  const volver = (motivo: string) => redirect(`/admin/login?error=${motivo}&next=${encodeURIComponent(next)}`, 303);

  let sujeto: Sujeto | null = null;
  let rol: Rol = 'vecino';
  const coord = usuario.includes('@') ? null : await coordinadoraValida(env, usuario, clave);
  if (await credencialesValidas(env, usuario, clave)) {
    sujeto = { tipo: 'comite' };
    rol = 'admin';
  } else if (coord) {
    sujeto = await sujetoCoordinadora(coord);
    rol = 'coordinadora';
  } else if (usuario.includes('@')) {
    const email = usuario.toLowerCase();
    const cuenta = await obtenerCuentaConClave(env.DB, email);
    if (cuenta && (await verificarClave(clave, cuenta.clave))) {
      if (cuenta.estado === 'pending_activation') return volver('pendiente');
      if (cuenta.estado !== 'active') return volver('inactiva');
      sujeto = { tipo: 'cuenta', email };
      rol = rolDeEmail(env, email);
    }
  }

  if (!sujeto) {
    // Frena un poco los intentos por fuerza bruta.
    await new Promise((r) => setTimeout(r, 800));
    return volver('1');
  }

  cookies.set(COOKIE_SESION, await crearSesion(env, sujeto), opcionesCookie(url));
  return redirect(destinoSeguro(next, rol), 303);
};
