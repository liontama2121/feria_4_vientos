// El vecino pide abrir OTRO emprendimiento. No se crea nada hasta que el comité lo apruebe
// en /admin/comite#cuentas. Formulario HTML normal (sin JS): vuelve al panel con ?solicitud=.
import type { APIRoute } from 'astro';
import { avisoSolicitud } from '../../../lib/avisos';
import { LIMITES } from '../../../lib/constantes';
import { crearSolicitud, listarDeVecino, listarSolicitudes, obtenerCuenta } from '../../../lib/db';
import { texto } from '../../../lib/validacion';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const u = locals.usuario;
  const form = await request.formData().catch(() => null);
  const volver = texto(form?.get('volver'), 120);
  const destino = (r: string) => redirect(`/admin?${volver ? `slug=${encodeURIComponent(volver)}&` : ''}solicitud=${r}`, 303);
  // El comité no pide permiso: crea directo con "+ Nuevo emprendimiento".
  if (!u || u.rol !== 'vecino' || !form) return destino('error');

  const nombre = texto(form.get('nombre'), 80);
  if (!nombre) return destino('nombre');

  const db = locals.runtime.env.DB;
  const [propios, solicitudes, cuenta] = await Promise.all([listarDeVecino(db, u.email), listarSolicitudes(db, u.email), obtenerCuenta(db, u.email)]);
  if (!cuenta) return destino('error');
  if (solicitudes.some((s) => s.estado === 'pendiente')) return destino('pendiente');
  if (propios.length >= LIMITES.emprendimientosPorVecino) return destino('limite');

  const s = await crearSolicitud(db, u.email, nombre, texto(form.get('motivo'), 300));
  await avisoSolicitud(db, cuenta, s);
  return destino('ok');
};
