// Guarda el borrador (auto-save cada 30 s y botón "Guardar borrador"). No publica.
import type { APIRoute } from 'astro';
import { error, json, leerJson, slugEditable } from '../../../lib/api';
import { actualizarCuenta, guardarBorrador, obtenerRegistro, resumenPanel } from '../../../lib/db';
import { sanearDatos } from '../../../lib/validacion';

export const PUT: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ slug?: string; datos?: unknown }>(request);
  if (!body) return error('No entendimos los datos enviados.');
  const slug = slugEditable(locals, body.slug);
  if (!slug) return error('Tu cuenta no tiene un emprendimiento asignado. Escríbele al comité.', 404);

  const db = locals.runtime.env.DB;
  const registro = await obtenerRegistro(db, slug);
  if (!registro) return error('No encontramos el emprendimiento.', 404);

  const datos = sanearDatos(body.datos, registro.borrador);
  await guardarBorrador(db, slug, datos);

  // Mantener la cuenta del dueño al día con lo que escribe (chip del topbar, filtros del comité).
  if (locals.usuario?.slug === slug) {
    await actualizarCuenta(db, locals.usuario.email, { nombre: datos.nombre_vecino, torre: datos.torre, apartamento: datos.apartamento });
  }

  const actualizado = await obtenerRegistro(db, slug);
  return json(resumenPanel(actualizado!));
};
