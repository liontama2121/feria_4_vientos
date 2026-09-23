// "Publicar cambios": valida, guarda y copia el borrador a la versión pública.
// Si el comité ya aprobó el emprendimiento, aparece en la landing al instante;
// si es un registro nuevo, queda "pendiente" hasta que el comité lo apruebe.
import type { APIRoute } from 'astro';
import { error, json, leerJson, slugEditable } from '../../../lib/api';
import { actualizarCuenta, obtenerRegistro, publicarRegistro, resumenPanel } from '../../../lib/db';
import { sanearDatos, validarPublicacion } from '../../../lib/validacion';

export const POST: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ slug?: string; datos?: unknown }>(request);
  if (!body) return error('No entendimos los datos enviados.');
  const slug = slugEditable(locals, body.slug);
  if (!slug) return error('Tu cuenta no tiene un emprendimiento asignado. Escríbele al comité.', 404);

  const db = locals.runtime.env.DB;
  const registro = await obtenerRegistro(db, slug);
  if (!registro) return error('No encontramos el emprendimiento.', 404);

  const datos = sanearDatos(body.datos, registro.borrador);
  const faltantes = validarPublicacion(datos);
  if (faltantes.length) return error('Faltan algunos datos para publicar.', 422, { faltantes });

  await publicarRegistro(db, slug, datos);
  if (locals.usuario?.slug === slug) {
    await actualizarCuenta(db, locals.usuario.email, { nombre: datos.nombre_vecino, torre: datos.torre, apartamento: datos.apartamento });
  }

  const actualizado = await obtenerRegistro(db, slug);
  return json(resumenPanel(actualizado!));
};
