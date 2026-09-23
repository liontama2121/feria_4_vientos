import { defineMiddleware } from 'astro:middleware';
import { identidad, resolverUsuario } from './lib/auth';
import { asegurarDb } from './lib/db';
import { error } from './lib/api';

const PRIVADO = /^\/(admin|api\/(panel|comite))(\/|$)/;

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  ctx.locals.email = null;
  ctx.locals.usuario = null;

  const env = ctx.locals.runtime?.env;
  if (!env?.DB || pathname.startsWith('/media/')) return next();
  await asegurarDb(env.DB);

  if (!PRIVADO.test(pathname)) return next();

  const email = await identidad(ctx.request, env, ctx.cookies);
  const usuario = email ? await resolverUsuario(env.DB, email, env) : null;
  ctx.locals.email = email;
  ctx.locals.usuario = usuario;

  if (pathname.startsWith('/api/')) {
    if (!usuario) return error('Tu sesión no es válida o tu cuenta aún no está activa.', 401);
    if (pathname.startsWith('/api/comite') && usuario.rol !== 'admin') return error('Solo el comité puede hacer esto.', 403);
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
