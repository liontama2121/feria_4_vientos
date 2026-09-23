import { defineMiddleware } from 'astro:middleware';
import { COOKIE_SESION, sesionValida, usuarioComite } from './lib/auth';
import { asegurarDb } from './lib/db';
import { error } from './lib/api';

// /admin/login queda afuera: es donde se inicia sesión.
const PRIVADO = /^\/(admin(?!\/login)|api\/(panel|comite))(\/|$)/;

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname, search } = ctx.url;
  ctx.locals.usuario = null;

  const env = ctx.locals.runtime?.env;
  if (!env?.DB || pathname.startsWith('/media/')) return next();
  await asegurarDb(env.DB);

  if (!PRIVADO.test(pathname)) return next();

  if (await sesionValida(env, ctx.cookies.get(COOKIE_SESION)?.value)) {
    ctx.locals.usuario = usuarioComite(env);
  } else if (pathname.startsWith('/api/')) {
    return error('Tu sesión expiró. Vuelve a entrar.', 401);
  } else {
    return ctx.redirect(`/admin/login?next=${encodeURIComponent(pathname + search)}`);
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
