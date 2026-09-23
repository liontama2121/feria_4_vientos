// Utilidades pequeñas para los endpoints de /api.

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
 * El vecino solo el suyo; el comité cualquiera (pasando ?slug= o { slug }).
 */
export function slugEditable(locals: App.Locals, pedido?: unknown): string | null {
  const u = locals.usuario;
  if (!u) return null;
  if (u.rol === 'admin' && typeof pedido === 'string' && pedido) return pedido;
  return u.slug;
}
