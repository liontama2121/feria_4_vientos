// Solo navegador: se usa en el panel (fotos del emprendimiento) y en el reporte (evidencias).
import { LIMITES } from './constantes';

/**
 * Reduce a máx. 1200 px y re-codifica a WEBP (o JPEG si el navegador no sabe WEBP).
 * Si aún pesa más del límite, baja calidad y tamaño hasta que quepa.
 */
export async function optimizarFoto(file: File): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const intentos: [number, number][] = [
    [LIMITES.fotoLado, 0.8],
    [LIMITES.fotoLado, 0.65],
    [1000, 0.6],
    [800, 0.55],
  ];
  let mejor: Blob = file;
  try {
    for (const [lado, calidad] of intentos) {
      const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * escala);
      canvas.height = Math.round(bmp.height * escala);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const aBlob = (tipo: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, tipo, calidad));
      let blob = await aBlob('image/webp');
      if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/jpeg');
      if (blob && blob.size < mejor.size) mejor = blob;
      if (mejor.size <= LIMITES.fotoBytes) break;
    }
  } finally {
    bmp.close();
  }
  return mejor;
}
