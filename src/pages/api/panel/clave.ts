// El vecino cambia su contraseña desde el panel. Si entró con la clave temporal del reset
// (cookie COOKIE_TEMPORAL), no se le pide la actual: se verifica que siga siendo la temporal.
import type { APIRoute } from 'astro';
import { CLAVE_TEMPORAL, COOKIE_TEMPORAL, hashClave, verificarClave } from '../../../lib/auth';
import { obtenerCuentaConClave, ponerClave } from '../../../lib/db';

export const POST: APIRoute = async ({ request, locals, redirect, cookies }) => {
  const u = locals.usuario!;
  const temporal = cookies.get(COOKIE_TEMPORAL)?.value === '1';
  const form = await request.formData().catch(() => null);
  const actual = temporal ? CLAVE_TEMPORAL : String(form?.get('actual') ?? '');
  const clave = form?.get('clave');
  const clave2 = form?.get('clave2');
  const volver = (e: string) => redirect(`/admin/clave?error=${e}${temporal ? '&temporal=1' : ''}`, 303);

  const db = locals.runtime.env.DB;
  const cuenta = await obtenerCuentaConClave(db, u.email);
  if (!cuenta) return volver('sin_cuenta');
  if (typeof clave !== 'string' || clave.length < 8 || clave.length > 200) return volver('corta');
  if (clave !== clave2) return volver('distintas');
  if (clave === CLAVE_TEMPORAL) return volver('temporal');
  if (!(await verificarClave(actual, cuenta.clave))) {
    await new Promise((r) => setTimeout(r, 800));
    return volver(temporal ? 'ya_cambiada' : 'actual');
  }

  await ponerClave(db, u.email, await hashClave(clave));
  cookies.delete(COOKIE_TEMPORAL, { path: '/' });
  return redirect(u.rol === 'admin' ? '/admin/comite' : '/admin?clave=ok', 303);
};
