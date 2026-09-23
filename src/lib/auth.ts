// Autenticación del panel.
//
// Producción: Cloudflare Zero Trust (Access) se pone delante de /admin y /api/panel|comite
// con login de Google. Access agrega el header `Cf-Access-Jwt-Assertion` (y la cookie
// CF_Authorization); aquí verificamos esa firma contra las llaves públicas del equipo y
// sacamos el email. El ROL sale de D1 (tabla usuarios) o de la variable ADMIN_EMAILS.
//
// Desarrollo (`npm run dev`): no hay Access. Se usa un usuario de prueba elegido con la
// cookie `f4v_dev_as` (por defecto aleida@dev.local). Esto NO existe en el build de producción
// porque `import.meta.env.DEV` es false y el bloque se elimina al compilar.
import type { AstroCookies } from 'astro';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { obtenerUsuario, type Usuario } from './db';

export const COOKIE_DEV = 'f4v_dev_as';
export const USUARIO_DEV_POR_DEFECTO = 'aleida@dev.local';

type JWKS = ReturnType<typeof createRemoteJWKSet>;
const jwksPorEquipo = new Map<string, JWKS>();

function jwks(equipo: string) {
  let set = jwksPorEquipo.get(equipo);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${equipo}/cdn-cgi/access/certs`));
    jwksPorEquipo.set(equipo, set);
  }
  return set;
}

/** Email verificado de quien hace el request, o null. */
export async function identidad(request: Request, env: Env, cookies: AstroCookies): Promise<string | null> {
  if (import.meta.env.DEV) {
    return (cookies.get(COOKIE_DEV)?.value || USUARIO_DEV_POR_DEFECTO).toLowerCase();
  }
  const equipo = env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  // Puede haber varias apps de Access (panel y comité): AUDs separados por coma.
  const aud = (env.CF_ACCESS_AUD ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  if (!equipo || !aud.length) return null;
  const token = request.headers.get('cf-access-jwt-assertion') || cookies.get('CF_Authorization')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks(equipo), { issuer: `https://${equipo}`, audience: aud });
    return typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function esAdminPorEntorno(email: string, env: Env) {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

/** Usuario de la base, con rol admin forzado si su email está en ADMIN_EMAILS. */
export async function resolverUsuario(db: D1Database, email: string, env: Env): Promise<Usuario | null> {
  const u = await obtenerUsuario(db, email);
  if (esAdminPorEntorno(email, env)) {
    return (
      (u && { ...u, rol: 'admin' }) ?? {
        email,
        nombre: 'Comité',
        rol: 'admin',
        torre: null,
        apartamento: '',
        slug: null,
        email_avisos: email,
        creado_at: new Date().toISOString(),
      }
    );
  }
  return u;
}

export function urlCerrarSesion() {
  return import.meta.env.DEV ? '/api/dev/login?salir=1' : '/cdn-cgi/access/logout';
}
