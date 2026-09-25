// Sirve las imágenes guardadas en R2 (binding MEDIA): fotos de emprendedores y logos.
import type { APIRoute } from 'astro';
import { KEY_VALIDA } from '../../lib/imagenes';

export const GET: APIRoute = async ({ params, locals, request }) => {
  const key = params.key ?? '';
  if (!KEY_VALIDA.test(key)) return new Response('No encontrado', { status: 404 });

  const obj = await locals.runtime.env.MEDIA.get(key);
  if (!obj) return new Response('No encontrado', { status: 404 });

  const headers = new Headers({
    'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: obj.httpEtag,
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.headers.get('if-none-match') === obj.httpEtag) return new Response(null, { status: 304, headers });

  // Las fotos pesan máx. 800 KB (logos 1 MB): leerlas completas funciona igual en producción y en el proxy de `astro dev`.
  return new Response(await obj.arrayBuffer(), { headers });
};
