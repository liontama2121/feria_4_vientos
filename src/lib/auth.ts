// Autenticación del panel. Hay dos formas de entrar:
//
// 1. Usuario del comité: ADMIN_USER / ADMIN_PASSWORD (variables de entorno). Siempre es admin.
//    Es la llave maestra: con ella se activan las primeras cuentas.
// 2. Cuenta de vecino (tabla `cuentas`, creada en /registro y activada por el comité).
//    Entra con correo + contraseña. Si el correo está en ADMIN_EMAILS, su rol es admin.
//
// La sesión es una cookie firmada con HMAC-SHA256 (7 días) que guarda QUIÉN es (`comite` o
// `c:<correo>`). La llave sale de ADMIN_USER + ADMIN_PASSWORD + SESSION_SECRET: si cambias la
// contraseña del comité, todas las sesiones (también las de vecinos) se cierran.
// El rol y el estado de la cuenta se leen de D1 en cada request, así desactivar una cuenta
// la saca al instante.
//
// En `npm run dev`, si no hay variables (.dev.vars), el comité es comite / feria4vientos.
import type { AstroCookies } from 'astro';
import type { Cuenta, Rol, Usuario } from './db';

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

/** Correos con rol admin, separados por coma o espacio en ADMIN_EMAILS. */
export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function rolDeEmail(env: Env, email: string): Rol {
  return adminEmails(env).includes(email.toLowerCase()) ? 'admin' : 'vecino';
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(env: Env, datos: string) {
  const { user, pass } = credenciales(env);
  const llave = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${user}|${pass}|${env.SESSION_SECRET ?? ''}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', llave, enc.encode(datos))));
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

// ───────────────────────── Contraseñas de vecinos ─────────────────────────
// PBKDF2-SHA256 con 100 000 iteraciones (el máximo que acepta Workers) y sal aleatoria.

const ITERACIONES = 100_000;

async function derivar(clave: string, sal: Uint8Array<ArrayBuffer>, iteraciones: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, base, 256);
  return b64url(new Uint8Array(bits));
}

export async function hashClave(clave: string) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACIONES}$${b64url(sal)}$${await derivar(clave, sal, ITERACIONES)}`;
}

export async function verificarClave(clave: string, guardado: string) {
  const [alg, it, sal, hash] = guardado.split('$');
  if (alg !== 'pbkdf2' || !it || !sal || !hash) return false;
  return iguales(await derivar(clave, deB64url(sal), Number(it)), hash);
}

// ───────────────────────── Sesión ─────────────────────────

export type Sujeto = { tipo: 'comite' } | { tipo: 'cuenta'; email: string };

export async function crearSesion(env: Env, sujeto: Sujeto) {
  const exp = Math.floor(Date.now() / 1000) + DURACION_S;
  const quien = b64url(enc.encode(sujeto.tipo === 'comite' ? 'comite' : `c:${sujeto.email}`));
  return `${exp}.${quien}.${await hmac(env, `sesion.${exp}.${quien}`)}`;
}

export async function leerSesion(env: Env, token: string | undefined): Promise<Sujeto | null> {
  if (!token || !authConfigurada(env)) return null;
  const [exp, quien, firma] = token.split('.');
  if (!exp || !quien || !firma || Number(exp) < Date.now() / 1000) return null;
  if (!(await iguales(firma, await hmac(env, `sesion.${exp}.${quien}`)))) return null;
  const s = new TextDecoder().decode(deB64url(quien));
  if (s === 'comite') return { tipo: 'comite' };
  return s.startsWith('c:') ? { tipo: 'cuenta', email: s.slice(2) } : null;
}

export function opcionesCookie(url: URL) {
  return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: url.protocol === 'https:', maxAge: DURACION_S };
}

export function borrarSesion(cookies: AstroCookies) {
  cookies.delete(COOKIE_SESION, { path: '/' });
}

/** El usuario maestro del comité (ADMIN_USER). */
export function usuarioComite(env: Env): Usuario {
  return { email: credenciales(env).user, nombre: 'Comité de la Feria', rol: 'admin', torre: null, apartamento: '', whatsapp: '' };
}

export function usuarioDeCuenta(env: Env, c: Cuenta): Usuario {
  return { email: c.email, nombre: c.nombre, rol: rolDeEmail(env, c.email), torre: c.torre, apartamento: c.apartamento, whatsapp: c.whatsapp };
}
