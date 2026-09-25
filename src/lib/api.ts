// Utilidades pequeñas para los endpoints de /api.
import { ESTADOS_EDITABLES } from './constantes';
import { obtenerRegistro, registroDeVecino, type Registro } from './db';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function error(mensaje: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ error: mensaje, ...extra }, status);
}

export async function leerJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Qué emprendimiento puede tocar quien hace el request.
 * El admin, cualquiera (pasando ?slug= o { slug }); el vecino, solo el suyo (el slug pedido se ignora).
 */
export async function registroPermitido(locals: App.Locals, pedido?: unknown): Promise<Registro | null> {
  const u = locals.usuario;
  const db = locals.runtime.env.DB;
  if (!u) return null;
  if (u.rol === 'admin') return typeof pedido === 'string' && pedido ? obtenerRegistro(db, pedido) : null;
  return registroDeVecino(db, u.email);
}

/** El vecino solo edita en draft o changes_requested. El admin siempre. */
export function puedeEditar(locals: App.Locals, r: Registro) {
  return locals.usuario?.rol === 'admin' || ESTADOS_EDITABLES.includes(r.estado);
}

export const ERROR_NO_EDITABLE =
  'Tu emprendimiento ya se envió al comité y no se puede editar. Si necesitas un cambio, escríbele al comité por WhatsApp.';
