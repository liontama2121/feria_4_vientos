// Excel de inscritos a una feria (coordinadoras y comité).
// GET  ?feria=<id>            → descarga .xlsx con la columna "Conjunto asignado" para llenar.
// POST multipart feria+archivo → lee el Excel diligenciado y devuelve la VISTA PREVIA
//                               (cambios y errores). No guarda nada: los cambios se aplican
//                               después con PATCH /api/coordinacion/inscripciones { accion: 'ubicar' }.
import type { APIRoute } from 'astro';
import { error, json } from '../../../lib/api';
import { categoria as cat, type TorreId } from '../../../lib/constantes';
import { listarCategorias, listarFechas, listarInscripciones, listarTorres } from '../../../lib/db';
import { ETIQUETA_INSCRIPCION, conjuntoDeTexto } from '../../../lib/ferias';
import { escribirXlsx, leerXlsx } from '../../../lib/xlsx';

const ENCABEZADO = ['ID de inscripción', 'Emprendimiento', 'Emprendedor', 'Conjunto de origen', 'Categoría', 'Qué vende', 'WhatsApp', 'Estado', 'En bloque con', 'Conjunto asignado'];
const MAX_BYTES = 2 * 1024 * 1024;

/** "ID de inscripción" → "iddeinscripcion": así da igual si Excel cambió mayúsculas o tildes. */
const norma = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

export const GET: APIRoute = async ({ locals, url }) => {
  const db = locals.runtime.env.DB;
  const feria = (await listarFechas(db)).find((f) => f.id === url.searchParams.get('feria'));
  if (!feria) return error('Elige una feria.', 404);
  const [inscripciones, torres, categorias] = await Promise.all([listarInscripciones(db, feria.id), listarTorres(db), listarCategorias(db)]);
  const nombre = (id: string | null) => (id ? (torres.find((t) => t.id === id)?.nombre ?? id) : '');
  const filas = inscripciones.map((i) => [
    i.id,
    i.nombre,
    i.emprendedor,
    nombre(i.conjunto_origen),
    cat(i.categoria, categorias).label,
    i.que_vende || i.descripcion,
    i.whatsapp ? `+57 ${i.whatsapp}` : '',
    ETIQUETA_INSCRIPCION[i.estado],
    i.grupo
      ? inscripciones
          .filter((x) => x.grupo === i.grupo && x.id !== i.id)
          .map((x) => x.nombre)
          .join(', ')
      : '',
    nombre(i.conjunto_asignado),
  ]);
  const datos = escribirXlsx({
    nombre: 'Inscritos',
    encabezado: ENCABEZADO,
    filas,
    anchos: [38, 28, 24, 18, 16, 36, 16, 30, 26, 20],
    paraLlenar: [9],
  });
  const archivo = `inscritos-${feria.fecha}-${feria.titulo.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}.xlsx`.replace(/-+/g, '-');
  return new Response(datos, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${archivo}"`,
      'Cache-Control': 'no-store',
    },
  });
};

export interface CambioExcel {
  id: string;
  fila: number;
  nombre: string;
  emprendedor: string;
  de: TorreId | null;
  a: TorreId;
}
export interface ErrorExcel {
  fila: number;
  id: string;
  mensaje: string;
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.runtime.env.DB;
  const form = await request.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const feria = (await listarFechas(db)).find((f) => f.id === form?.get('feria'));
  if (!feria) return error('Elige la feria.', 404);
  if (!(archivo instanceof File) || !archivo.size) return error('Adjunte el Excel (.xlsx) diligenciado.');
  if (archivo.size > MAX_BYTES) return error('El archivo pesa más de 2 MB. ¿Es el Excel que descargó de aquí?');

  let tabla: string[][];
  try {
    tabla = await leerXlsx(new Uint8Array(await archivo.arrayBuffer()));
  } catch (e) {
    return error((e as Error).message || 'No pudimos leer el Excel.');
  }
  const encabezado = (tabla[0] ?? []).map(norma);
  const colId = encabezado.indexOf(norma(ENCABEZADO[0]));
  const colConjunto = encabezado.indexOf(norma('Conjunto asignado'));
  if (colId < 0 || colConjunto < 0) return error('No encontramos las columnas "ID de inscripción" y "Conjunto asignado". Use el Excel que descargó de aquí.');

