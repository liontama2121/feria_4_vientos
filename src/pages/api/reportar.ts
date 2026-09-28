// Reporte público de algo grave (estafa, peligro, acoso…): motivo + 1 a 3 fotos de evidencia
// (+ nota opcional). No se pide WhatsApp ni datos de quien reporta. Nunca se publica: llega
// solo al comité (/admin/comite#resenas) con una notificación, y las fotos quedan en R2 bajo
// `reportes/`, que /media NO sirve (solo /api/comite/evidencia, con sesión de admin).
// No oculta nada automáticamente para que nadie pueda tumbar a un vecino a punta de reportes.
import type { APIRoute } from 'astro';
import { error, json } from '../../lib/api';
import { avisoReporte } from '../../lib/avisos';
import { LIMITES, MOTIVOS_REPORTE } from '../../lib/constantes';
import { contarRecientes, crearReporte, obtenerRegistro } from '../../lib/db';
import { guardarImagen } from '../../lib/imagenes';
import { texto } from '../../lib/validacion';
import { haceMs, hashIp, idVisitante } from '../../lib/visitante';

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return error('Faltan datos.');
  if (texto(form.get('sitio'), 200)) return json({ ok: true });

  const slug = texto(form.get('slug'), 120);
  const motivo = texto(form.get('motivo'), 20);
  const fotos = form.getAll('fotos').filter((f): f is File => f instanceof File && f.size > 0);
  if (!MOTIVOS_REPORTE.some((m) => m.id === motivo)) return error('Elige el motivo del reporte.');
  if (!fotos.length) return error('Adjunta al menos una foto como evidencia.');
  if (fotos.length > LIMITES.evidencias) return error(`Máximo ${LIMITES.evidencias} fotos por reporte.`);

  const env = locals.runtime.env;
  const db = env.DB;
  const registro = slug ? await obtenerRegistro(db, slug) : null;
  if (!registro) return error('No encontramos ese emprendimiento.', 404);

  const ip = await hashIp(request, env);
  if ((await contarRecientes(db, 'reportes', ip, haceMs(24 * 60 * 60 * 1000))) >= LIMITES.reportesPorDia) {
    return error('Ya enviaste varios reportes hoy. Si es urgente, escríbele al comité por WhatsApp.', 429);
  }

  const visitante = idVisitante(cookies, url);
  const evidencias: string[] = [];
  for (const foto of fotos) {
    const r = await guardarImagen(env.MEDIA, 'reportes', foto, `visitante:${visitante}`);
    if (!r.ok) {
      // Si una falla, se borran las que ya subieron para no dejar huérfanas.
      await Promise.all(evidencias.map((k) => env.MEDIA.delete(k)));
      return error(r.error, r.status);
    }
    evidencias.push(r.url.replace(/^\/media\//, ''));
  }

  const reporte = await crearReporte(db, { slug, motivo, detalle: texto(form.get('detalle'), LIMITES.detalleReporte), evidencias, visitante, ip });
  await avisoReporte(db, registro, reporte);
  return json({ ok: true });
};
