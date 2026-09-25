// Guardado de imágenes en R2 (fotos de emprendedores y logos de patrocinadores).
import { FORMATOS_FOTO, LIMITES } from './constantes';

type Formato = (typeof FORMATOS_FOTO)[number];

const EXTENSION: Record<Formato, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Tipo real según los bytes mágicos: no confiamos en el content-type del navegador. */
function tipoReal(b: Uint8Array): Formato | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const riff = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46;
  const webp = b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return riff && webp ? 'image/webp' : null;
}

/** Rutas válidas dentro del bucket. Debe coincidir con lo que sirve src/pages/media/[...key].ts */
export const KEY_VALIDA = /^(emprendedores\/[\w-]+|patrocinadores)\/[\w-]+\.(jpg|png|webp)$/;

export type ResultadoImagen = { ok: true; url: string } | { ok: false; error: string; status: number };

const enKB = (b: number) => (b >= 1024 * 1024 ? `${b / 1024 / 1024} MB` : `${Math.round(b / 1024)} KB`);

export async function guardarImagen(
  bucket: R2Bucket,
  carpeta: string,
  archivo: FormDataEntryValue | null,
  subidoPor: string,
  maxBytes: number = LIMITES.fotoBytes,
): Promise<ResultadoImagen> {
  if (!(archivo instanceof File)) return { ok: false, error: 'No recibimos la imagen.', status: 400 };
  if (archivo.size > maxBytes) return { ok: false, error: `La imagen pesa más de ${enKB(maxBytes)}. Prueba con otra foto.`, status: 413 };

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoReal(bytes);
  if (!tipo) return { ok: false, error: 'Formato no válido. Usa JPG, PNG o WEBP.', status: 415 };

  const key = `${carpeta}/${crypto.randomUUID()}.${EXTENSION[tipo]}`;
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: tipo, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { subidoPor, nombreOriginal: archivo.name.slice(0, 120) },
  });
  return { ok: true, url: `/media/${key}` };
}
