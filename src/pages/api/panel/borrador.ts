// Guarda el borrador (auto-save cada 30 s y botón "Guardar borrador"). No publica ni envía.
// El vecino solo puede guardar en draft o changes_requested.
import type { APIRoute } from 'astro';
import { ERROR_NO_EDITABLE, error, json, leerJson, puedeEditar, registroPermitido } from '../../../lib/api';
import { guardarBorrador, obtenerRegistro, resumenPanel } from '../../../lib/db';
import { sanearDatosPara } from '../../../lib/validacion';

export const PUT: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ slug?: string; datos?: unknown }>(request);
  if (!body) return error('No entendimos los datos enviados.');
  const registro = await registroPermitido(locals, body.slug);
  if (!registro) return error('No encontramos el emprendimiento.', 404);
  if (!puedeEditar(locals, registro)) return error(ERROR_NO_EDITABLE, 409);

  const db = locals.runtime.env.DB;
  await guardarBorrador(db, registro.slug, sanearDatosPara(locals, body.datos, registro.borrador));

  const actualizado = await obtenerRegistro(db, registro.slug);
  return json(resumenPanel(actualizado!));
};
