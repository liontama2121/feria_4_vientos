// Excel (.xlsx) mínimo sin dependencias: escribir una hoja y leer la primera hoja de un libro.
// Un .xlsx es un ZIP de XML. Para escribir se guardan los archivos sin comprimir (método 0);
// para leer se aceptan sin comprimir y deflate (lo que guardan Excel, LibreOffice y Google Sheets),
// descomprimidos con DecompressionStream('deflate-raw'), que existe en Workers y en Node.

const enc = new TextEncoder();
const dec = new TextDecoder();

// ───────────────────────── CRC-32 (lo exige el ZIP) ─────────────────────────
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // sin comprimir
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, a.datos.length, true);
    local.setUint32(22, a.datos.length, true);
    local.setUint16(26, nombre.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, a.datos);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, 0, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.datos.length, true);
    c.setUint32(24, a.datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nombre);
    offset += 30 + nombre.length + a.datos.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of todo) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

// ───────────────────────── Escribir ─────────────────────────

const xml = (s: string) =>
  s
    // Caracteres de control que el XML no admite.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function columna(i: number) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export interface HojaXlsx {
  nombre: string;
  encabezado: string[];
  filas: (string | number)[][];
  /** Ancho por columna (en caracteres). */
  anchos?: number[];
  /** Índices de columna con fondo amarillo para llenar a mano (p. ej. "Conjunto asignado"). */
  paraLlenar?: number[];
}

/** Libro de una hoja: encabezado en negrita y fijo, texto en celdas inline. */
export function escribirXlsx(h: HojaXlsx): Uint8Array<ArrayBuffer> {
  const celda = (v: string | number, ref: string, estilo: number) =>
    typeof v === 'number'
      ? `<c r="${ref}"${estilo ? ` s="${estilo}"` : ''}><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  const filas = [h.encabezado, ...h.filas]
    .map((f, r) => `<row r="${r + 1}">${f.map((v, c) => celda(v ?? '', `${columna(c)}${r + 1}`, r === 0 ? 1 : h.paraLlenar?.includes(c) ? 2 : 0)).join('')}</row>`)
    .join('');
  const cols = h.anchos?.length ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${filas}</sheetData><autoFilter ref="A1:${columna(h.encabezado.length - 1)}${h.filas.length + 1}"/></worksheet>`;
  const archivos: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(h.nombre.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(h.nombre.slice(0, 31))}'!$A$1:$${columna(h.encabezado.length - 1)}$${h.filas.length + 1}</definedName></definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC93C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4CC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': hoja,
  };
  return zip(Object.entries(archivos).map(([nombre, s]) => ({ nombre, datos: enc.encode(s) })));
}

// ───────────────────────── Leer ─────────────────────────

async function inflar(datos: Uint8Array) {
  const ds = new DecompressionStream('deflate-raw');
  const flujo = new Blob([datos.slice()]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/** Archivos de un ZIP (solo los que se piden), leídos desde el directorio central. */
async function leerZip(b: Uint8Array, quiere: (nombre: string) => boolean) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('El archivo .xlsx está dañado.');
    const metodo = v.getUint16(p + 10, true);
    const tamComp = v.getUint32(p + 20, true);
    const lNombre = v.getUint16(p + 28, true);
    const lExtra = v.getUint16(p + 30, true);
    const lComent = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + lNombre)).replace(/\\/g, '/');
    p += 46 + lNombre + lExtra + lComent;
    if (!quiere(nombre)) continue;
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = b.subarray(ini, ini + tamComp);
    if (metodo === 0) out.set(nombre, datos);
    else if (metodo === 8) out.set(nombre, await inflar(datos));
    else throw new Error('El .xlsx usa una compresión que no conocemos. Guárdalo de nuevo desde Excel.');
  }
  return out;
}

const desXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** Texto de un <si> o <is>: une todos los <t> (también los de texto con formato). */
const textoDe = (frag: string) => desXml([...frag.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

function indiceColumna(ref: string) {
  const letras = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Primera hoja del libro como matriz de texto (fila 0 = encabezado). */
export async function leerXlsx(archivo: Uint8Array): Promise<string[][]> {
  const zipArch = await leerZip(archivo, (n) => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  // La primera hoja según el libro (el nombre del archivo no siempre es sheet1.xml).
  let rutaHoja = 'xl/worksheets/sheet1.xml';
  const wb = zipArch.get('xl/workbook.xml');
  const rels = zipArch.get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(dec.decode(wb))?.[1];
    const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(dec.decode(rels))?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(dec.decode(rels))?.[1] : null;
    if (target) rutaHoja = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  const hoja = zipArch.get(rutaHoja) ?? [...zipArch.entries()].find(([n]) => n.startsWith('xl/worksheets/'))?.[1];
  if (!hoja) throw new Error('El Excel no tiene hojas.');
  const ss = zipArch.get('xl/sharedStrings.xml');
  const compartidos = ss ? [...dec.decode(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1])) : [];

  const filas: string[][] = [];
  for (const fila of dec.decode(hoja).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(/\br="(\d+)"/.exec(fila[1])?.[1] ?? filas.length + 1) - 1;
    const valores: string[] = [];
    let siguiente = 0;
    for (const c of fila[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const cuerpo = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const col = ref ? indiceColumna(ref) : siguiente;
      siguiente = col + 1;
      const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor = '';
      if (tipo === 's') valor = compartidos[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = textoDe(cuerpo);
      else if (v !== undefined) valor = desXml(v);
      valores[col] = valor;
    }
    filas[r] = Array.from(valores, (x) => x ?? '');
  }
  return Array.from(filas, (f) => f ?? []);
}
