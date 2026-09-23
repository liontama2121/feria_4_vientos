// Guarda el borrador (auto-save cada 30 s y botón "Guardar borrador"). No publica.
import type { APIRoute } from 'astro';
import { error, json, leerJson, slugEditable } from '../../../lib/api';
import { guardarBorrador, obtenerRegistro, resumenPanel } from '../../../lib/db';
import { sanearDatos } from '../../../lib/validacion';

export const PUT: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ slug?: string; datos?: unknown }>(request);
  if (!body) return error('No entendimos los datos enviados.');
  const slug = slugEditable(locals, body.slug);
  if (!slug) return error('Falta indicar qué emprendimiento editar.', 404);

  const db = locals.runtime.env.DB;
  const registro = await obtenerRegistro(db, slug);
  if (!registro) return error('No encontramos el emprendimiento.', 404);

  const datos = sanearDatos(body.datos, registro.borrador);
  await guardarBorrador(db, slug, datos);

  const actualizado = await obtenerRegistro(db, slug);
  return json(resumenPanel(actualizado!));
};
