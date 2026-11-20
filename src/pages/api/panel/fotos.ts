// Fotos del emprendimiento.
// POST: sube una foto a R2. El navegador ya la redujo; aquí se valida tipo real y tamaño.
// PUT: el vecino con el emprendimiento aprobado guarda el orden/lista de fotos y sale directo
// en la landing (sin revisión). En los demás estados las fotos viajan con el borrador.
import type { APIRoute } from 'astro';
import { LIMITES } from '../../../lib/constantes';
import { ERROR_NO_EDITABLE, error, json, leerJson, puedeEditarFotos, registroPermitido } from '../../../lib/api';
import { avisoFotos } from '../../../lib/avisos';
import { cambiarFotosPublicadas, obtenerRegistro, resumenPanel } from '../../../lib/db';
import { guardarImagen } from '../../../lib/imagenes';
import { urlFoto } from '../../../lib/validacion';

export const POST: APIRoute = async ({ locals, request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error('No recibimos la foto.');
  }
  const registro = await registroPermitido(locals, form.get('slug'));
  if (!registro) return error('No encontramos el emprendimiento.', 404);
  if (!puedeEditarFotos(locals, registro)) return error(ERROR_NO_EDITABLE, 409);

  const r = await guardarImagen(locals.runtime.env.MEDIA, `emprendedores/${registro.slug}`, form.get('foto'), locals.usuario?.email ?? '');
  return r.ok ? json({ url: r.url }, 201) : error(r.error, r.status);
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ slug?: string; fotos?: unknown }>(request);
  if (!body || !Array.isArray(body.fotos)) return error('No entendimos las fotos enviadas.');
  const registro = await registroPermitido(locals, body.slug);
  if (!registro) return error('No encontramos el emprendimiento.', 404);
  if (registro.estado !== 'approved') return error('Este cambio solo aplica a emprendimientos ya aprobados.', 409);

  // Solo fotos de su propia carpeta o las que ya tenía (nada de fotos de otro vecino).
  const actuales = [registro.borrador.foto_principal, ...registro.borrador.galeria, registro.publicado?.foto_principal ?? '', ...(registro.publicado?.galeria ?? [])];
  const propia = (u: string) => u.startsWith(`/media/emprendedores/${registro.slug}/`) || actuales.includes(u);
  const fotos = [...new Set(body.fotos.map(urlFoto))].filter((u) => u && propia(u)).slice(0, LIMITES.galeria + 1);
  if (!fotos.length && !registro.borrador.emoji_placeholder) return error('Deja al menos una foto: es la que sale en tu tarjeta.');

  const db = locals.runtime.env.DB;
  if (!(await cambiarFotosPublicadas(db, registro.slug, fotos[0] ?? '', fotos.slice(1)))) return error(ERROR_NO_EDITABLE, 409);
  const actualizado = (await obtenerRegistro(db, registro.slug))!;
  // Un solo aviso pendiente por emprendimiento (reordenar varias veces no llena la bandeja).
  const yaAvisado = await db.prepare(`SELECT 1 FROM notificaciones WHERE slug = ? AND tipo = 'fotos' AND enviada = 0`).bind(registro.slug).first();
  if (locals.usuario?.rol !== 'admin' && !yaAvisado) await avisoFotos(db, actualizado);
  return json(resumenPanel(actualizado));
};
