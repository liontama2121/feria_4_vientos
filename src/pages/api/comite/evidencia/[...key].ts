// Fotos de evidencia de los reportes. Solo admin (lo garantiza el middleware por estar bajo
// /api/comite); /media no las sirve porque `reportes/` no está en KEY_VALIDA.
import type { APIRoute } from 'astro';

const KEY_EVIDENCIA = /^reportes\/[\w-]+\.(jpg|png|webp)$/;

export const GET: APIRoute = async ({ params, locals }) => {
  const key = params.key ?? '';
  if (!KEY_EVIDENCIA.test(key)) return new Response('No encontrado', { status: 404 });
  const obj = await locals.runtime.env.MEDIA.get(key);
  if (!obj) return new Response('No encontrado', { status: 404 });
  return new Response(await obj.arrayBuffer(), {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
