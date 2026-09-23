// Autenticación del panel: UN usuario y UNA contraseña del comité, definidos en las
// variables de entorno ADMIN_USER y ADMIN_PASSWORD (Cloudflare Pages → Settings → Variables).
//
// Al entrar se guarda una cookie de sesión firmada con HMAC-SHA256 (7 días). La llave sale
// de la contraseña + SESSION_SECRET: si cambias la contraseña, todas las sesiones se cierran.
//
// En `npm run dev`, si no hay variables (.dev.vars), el acceso es comite / feria4vientos.
import type { AstroCookies } from 'astro';
import type { Usuario } from './db';

export const COOKIE_SESION = 'f4v_sesion';
const DURACION_S = 60 * 60 * 24 * 7;
const enc = new TextEncoder();

function credenciales(env: Env) {
  const user = env.ADMIN_USER?.trim() || (import.meta.env.DEV ? 'comite' : '');
  const pass = env.ADMIN_PASSWORD || (import.meta.env.DEV ? 'feria4vientos' : '');
  return { user, pass };
}

export function authConfigurada(env: Env) {
  const { user, pass } = credenciales(env);
  return !!(user && pass);
}

async function hmac(env: Env, datos: string) {
  const { user, pass } = credenciales(env);
  const llave = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${user}|${pass}|${env.SESSION_SECRET ?? ''}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', llave, enc.encode(datos)));
  return btoa(String.fromCharCode(...firma)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Comparación en tiempo constante (sobre los hashes, así el largo no filtra nada). */
async function iguales(a: string, b: string) {
  const [ha, hb] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function credencialesValidas(env: Env, user: string, pass: string) {
  const c = credenciales(env);
  if (!c.user || !c.pass) return false;
  const [okUser, okPass] = await Promise.all([iguales(user.trim(), c.user), iguales(pass, c.pass)]);
  return okUser && okPass;
}

export async function crearSesion(env: Env) {
  const exp = Math.floor(Date.now() / 1000) + DURACION_S;
  return `${exp}.${await hmac(env, `sesion.${exp}`)}`;
}

export async function sesionValida(env: Env, token: string | undefined) {
  if (!token || !authConfigurada(env)) return false;
  const [exp, firma] = token.split('.');
  if (!exp || !firma || Number(exp) < Date.now() / 1000) return false;
  return iguales(firma, await hmac(env, `sesion.${exp}`));
}

export function opcionesCookie(url: URL) {
  return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: url.protocol === 'https:', maxAge: DURACION_S };
}

export function borrarSesion(cookies: AstroCookies) {
  cookies.delete(COOKIE_SESION, { path: '/' });
}

/** El único usuario del panel: el comité. */
export function usuarioComite(env: Env): Usuario {
  return {
    email: credenciales(env).user,
    nombre: 'Comité de la Feria',
    rol: 'admin',
    torre: null,
    apartamento: '',
    slug: null,
    email_avisos: '',
    creado_at: '',
  };
}
