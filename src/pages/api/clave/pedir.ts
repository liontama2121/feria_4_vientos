// "Olvidé mi contraseña": el vecino pide el cambio y el comité lo autoriza en /admin/comite#cuentas.
// Siempre responde lo mismo, exista o no el correo, para no revelar quién tiene cuenta.
import type { APIRoute } from 'astro';
import { avisoClavePedida } from '../../../lib/avisos';
import { obtenerCuenta, pedirCambioClave } from '../../../lib/db';
import { esEmail, texto } from '../../../lib/validacion';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData().catch(() => null);
  const listo = redirect('/clave?enviado=1', 303);
  if (!form || texto(form.get('sitio'), 200)) return listo;
  const email = texto(form.get('email'), 200).toLowerCase();
  if (!esEmail(email)) return redirect('/clave?error=correo', 303);

  const db = locals.runtime.env.DB;
  const cuenta = await obtenerCuenta(db, email);
  if (cuenta?.estado === 'active' && (await pedirCambioClave(db, email))) await avisoClavePedida(db, cuenta);
  return listo;
};
