// Subida del logo real de un patrocinador (reemplaza el emoji de placeholder).
import type { APIRoute } from 'astro';
import { error, json } from '../../../lib/api';
import { guardarImagen } from '../../../lib/imagenes';

export const POST: APIRoute = async ({ locals, request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error('No recibimos el logo.');
  }
  const r = await guardarImagen(locals.runtime.env.MEDIA, 'patrocinadores', form.get('logo'), locals.usuario!.email);
  return r.ok ? json({ url: r.url }, 201) : error(r.error, r.status);
};