  const actuales = new Map((await listarInscripciones(db, feria.id)).map((i) => [i.id, i]));
  // Ocupación actual por conjunto, para avisar en la vista previa si un cambio se pasa del cupo.
  const ocupados: Partial<Record<TorreId, number>> = {};
  for (const i of actuales.values()) if (i.conjunto_asignado && i.estado !== 'rechazada') ocupados[i.conjunto_asignado] = (ocupados[i.conjunto_asignado] ?? 0) + 1;

  const cambios: CambioExcel[] = [];
  const errores: ErrorExcel[] = [];
  const vistos = new Set<string>();
  let sinCambios = 0;
  let leidas = 0;
  tabla.slice(1).forEach((f, idx) => {
    const fila = idx + 2;
    const id = (f[colId] ?? '').trim();
    const valor = (f[colConjunto] ?? '').trim();
    if (!id && !valor) return; // fila vacía
    leidas++;
    const ins = actuales.get(id);
    if (!ins) return errores.push({ fila, id, mensaje: id ? 'Ese ID no es una inscripción de esta feria.' : 'Falta el ID de inscripción.' });
    if (vistos.has(id)) return errores.push({ fila, id, mensaje: `${ins.nombre} aparece repetido.` });
    vistos.add(id);
    if (!valor) return sinCambios++; // en blanco = no se toca
    const a = conjuntoDeTexto(valor);
    if (!a) return errores.push({ fila, id, mensaje: `"${valor}" no es un conjunto. Use Mistral, Gregal, Austro o Cierzo.` });
    if (feria.conjuntos?.length && !feria.conjuntos.includes(a)) return errores.push({ fila, id, mensaje: `${valor} no participa en esta feria.` });
    if (ins.estado === 'rechazada') return errores.push({ fila, id, mensaje: `${ins.nombre} está rechazado.` });
    if (ins.conjunto_asignado === a) return sinCambios++;
    const cupo = feria.cupos?.[a] ?? 0;
    if (cupo > 0 && (ocupados[a] ?? 0) >= cupo) return errores.push({ fila, id, mensaje: `${ins.nombre}: ${valor} ya no tiene cupos (${cupo}).` });
    ocupados[a] = (ocupados[a] ?? 0) + 1;
    if (ins.conjunto_asignado) ocupados[ins.conjunto_asignado] = (ocupados[ins.conjunto_asignado] ?? 1) - 1;
    cambios.push({ id, fila, nombre: ins.nombre, emprendedor: ins.emprendedor, de: ins.conjunto_asignado, a });
  });
  // Solicitudes en bloque: si mueven uno, el otro lo sigue al mismo conjunto; si el Excel los
  // separa en conjuntos distintos, es un error (van juntos).
  for (const c of [...cambios]) {
    const g = actuales.get(c.id)!.grupo;
    if (!g) continue;
    const choque = cambios.find((x) => x.id !== c.id && actuales.get(x.id)!.grupo === g && x.a !== c.a);
    if (choque) {
      errores.push({ fila: c.fila, id: c.id, mensaje: `${c.nombre} va en bloque con ${choque.nombre}: deben quedar en el mismo conjunto.` });
      for (let k = cambios.length - 1; k >= 0; k--) if (actuales.get(cambios[k].id)!.grupo === g) cambios.splice(k, 1);
      continue;
    }
    for (const h of actuales.values()) {
      if (h.grupo !== g || h.id === c.id || h.estado === 'rechazada' || h.conjunto_asignado === c.a || cambios.some((x) => x.id === h.id)) continue;
      cambios.push({ id: h.id, fila: c.fila, nombre: `${h.nombre} (va en bloque)`, emprendedor: h.emprendedor, de: h.conjunto_asignado, a: c.a });
    }
  }
  return json({ cambios, errores, sinCambios, leidas });
};
