// Subida de fotos del emprendimiento a R2. El navegador ya las redujo (máx. 1600 px);
// aquí se valida tipo real y tamaño antes de guardar.
import type { APIRoute } from 'astro';
import { error, json, slugEditable } from '../../../lib/api';
import { obtenerRegistro } from '../../../lib/db';
import { guardarImagen } from '../../../lib/imagenes';

export const POST: APIRoute = async ({ locals, request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error('No recibimos la foto.');
  }
  const slug = slugEditable(locals, form.get('slug'));
  if (!slug) return error('Falta indicar qué emprendimiento editar.', 404);
  if (!(await obtenerRegistro(locals.runtime.env.DB, slug))) return error('No encontramos el emprendimiento.', 404);

  const r = await guardarImagen(locals.runtime.env.MEDIA, `emprendedores/${slug}`, form.get('foto'), locals.usuario?.email ?? '');
  return r.ok ? json({ url: r.url }, 201) : error(r.error, r.status);
};
