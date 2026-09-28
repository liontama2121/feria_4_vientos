// Identidad anónima de quien califica o reporta sin cuenta.
// - Cookie `f4v_visitante`: un id al azar por navegador; con ella "una calificación por
//   navegador y emprendimiento" (volver a calificar la reemplaza).
// - Hash de la IP: nunca se guarda la IP en claro; solo sirve para frenar ráfagas de alguien
//   que borra cookies (LIMITES.calificacionesPorHora / reportesPorDia).
import type { AstroCookies } from 'astro';

const COOKIE = 'f4v_visitante';
const UN_ANIO_S = 60 * 60 * 24 * 365;

export function idVisitante(cookies: AstroCookies, url: URL) {
  const actual = cookies.get(COOKIE)?.value;
  if (actual && /^[0-9a-f-]{36}$/.test(actual)) return actual;
  const nuevo = crypto.randomUUID();
  cookies.set(COOKIE, nuevo, { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: UN_ANIO_S });
  return nuevo;
}

export async function hashIp(request: Request, env: Env) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const datos = new TextEncoder().encode(`f4v|${ip}|${env.SESSION_SECRET ?? ''}|${env.ADMIN_PASSWORD ?? ''}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', datos));
  return Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** ISO de hace `ms` milisegundos, para comparar con `creado_at`. */
export const haceMs = (ms: number) => new Date(Date.now() - ms).toISOString();
