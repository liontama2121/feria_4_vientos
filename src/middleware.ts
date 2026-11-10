import { defineMiddleware } from 'astro:middleware';
import { COOKIE_SESION, borrarSesion, coordinadoraDeSesion, leerSesion, usuarioComite, usuarioCoordinadora, usuarioDeCuenta } from './lib/auth';
import { asegurarDb, esPreviewSobreProduccion, listarCategorias, obtenerCuenta } from './lib/db';
import { CATEGORIAS_BASE } from './lib/constantes';
import { error } from './lib/api';

// /admin/login queda afuera: es donde se inicia sesión.
const PRIVADO = /^\/(admin(?!\/login)|coordinacion|api\/(panel|comite|coordinacion))(\/|$)/;
// Solo rol admin: la cola de moderación, cuentas, notificaciones y contenido del sitio.
const SOLO_ADMIN = /^\/(admin\/comite|api\/comite)(\/|$)/;
// Coordinación (inscripciones, cuentas nuevas, exportar, avisos): coordinadoras y admin.
const COORDINACION = /^\/(coordinacion|api\/coordinacion)(\/|$)/;

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname, search } = ctx.url;
  ctx.locals.usuario = null;
  ctx.locals.categorias = CATEGORIAS_BASE.map((c) => ({ ...c, oculta: false }));

  const env = ctx.locals.runtime?.env;
  if (!env?.DB || pathname.startsWith('/media/')) return next();
  await asegurarDb(env.DB);
  // Solo las páginas las necesitan (landing, panel, comité); las API las leen si hace falta.
  if (!pathname.startsWith('/api/')) ctx.locals.categorias = await listarCategorias(env.DB);

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
  } else if (sujeto?.tipo === 'coordinadora') {
    // Se valida contra COORDINADORAS en cada request: quitarla o cambiar su clave la saca al instante.
    const c = await coordinadoraDeSesion(env, sujeto.usuario, sujeto.huella);
    if (c) ctx.locals.usuario = usuarioCoordinadora(c);
    else borrarSesion(ctx.cookies);
  }

  const u = ctx.locals.usuario;
  const api = pathname.startsWith('/api/');
  if (!u) {
    if (api) return error('Tu sesión expiró. Vuelve a entrar.', 401);
    return ctx.redirect(`/admin/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (SOLO_ADMIN.test(pathname) && u.rol !== 'admin') {
    if (api) return error('Solo el comité puede hacer esto.', 403);
    return ctx.redirect(u.rol === 'coordinadora' ? '/coordinacion' : '/admin');
  }
  if (COORDINACION.test(pathname) && u.rol === 'vecino') {
    if (api) return error('Solo coordinación y el comité pueden hacer esto.', 403);
    return ctx.redirect('/admin');
  }
  // La coordinadora no tiene emprendimientos ni panel de vecino.
  if (u.rol === 'coordinadora' && !COORDINACION.test(pathname)) {
    if (api) return error('Tu usuario de coordinación no puede hacer esto.', 403);
    return ctx.redirect('/coordinacion');
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
