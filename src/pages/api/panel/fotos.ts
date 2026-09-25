// Subida de fotos del emprendimiento a R2. El navegador ya las redujo (máx. 1600 px);
// aquí se valida tipo real y tamaño antes de guardar.
import type { APIRoute } from 'astro';
import { ERROR_NO_EDITABLE, error, json, puedeEditar, registroPermitido } from '../../../lib/api';
import { guardarImagen } from '../../../lib/imagenes';

export const POST: APIRoute = async ({ locals, request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error('No recibimos la foto.');
  }
  const registro = await registroPermitido(locals, form.get('slug'));
  if (!registro) return error('No encontramos el emprendimiento.', 404);
  if (!puedeEditar(locals, registro)) return error(ERROR_NO_EDITABLE, 409);

  const r = await guardarImagen(locals.runtime.env.MEDIA, `emprendedores/${registro.slug}`, form.get('foto'), locals.usuario?.email ?? '');
  return r.ok ? json({ url: r.url }, 201) : error(r.error, r.status);
};
