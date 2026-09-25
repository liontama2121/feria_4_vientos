// "Publicar cambios" (solo admin): valida, guarda y copia el borrador a la versión pública.
// Equivale a aprobar: deja el emprendimiento `approved` y sale en la landing al instante.
import type { APIRoute } from 'astro';
import { error, json, leerJson, registroPermitido } from '../../../lib/api';
import { avisoAprobado } from '../../../lib/avisos';
import { aprobarRegistro, obtenerRegistro, resumenPanel } from '../../../lib/db';
import { sanearDatosPara, validarPublicacion } from '../../../lib/validacion';

export const POST: APIRoute = async ({ locals, request, url }) => {
  if (locals.usuario?.rol !== 'admin') return error('Solo el comité publica. Usa “Enviar a revisión”.', 403);
  const body = await leerJson<{ slug?: string; datos?: unknown }>(request);
  if (!body) return error('No entendimos los datos enviados.');
  const registro = await registroPermitido(locals, body.slug);
  if (!registro) return error('No encontramos el emprendimiento.', 404);

  const datos = sanearDatosPara(locals, body.datos, registro.borrador);
  const faltantes = validarPublicacion(datos);
  if (faltantes.length) return error('Faltan algunos datos para publicar.', 422, { faltantes });

  const db = locals.runtime.env.DB;
  await aprobarRegistro(db, registro.slug, datos, locals.usuario.email);
  const actualizado = (await obtenerRegistro(db, registro.slug))!;
  // Si era una solicitud de un vecino, publicarla desde el editor también cuenta como aprobarla.
  const notificacion = registro.estado !== 'approved' && registro.owner_email ? await avisoAprobado(db, actualizado, url.origin) : null;
  return json({ ...resumenPanel(actualizado), notificacion });
};
