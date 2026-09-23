// SOLO DESARROLLO: cambia el usuario de prueba del panel.
//   /api/dev/login?as=comite@dev.local   → entra como comité
//   /api/dev/login?salir=1               → vuelve a la landing
// En producción responde 404: allí la sesión la da Cloudflare Zero Trust.
import type { APIRoute } from 'astro';
import { COOKIE_DEV } from '../../../lib/auth';
import { USUARIOS_DEV } from '../../../lib/db';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  if (!import.meta.env.DEV) return new Response('No encontrado', { status: 404 });

  if (url.searchParams.has('salir')) {
    cookies.delete(COOKIE_DEV, { path: '/' });
    return redirect('/');
  }
  const as = (url.searchParams.get('as') ?? '').toLowerCase();
  const usuario = USUARIOS_DEV.find((u) => u.email === as);
  if (!usuario) return new Response(`Usuario dev desconocido. Opciones: ${USUARIOS_DEV.map((u) => u.email).join(', ')}`, { status: 400 });

  cookies.set(COOKIE_DEV, as, { path: '/', httpOnly: true, sameSite: 'lax' });
  return redirect(usuario.rol === 'admin' ? '/admin/comite' : '/admin');
};
