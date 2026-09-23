// "Publicar cambios": valida, guarda y copia el borrador a la versión pública.
// Si el emprendimiento está aprobado, aparece en la landing al instante.
import type { APIRoute } from 'astro';
import { error, json, leerJson, slugEditable } from '../../../lib/api';
import { obtenerRegistro, publicarRegistro, resumenPanel } from '../../../lib/db';
import { sanearDatos, validarPublicacion } from '../../../lib/validacion';

export const POST: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ slug?: string; datos?: unknown }>(request);
  if (!body) return error('No entendimos los datos enviados.');
  const slug = slugEditable(locals, body.slug);
  if (!slug) return error('Falta indicar qué emprendimiento editar.', 404);

  const db = locals.runtime.env.DB;
  const registro = await obtenerRegistro(db, slug);
  if (!registro) return error('No encontramos el emprendimiento.', 404);

  const datos = sanearDatos(body.datos, registro.borrador);
  const faltantes = validarPublicacion(datos);
  if (faltantes.length) return error('Faltan algunos datos para publicar.', 422, { faltantes });

  await publicarRegistro(db, slug, datos);

  const actualizado = await obtenerRegistro(db, slug);
  return json(resumenPanel(actualizado!));
};
