// Cierra la sesión del panel.
import type { APIRoute } from 'astro';
import { borrarSesion } from '../../lib/auth';

export const GET: APIRoute = async ({ cookies, redirect }) => {
  borrarSesion(cookies);
  return redirect('/', 303);
};
