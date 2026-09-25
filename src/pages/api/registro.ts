// Registro público de vecinos. La cuenta nace en `pending_activation` y el comité la activa
// en /admin/comite/cuentas. No hay login hasta que esté activa.
import type { APIRoute } from 'astro';
import { avisoCuentaNueva } from '../../lib/avisos';
import { hashClave } from '../../lib/auth';
import { crearCuenta } from '../../lib/db';
import { celular, esEmail, esTorre, texto } from '../../lib/validacion';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return redirect('/registro?error=datos', 303);
  // Campo trampa: los humanos no lo ven; si viene lleno es un bot.
  if (texto(form.get('sitio'), 200)) return redirect('/registro/gracias', 303);

  const nombre = texto(form.get('nombre'), 80);
  const torre = form.get('torre');
  const apartamento = texto(form.get('apartamento'), 10);
  const whatsapp = celular(form.get('whatsapp'));
  const email = texto(form.get('email'), 200).toLowerCase();
  const clave = form.get('clave');

  if (!nombre || !esTorre(torre) || !esEmail(email)) return redirect('/registro?error=datos', 303);
  if (whatsapp.length !== 10) return redirect('/registro?error=whatsapp', 303);
  if (typeof clave !== 'string' || clave.length < 8 || clave.length > 200) return redirect('/registro?error=clave', 303);

  const db = locals.runtime.env.DB;
  const creada = await crearCuenta(db, { email, nombre, torre, apartamento, whatsapp }, await hashClave(clave));
  if (!creada) return redirect('/registro?error=existe', 303);

  await avisoCuentaNueva(db, { nombre, torre, apartamento, email });
  return redirect('/registro/gracias', 303);
};
