// "Enviar a revisión" (vecino): valida, guarda y pasa a pending_review. Desde ahí el
// formulario queda bloqueado hasta que el comité apruebe, rechace o pida cambios.
import type { APIRoute } from 'astro';
import { ERROR_NO_EDITABLE, error, json, leerJson, registroPermitido } from '../../../lib/api';
import { avisoEnvio } from '../../../lib/avisos';
import { enviarARevision, obtenerRegistro, resumenPanel } from '../../../lib/db';
import { sanearDatosPara, validarPublicacion } from '../../../lib/validacion';

export const POST: APIRoute = async ({ locals, request }) => {
  if (locals.usuario?.rol !== 'vecino') return error('El comité publica directo con “Publicar cambios”.', 403);
  const body = await leerJson<{ datos?: unknown }>(request);
  if (!body) return error('No entendimos los datos enviados.');
  const registro = await registroPermitido(locals);
  if (!registro) return error('No encontramos tu emprendimiento.', 404);

  const datos = sanearDatosPara(locals, body.datos, registro.borrador);
  const faltantes = validarPublicacion(datos);
  if (faltantes.length) return error('Faltan algunos datos para enviar.', 422, { faltantes });

  const db = locals.runtime.env.DB;
  if (!(await enviarARevision(db, registro.slug, datos))) return error(ERROR_NO_EDITABLE, 409);

  const actualizado = (await obtenerRegistro(db, registro.slug))!;
  await avisoEnvio(db, actualizado);
  return json(resumenPanel(actualizado));
};
