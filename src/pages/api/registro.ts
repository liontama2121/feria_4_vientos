// Registro público de vecinos. La cuenta nace en `pending_activation` y el comité la activa
// en /admin/comite/cuentas. No hay login hasta que esté activa.
import type { APIRoute } from 'astro';
import { avisoCuentaNueva, avisoInscripcion } from '../../lib/avisos';
import { hashClave } from '../../lib/auth';
import { LIMITES } from '../../lib/constantes';
import { completarBorrador, crearCuenta, crearEmprendimiento, crearInscripcion, listarFechas } from '../../lib/db';
import { aceptaInscripciones } from '../../lib/fechas';
import { celularCO } from '../../lib/ferias';
import { celular, esCategoria, esEmail, esTorre, texto } from '../../lib/validacion';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return redirect('/registro?error=datos', 303);
  const feriaId = texto(form.get('feria'), 80);
  const conFeria = feriaId ? '&feria=' + encodeURIComponent(feriaId) : '';
  // Campo trampa: los humanos no lo ven; si viene lleno es un bot.
  if (texto(form.get('sitio'), 200)) return redirect('/registro/gracias', 303);

  const nombre = texto(form.get('nombre'), 80);
  const torre = form.get('torre');
  const apartamento = texto(form.get('apartamento'), 10);
  const whatsapp = celular(form.get('whatsapp'));
  const email = texto(form.get('email'), 200).toLowerCase();
  const clave = form.get('clave');

  if (!nombre || !esTorre(torre) || !esEmail(email)) return redirect('/registro?error=datos' + conFeria, 303);
  if (whatsapp.length !== 10) return redirect('/registro?error=whatsapp' + conFeria, 303);
  if (typeof clave !== 'string' || clave.length < 8 || clave.length > 200) return redirect('/registro?error=clave' + conFeria, 303);

  const db = locals.runtime.env.DB;
  // Registro desde "Inscribe tu emprendimiento": además de la cuenta, llena su emprendimiento y queda inscrito.
  const feria = feriaId ? (await listarFechas(db)).find((f) => f.id === feriaId && aceptaInscripciones(f)) : undefined;
  const emp = {
    nombre: texto(form.get('nombre_emprendimiento'), 80),
    categoria: texto(form.get('categoria'), 40),
    corta: texto(form.get('descripcion_corta'), LIMITES.descripcionCorta),
    queVende: texto(form.get('que_vende'), 300),
    necesidades: texto(form.get('necesidades'), 300),
  };
  if (!celularCO(whatsapp)) return redirect(`/registro?error=whatsapp${conFeria}`, 303);
  if (feria && (!emp.nombre || !emp.queVende)) return redirect(`/registro?error=emprendimiento${conFeria}`, 303);

  const creada = await crearCuenta(db, { email, nombre, torre, apartamento, whatsapp }, await hashClave(clave));
  if (!creada) return redirect(`/registro?error=existe${conFeria}`, 303);
  await avisoCuentaNueva(db, { nombre, torre, apartamento, email });

  if (feria) {
    const slug = await crearEmprendimiento(db, { nombre_vecino: nombre, torre, apartamento, whatsapp, nombre_emprendimiento: emp.nombre }, email);
    await completarBorrador(db, slug, { categoria: esCategoria(emp.categoria) ? emp.categoria : 'otros', descripcion_corta: emp.corta });
    await crearInscripcion(db, { feria_id: feria.id, slug, email, que_vende: emp.queVende, necesidades: emp.necesidades, conjunto_asignado: null });
    await avisoInscripcion(db, { nombre: emp.nombre, emprendedor: nombre, slug }, feria);
    return redirect('/registro/gracias?feria=1', 303);
  }
  return redirect('/registro/gracias', 303);
};
