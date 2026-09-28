// Calificación pública (sin cuenta): 1 a 5 estrellas + comentario opcional. Sale al instante;
// el comité puede ocultarla en /admin/comite#resenas. Una por navegador y emprendimiento.
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../lib/api';
import { LIMITES, TORRES_BASE } from '../../lib/constantes';
import { contarRecientes, guardarCalificacion, listarPublicos, resumenCalificaciones } from '../../lib/db';
import { esTorre, texto } from '../../lib/validacion';
import { haceMs, hashIp, idVisitante } from '../../lib/visitante';

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const body = await leerJson<Record<string, unknown>>(request);
  if (!body) return error('Faltan datos.');
  // Campo trampa: los humanos no lo ven; si viene lleno es un bot. Se responde "ok" sin guardar.
  if (texto(body.sitio, 200)) return json({ ok: true });

  const slug = texto(body.slug, 120);
  const estrellas = Number(body.estrellas);
  if (!slug || !Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) return error('Elige de 1 a 5 estrellas.');

  const env = locals.runtime.env;
  const db = env.DB;
  // Solo se califica lo que está publicado en la landing.
  if (!(await listarPublicos(db)).some((e) => e.slug === slug)) return error('Ese emprendimiento no está publicado.', 404);

  const ip = await hashIp(request, env);
  if ((await contarRecientes(db, 'calificaciones', ip, haceMs(60 * 60 * 1000))) >= LIMITES.calificacionesPorHora) {
    return error('Has enviado muchas calificaciones seguidas. Intenta más tarde.', 429);
  }

  const actualizada = await guardarCalificacion(db, {
    slug,
    estrellas,
    nombre: texto(body.nombre, 60),
    conjunto: esTorre(body.conjunto) ? TORRES_BASE[body.conjunto].nombre : '',
    comentario: texto(body.comentario, LIMITES.comentario),
    visitante: idVisitante(cookies, url),
    ip,
  });
  const resumen = (await resumenCalificaciones(db, slug))[slug] ?? { promedio: 0, total: 0, resenas: [] };
  return json({ ok: true, actualizada, resumen });
};
