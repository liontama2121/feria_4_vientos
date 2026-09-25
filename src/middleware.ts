import { defineMiddleware } from 'astro:middleware';
import { COOKIE_SESION, borrarSesion, leerSesion, usuarioComite, usuarioDeCuenta } from './lib/auth';
import { asegurarDb, esPreviewSobreProduccion, obtenerCuenta } from './lib/db';
import { error } from './lib/api';

// /admin/login queda afuera: es donde se inicia sesión.
const PRIVADO = /^\/(admin(?!\/login)|api\/(panel|comite))(\/|$)/;
// Solo rol admin: la cola de moderación, cuentas, notificaciones y contenido del sitio.
const SOLO_ADMIN = /^\/(admin\/comite|api\/comite)(\/|$)/;

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname, search } = ctx.url;
  ctx.locals.usuario = null;

  const env = ctx.locals.runtime?.env;
  if (!env?.DB || pathname.startsWith('/media/')) return next();
  await asegurarDb(env.DB);

  // Preview de una rama sobre la D1 de producción: solo lectura.
  if (esPreviewSobreProduccion && pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(ctx.request.method)) {
    return error('Esta es una vista previa de solo lectura. Usa el sitio de producción para hacer cambios.', 503);
  }

  if (!PRIVADO.test(pathname)) return next();

  const sujeto = await leerSesion(env, ctx.cookies.get(COOKIE_SESION)?.value);
  if (sujeto?.tipo === 'comite') {
    ctx.locals.usuario = usuarioComite(env);
  } else if (sujeto?.tipo === 'cuenta') {
    // Se relee en cada request: si el comité desactiva la cuenta, la sesión muere al instante.
    const cuenta = await obtenerCuenta(env.DB, sujeto.email);
    if (cuenta?.estado === 'active') ctx.locals.usuario = usuarioDeCuenta(env, cuenta);
    else borrarSesion(ctx.cookies);
  }

  const u = ctx.locals.usuario;
  if (!u) {
    if (pathname.startsWith('/api/')) return error('Tu sesión expiró. Vuelve a entrar.', 401);
    return ctx.redirect(`/admin/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (SOLO_ADMIN.test(pathname) && u.rol !== 'admin') {
    if (pathname.startsWith('/api/')) return error('Solo el comité puede hacer esto.', 403);
    return ctx.redirect('/admin');
  }

  const res = await next();
  // El panel nunca se cachea ni se embebe en otros sitios.
  try {
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('Referrer-Policy', 'same-origin');
  } catch {
    // Respuestas con headers inmutables (p. ej. redirects): no pasa nada.
  }
  return res;
});
