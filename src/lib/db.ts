// Capa de datos sobre Cloudflare D1.
// - El esquema se crea solo (CREATE TABLE IF NOT EXISTS) en el primer request de cada isolate.
// - `migrar()` agrega columnas nuevas y traduce los estados viejos (aprobado/rechazado/pendiente).
// - Si la base está vacía, se siembra con las content collections de src/content/.
import { getCollection } from 'astro:content';
import {
  CATEGORIAS_BASE,
  LIMITES,
  TORRES_BASE,
  datosVacios,
  type Categoria,
  type DatosEmprendimiento,
  type EstadoCuenta,
  type EstadoEmprendimiento,
  type TipoPatrocinador,
  type TorreId,
} from './constantes';
import { sanearDatos } from './validacion';

// ───────────────────────── Tipos ─────────────────────────

export interface Torre {
  id: TorreId;
  nombre: string;
  rumbo: string;
  caracter: string;
  color_hex: string;
  color_claro: string;
  tagline: string;
  emoji_simbolo: string;
  orden: number;
}

export interface Patrocinador {
  id: string;
  nombre: string;
  tipo: TipoPatrocinador;
  etiqueta: string;
  rol_corto: string;
  descripcion: string;
  logo: string;
  emoji: string;
  orden: number;
  destacado: boolean;
}

export interface Fecha {
  id: string;
  titulo: string;
  fecha: string; // YYYY-MM-DD
  hora_inicio: string; // HH:MM
  hora_fin: string;
  descripcion: string;
  /** La feria solo sale en la landing si el comité la activó. Registros viejos sin el campo = inactiva. */
  activa?: boolean;
  /** Ventana en que sale en la landing (YYYY-MM-DD, ambos incluidos). Sin valor: desde siempre / hasta el día de la feria. */
  mostrar_desde?: string;
  mostrar_hasta?: string;
}

/** El estado de moderación, más `oculto` (aprobado pero con "Publicar en la landing" apagado). */
export type EstadoVisible = EstadoEmprendimiento | 'oculto';
export type Rol = 'vecino' | 'admin';

export interface Registro {
  slug: string;
  owner_email: string | null;
  estado: EstadoEmprendimiento;
  motivo_rechazo: string;
  nota_cambios: string;
  borrador: DatosEmprendimiento;
  publicado: DatosEmprendimiento | null;
  borrador_at: string | null;
  publicado_at: string | null;
  enviado_at: string | null;
  revisado_at: string | null;
  revisado_por: string | null;
  creado_at: string;
}

/** Quien tiene sesión: el comité (admin) o un vecino con cuenta activa. */
export interface Usuario {
  email: string;
  nombre: string;
  rol: Rol;
  torre: TorreId | null;
  apartamento: string;
  whatsapp: string;
}

export interface Cuenta {
  email: string;
  nombre: string;
  torre: TorreId;
  apartamento: string;
  whatsapp: string;
  estado: EstadoCuenta;
  motivo: string;
  creado_at: string;
  revisado_at: string | null;
  revisado_por: string | null;
}

export interface Notificacion {
  id: string;
  creado_at: string;
  /** A quién va: el comité (admin) o el vecino. */
  para: Rol;
  tipo: 'envio' | 'aprobado' | 'rechazado' | 'cambios' | 'cuenta_nueva' | 'cuenta_activada' | 'cuenta_rechazada' | 'reporte' | 'solicitud' | 'solicitud_aprobada' | 'solicitud_rechazada' | 'vinculado' | 'clave_pedida' | 'clave_link';
  titulo: string;
  mensaje: string;
  /** Celular de 10 dígitos (sin +57) al que hay que mandar el mensaje, si aplica. */
  whatsapp: string;
  email: string;
  slug: string | null;
  enviada: boolean;
}

export type EmprendedorPublico = DatosEmprendimiento & {
  slug: string;
  calificacion?: ResumenCalificaciones;
  /** Primera aprobación (ISO). */
  publicado_desde?: string | null;
  /** Aprobado por primera vez hace menos de LIMITES.diasNuevo días. */
  nuevo?: boolean;
};

/** Calificación de un visitante (sin cuenta). Una por navegador y emprendimiento; volver a calificar la reemplaza. */
export interface Calificacion {
  id: string;
  slug: string;
  estrellas: number;
  nombre: string;
  conjunto: string;
  comentario: string;
  creado_at: string;
  oculta: boolean;
}

/** Lo que ve la landing de cada emprendimiento: promedio, total y las últimas reseñas con texto. */
export interface ResumenCalificaciones {
  promedio: number;
  total: number;
  resenas: Pick<Calificacion, 'estrellas' | 'nombre' | 'conjunto' | 'comentario' | 'creado_at'>[];
}

export type EstadoReporte = 'abierto' | 'resuelto' | 'descartado';

export interface Reporte {
  id: string;
  slug: string;
  motivo: string;
  detalle: string;
  /** Keys de R2 (`reportes/<uuid>.webp`). Privadas: solo el comité las ve por /api/comite/evidencia/…, nunca por /media. */
  evidencias: string[];
  creado_at: string;
  estado: EstadoReporte;
  nota: string;
  revisado_at: string | null;
  revisado_por: string | null;
}

// ───────────────────────── Esquema ─────────────────────────

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS emprendedores (
    slug TEXT PRIMARY KEY,
    owner_email TEXT,
    estado TEXT NOT NULL DEFAULT 'draft',
    motivo_rechazo TEXT NOT NULL DEFAULT '',
    nota_cambios TEXT NOT NULL DEFAULT '',
    borrador TEXT NOT NULL,
    publicado TEXT,
    borrador_at TEXT,
    publicado_at TEXT,
    enviado_at TEXT,
    revisado_at TEXT,
    revisado_por TEXT,
    creado_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_emprendedores_owner ON emprendedores(owner_email)`,
  `CREATE TABLE IF NOT EXISTS contenido (
    coleccion TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (coleccion, id)
  )`,
  `CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
  // `cuentas` y no `usuarios`: en producción puede quedar la tabla `usuarios` de la versión con Zero Trust.
  `CREATE TABLE IF NOT EXISTS cuentas (
    email TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    torre TEXT NOT NULL,
    apartamento TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    clave TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pending_activation',
    motivo TEXT NOT NULL DEFAULT '',
    creado_at TEXT NOT NULL,
    revisado_at TEXT,
    revisado_por TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS notificaciones (
    id TEXT PRIMARY KEY,
    creado_at TEXT NOT NULL,
    para TEXT NOT NULL,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    whatsapp TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    slug TEXT,
    enviada INTEGER NOT NULL DEFAULT 0
  )`,
  // `visitante` = cookie anónima del navegador; `ip` = hash de la IP (nunca la IP en claro), solo para frenar abusos.
  `CREATE TABLE IF NOT EXISTS calificaciones (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    visitante TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    estrellas INTEGER NOT NULL,
    nombre TEXT NOT NULL DEFAULT '',
    conjunto TEXT NOT NULL DEFAULT '',
    comentario TEXT NOT NULL DEFAULT '',
    creado_at TEXT NOT NULL,
    oculta INTEGER NOT NULL DEFAULT 0,
    UNIQUE (slug, visitante)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_calificaciones_slug ON calificaciones(slug)`,
  // Visitas que llegan por el link para compartir /e/<slug> (sin datos de quién).
  `CREATE TABLE IF NOT EXISTS visitas_link (
    slug TEXT PRIMARY KEY,
    total INTEGER NOT NULL DEFAULT 0,
    ultima_at TEXT
  )`,
  // Un vecino puede tener más de un emprendimiento, pero cada uno adicional lo autoriza el comité.
  `CREATE TABLE IF NOT EXISTS solicitudes (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    nombre_emprendimiento TEXT NOT NULL,
    motivo TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    respuesta TEXT NOT NULL DEFAULT '',
    slug TEXT,
    creado_at TEXT NOT NULL,
    revisado_at TEXT,
    revisado_por TEXT
  )`,
  // Cambio de contraseña con permiso del comité. Solo se guarda el hash del token del link.
  `CREATE TABLE IF NOT EXISTS cambios_clave (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    token_hash TEXT,
    creado_at TEXT NOT NULL,
    vence_at TEXT,
    revisado_at TEXT,
    revisado_por TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cambios_clave_token ON cambios_clave(token_hash)`,
  `CREATE TABLE IF NOT EXISTS reportes (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    visitante TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL,
    detalle TEXT NOT NULL DEFAULT '',
    evidencias TEXT NOT NULL DEFAULT '[]',
    creado_at TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'abierto',
    nota TEXT NOT NULL DEFAULT '',
    revisado_at TEXT,
    revisado_por TEXT
  )`,
];

const ahora = () => new Date().toISOString();

/**
 * Los previews de Cloudflare Pages (cualquier rama distinta a la de producción) comparten la
 * D1 de producción. Ahí NO se traducen estados ni se permite escribir: si no, el código que
 * está en vivo dejaría de ver los emprendimientos. En local y en `npm run deploy` está vacío.
 */
export const RAMA_PRODUCCION = 'pro/feria4vientos';
export const esPreviewSobreProduccion = !!import.meta.env.RAMA_CF && import.meta.env.RAMA_CF !== RAMA_PRODUCCION;

let listo: Promise<void> | null = null;

export function asegurarDb(db: D1Database): Promise<void> {
  if (!listo) {
    listo = inicializar(db).catch((e) => {
      listo = null;
      throw e;
    });
  }
  return listo;
}

async function inicializar(db: D1Database) {
  await db.batch(ESQUEMA.map((s) => db.prepare(s)));
  await migrar(db);
  const semilla = await db.prepare(`SELECT valor FROM meta WHERE clave = 'semilla'`).first<{ valor: string }>();
  if (!semilla) await sembrar(db);
}

/**
 * Lleva una base de la v1 (estados aprobado/rechazado/pendiente, columna `motivo`) al flujo
 * de moderación. Es idempotente: se puede correr en cada arranque.
 */
async function migrar(db: D1Database) {
  const { results } = await db.prepare(`PRAGMA table_info(emprendedores)`).all<{ name: string }>();
  const hay = new Set(results.map((c) => c.name));
  const columnas: [string, string][] = [
    ['motivo_rechazo', `TEXT NOT NULL DEFAULT ''`],
    ['nota_cambios', `TEXT NOT NULL DEFAULT ''`],
    ['enviado_at', 'TEXT'],
    ['revisado_at', 'TEXT'],
    ['revisado_por', 'TEXT'],
    // Primera vez que se aprobó: de aquí sale la etiqueta "Nuevo" (re-aprobar no la renueva).
    ['primera_publicacion_at', 'TEXT'],
  ];
  // Agregar columnas con default no afecta al código viejo: se hace siempre.
  const stmts = columnas.filter(([n]) => !hay.has(n)).map(([n, tipo]) => db.prepare(`ALTER TABLE emprendedores ADD COLUMN ${n} ${tipo}`));
  // Bases locales que alcanzaron la primera versión de `reportes` (con contacto y sin evidencias).
  const { results: colsReportes } = await db.prepare(`PRAGMA table_info(reportes)`).all<{ name: string }>();
  if (!colsReportes.some((c) => c.name === 'evidencias')) stmts.push(db.prepare(`ALTER TABLE reportes ADD COLUMN evidencias TEXT NOT NULL DEFAULT '[]'`));
  if (esPreviewSobreProduccion) {
    if (stmts.length) await db.batch(stmts);
    return;
  }
  stmts.push(
    db.prepare(`UPDATE emprendedores SET estado = 'approved' WHERE estado = 'aprobado' AND publicado IS NOT NULL`),
    db.prepare(`UPDATE emprendedores SET estado = 'draft' WHERE estado IN ('aprobado', 'rechazado') AND publicado IS NULL`),
    // "rechazado" en la v1 era el botón Ocultar del comité: sigue aprobado, pero oculto de la landing.
    db.prepare(
      `UPDATE emprendedores
          SET estado = 'approved',
              publicado = json_set(publicado, '$.publicado', json('false')),
              borrador = json_set(borrador, '$.publicado', json('false'))
        WHERE estado = 'rechazado'`,
    ),
    db.prepare(`UPDATE emprendedores SET estado = 'pending_review', enviado_at = COALESCE(enviado_at, borrador_at, creado_at) WHERE estado = 'pendiente'`),
    // Los que ya estaban publicados antes de existir la columna: su mejor aproximación es publicado_at.
    db.prepare(`UPDATE emprendedores SET primera_publicacion_at = publicado_at WHERE primera_publicacion_at IS NULL AND publicado IS NOT NULL AND publicado_at IS NOT NULL`),
    // Antes de existir `en_feria`, todo emprendimiento era de la feria.
    db.prepare(
      `UPDATE emprendedores
          SET borrador = json_set(borrador, '$.en_feria', json('true')),
              publicado = CASE WHEN publicado IS NULL THEN NULL ELSE json_set(publicado, '$.en_feria', json('true')) END
        WHERE json_extract(borrador, '$.en_feria') IS NULL`,
    ),
  );
  await db.batch(stmts);
}

async function sembrar(db: D1Database) {
  const [emps, torres, patros, fechas] = await Promise.all([
    getCollection('emprendedores'),
    getCollection('torres'),
    getCollection('patrocinadores'),
    getCollection('fechas'),
  ]);
  const t = ahora();
  const stmts: D1PreparedStatement[] = [];

  for (const e of emps) {
    const { estado, ...resto } = e.data;
    const datos = sanearDatos({ ...resto, recibir_avisos: true }, datosVacios({ emoji_placeholder: e.data.emoji_placeholder }));
    const json = JSON.stringify(datos);
    const aprobado = estado === 'approved';
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO emprendedores (slug, owner_email, estado, borrador, publicado, borrador_at, publicado_at, primera_publicacion_at, revisado_at, revisado_por, creado_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(e.id, estado, json, aprobado ? json : null, t, aprobado ? t : null, aprobado ? t : null, aprobado ? t : null, aprobado ? 'semilla' : null, t),
    );
  }
  for (const torre of torres) {
    stmts.push(contenidoStmt(db, 'torres', torre.id, { id: torre.id, ...torre.data }, true));
  }
  for (const p of patros) {
    stmts.push(contenidoStmt(db, 'patrocinadores', p.id, { id: p.id, ...p.data }, true));
  }
  for (const f of fechas) {
    f.data.eventos.forEach((ev, i) => {
      const id = `${ev.fecha}-${i}`;
      stmts.push(contenidoStmt(db, 'fechas', id, { id, ...ev }, true));
    });
  }
  stmts.push(db.prepare(`INSERT OR REPLACE INTO meta (clave, valor) VALUES ('semilla', ?)`).bind(t));
  await db.batch(stmts);
}

// ───────────────────────── Contenido (torres, patrocinadores, fechas) ─────────────────────────

type Coleccion = 'torres' | 'patrocinadores' | 'fechas' | 'categorias';

function contenidoStmt(db: D1Database, coleccion: Coleccion, id: string, data: unknown, soloSiNoExiste = false) {
  const verbo = soloSiNoExiste ? 'INSERT OR IGNORE' : 'INSERT OR REPLACE';
  return db.prepare(`${verbo} INTO contenido (coleccion, id, data) VALUES (?, ?, ?)`).bind(coleccion, id, JSON.stringify(data));
}

async function listarContenido<T>(db: D1Database, coleccion: Coleccion): Promise<T[]> {
  const { results } = await db.prepare(`SELECT data FROM contenido WHERE coleccion = ?`).bind(coleccion).all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as T);
}

export async function listarTorres(db: D1Database): Promise<Torre[]> {
  const torres = await listarContenido<Torre>(db, 'torres');
  // Si alguna torre falta en D1, se completa con los valores base para que la landing nunca quede coja.
  for (const [id, base] of Object.entries(TORRES_BASE) as [TorreId, (typeof TORRES_BASE)[TorreId]][]) {
    if (!torres.some((t) => t.id === id)) {
      torres.push({
        id,
        nombre: base.nombre,
        rumbo: base.rumbo,
        caracter: '',
        color_hex: base.color,
        color_claro: base.claro,
        tagline: '',
        emoji_simbolo: base.emoji,
        orden: 99,
      });
    }
  }
  return torres.sort((a, b) => a.orden - b.orden);
}

export async function guardarTorre(db: D1Database, torre: Torre) {
  await contenidoStmt(db, 'torres', torre.id, torre).run();
}

export async function listarPatrocinadores(db: D1Database): Promise<Patrocinador[]> {
  return (await listarContenido<Patrocinador>(db, 'patrocinadores')).sort((a, b) => a.orden - b.orden);
}

export async function guardarPatrocinador(db: D1Database, p: Patrocinador) {
  await contenidoStmt(db, 'patrocinadores', p.id, p).run();
}

export async function borrarPatrocinador(db: D1Database, id: string) {
  await db.prepare(`DELETE FROM contenido WHERE coleccion = 'patrocinadores' AND id = ?`).bind(id).run();
}

export async function listarFechas(db: D1Database): Promise<Fecha[]> {
  return (await listarContenido<Fecha>(db, 'fechas')).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function guardarFecha(db: D1Database, f: Fecha) {
  await contenidoStmt(db, 'fechas', f.id, f).run();
}

export async function borrarFecha(db: D1Database, id: string) {
  await db.prepare(`DELETE FROM contenido WHERE coleccion = 'fechas' AND id = ?`).bind(id).run();
}

/** Las de D1 + las base que falten (así nunca desaparece una categoría base), en orden. */
export async function listarCategorias(db: D1Database): Promise<Categoria[]> {
  const guardadas = await listarContenido<Categoria>(db, 'categorias');
  const faltan = CATEGORIAS_BASE.filter((b) => !guardadas.some((c) => c.id === b.id)).map((b) => ({ ...b, oculta: false }));
  return [...guardadas, ...faltan].sort((a, b) => a.orden - b.orden || a.label.localeCompare(b.label, 'es'));
}

export async function guardarCategoria(db: D1Database, c: Categoria) {
  await contenidoStmt(db, 'categorias', c.id, c).run();
}

export async function borrarCategoria(db: D1Database, id: string) {
  await db.prepare(`DELETE FROM contenido WHERE coleccion = 'categorias' AND id = ?`).bind(id).run();
}

/** Cuántos emprendimientos (en cualquier estado) usan cada categoría. */
export async function usosCategorias(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(`SELECT json_extract(borrador, '$.categoria') AS id, COUNT(*) AS n FROM emprendedores GROUP BY id`)
    .all<{ id: string | null; n: number }>();
  return Object.fromEntries(results.filter((r) => r.id).map((r) => [r.id, r.n]));
}

// ───────────────────────── Emprendedores ─────────────────────────

interface FilaEmprendedor {
  slug: string;
  owner_email: string | null;
  estado: EstadoEmprendimiento;
  motivo_rechazo: string | null;
  nota_cambios: string | null;
  borrador: string;
  publicado: string | null;
  borrador_at: string | null;
  publicado_at: string | null;
  enviado_at: string | null;
  revisado_at: string | null;
  revisado_por: string | null;
  creado_at: string;
}

function aRegistro(f: FilaEmprendedor): Registro {
  return {
    slug: f.slug,
    owner_email: f.owner_email,
    estado: f.estado,
    motivo_rechazo: f.motivo_rechazo ?? '',
    nota_cambios: f.nota_cambios ?? '',
    borrador: { ...datosVacios(), ...JSON.parse(f.borrador) },
    publicado: f.publicado ? { ...datosVacios(), ...JSON.parse(f.publicado) } : null,
    borrador_at: f.borrador_at,
    publicado_at: f.publicado_at,
    enviado_at: f.enviado_at,
    revisado_at: f.revisado_at,
    revisado_por: f.revisado_por,
    creado_at: f.creado_at,
  };
}

export function estadoVisible(r: Registro): EstadoVisible {
  if (r.estado === 'approved' && r.publicado && !r.publicado.publicado) return 'oculto';
  return r.estado;
}

export function tieneCambiosSinPublicar(r: Registro) {
  if (!r.publicado) return true;
  return JSON.stringify(r.borrador) !== JSON.stringify(r.publicado);
}

export async function obtenerRegistro(db: D1Database, slug: string): Promise<Registro | null> {
  const fila = await db.prepare(`SELECT * FROM emprendedores WHERE slug = ?`).bind(slug).first<FilaEmprendedor>();
  return fila ? aRegistro(fila) : null;
}

/**
 * Un emprendimiento del vecino. Con `slug`: ese, solo si es suyo (si no, null). Sin `slug`:
 * el primero que creó. Nunca devuelve uno ajeno.
 */
export async function registroDeVecino(db: D1Database, email: string, slug?: string | null): Promise<Registro | null> {
  if (slug) {
    const propio = await db.prepare(`SELECT * FROM emprendedores WHERE slug = ? AND owner_email = ?`).bind(slug, email).first<FilaEmprendedor>();
    return propio ? aRegistro(propio) : null;
  }
  const fila = await db.prepare(`SELECT * FROM emprendedores WHERE owner_email = ? ORDER BY creado_at LIMIT 1`).bind(email).first<FilaEmprendedor>();
  return fila ? aRegistro(fila) : null;
}

/** Los emprendimientos de una cuenta, para el selector "Mis emprendimientos" del panel. */
export async function listarDeVecino(db: D1Database, email: string) {
  const { results } = await db
    .prepare(
      `SELECT slug, estado, json_extract(borrador, '$.nombre_emprendimiento') AS nombre, json_extract(borrador, '$.emoji_placeholder') AS emoji
         FROM emprendedores WHERE owner_email = ? ORDER BY creado_at`,
    )
    .bind(email)
    .all<{ slug: string; estado: EstadoEmprendimiento; nombre: string | null; emoji: string | null }>();
  return results;
}

/** El comité asigna (o quita, con null) la cuenta dueña de un emprendimiento. */
export async function vincularRegistro(db: D1Database, slug: string, email: string | null) {
  await db.prepare(`UPDATE emprendedores SET owner_email = ? WHERE slug = ?`).bind(email, slug).run();
}

export async function listarRegistros(db: D1Database): Promise<Registro[]> {
  const { results } = await db.prepare(`SELECT * FROM emprendedores ORDER BY creado_at DESC`).all<FilaEmprendedor>();
  return results.map(aRegistro);
}

/**
 * Lo que ve la landing (lista por conjunto y vitrina): SOLO `estado = 'approved'`, con versión
 * publicada y el toggle "Publicar en la landing" encendido. draft, pending_review, rejected y
 * changes_requested nunca salen de aquí.
 */
export async function listarPublicos(db: D1Database): Promise<EmprendedorPublico[]> {
  const { results } = await db
    .prepare(`SELECT slug, publicado, primera_publicacion_at FROM emprendedores WHERE estado = 'approved' AND publicado IS NOT NULL`)
    .all<{ slug: string; publicado: string; primera_publicacion_at: string | null }>();
  const corte = new Date(Date.now() - LIMITES.diasNuevo * 24 * 60 * 60 * 1000).toISOString();
  return results
    .map((r) => {
      const e = { ...datosVacios(), ...JSON.parse(r.publicado), slug: r.slug } as EmprendedorPublico;
      // Registros de antes del límite de 3 fotos pueden traer más: la landing muestra solo 3.
      return {
        ...e,
        galeria: e.galeria.slice(0, LIMITES.galeria),
        publicado_desde: r.primera_publicacion_at,
        nuevo: !!r.primera_publicacion_at && r.primera_publicacion_at >= corte,
      };
    })
    .filter((e) => e.publicado)
    // Destacados primero; luego los nuevos (el más reciente arriba) para darles visibilidad.
    .sort(
      (a, b) =>
        Number(b.destacado) - Number(a.destacado) ||
        Number(b.nuevo) - Number(a.nuevo) ||
        (a.nuevo && b.nuevo ? (b.publicado_desde ?? '').localeCompare(a.publicado_desde ?? '') : 0) ||
        a.nombre_emprendimiento.localeCompare(b.nombre_emprendimiento, 'es'),
    );
}

export async function guardarBorrador(db: D1Database, slug: string, datos: DatosEmprendimiento) {
  const t = ahora();
  await db.prepare(`UPDATE emprendedores SET borrador = ?, borrador_at = ? WHERE slug = ?`).bind(JSON.stringify(datos), t, slug).run();
  return t;
}

/**
 * El vecino manda su formulario a revisión. Solo pasa si sigue en un estado editable
 * (el WHERE evita carreras con una revisión del comité). Devuelve false si no se pudo.
 */
export async function enviarARevision(db: D1Database, slug: string, datos: DatosEmprendimiento) {
  const t = ahora();
  const r = await db
    .prepare(
      `UPDATE emprendedores
          SET borrador = ?, borrador_at = ?, enviado_at = ?, estado = 'pending_review'
        WHERE slug = ? AND estado IN ('draft', 'changes_requested')`,
    )
    .bind(JSON.stringify(datos), t, t, slug)
    .run();
  return r.meta.changes > 0;
}

/** Aprobar = copiar el borrador a la versión pública y dejarlo `approved`. Solo el comité. */
export async function aprobarRegistro(db: D1Database, slug: string, datos: DatosEmprendimiento, revisor: string) {
  const t = ahora();
  const json = JSON.stringify(datos);
  await db
    .prepare(
      `UPDATE emprendedores
          SET borrador = ?, publicado = ?, borrador_at = ?, publicado_at = ?,
              primera_publicacion_at = COALESCE(primera_publicacion_at, ?),
              estado = 'approved', motivo_rechazo = '', nota_cambios = '',
              revisado_at = ?, revisado_por = ?
        WHERE slug = ?`,
    )
    .bind(json, json, t, t, t, t, revisor, slug)
    .run();
  return t;
}

export async function rechazarRegistro(db: D1Database, slug: string, motivo: string, revisor: string) {
  await db
    .prepare(
      `UPDATE emprendedores SET estado = 'rejected', motivo_rechazo = ?, nota_cambios = '', revisado_at = ?, revisado_por = ? WHERE slug = ?`,
    )
    .bind(motivo, ahora(), revisor, slug)
    .run();
}

export async function pedirCambios(db: D1Database, slug: string, nota: string, revisor: string) {
  await db
    .prepare(
      `UPDATE emprendedores SET estado = 'changes_requested', nota_cambios = ?, motivo_rechazo = '', revisado_at = ?, revisado_por = ? WHERE slug = ?`,
    )
    .bind(nota, ahora(), revisor, slug)
    .run();
}

/** El comité destaca / oculta / marca "en la feria": se aplica al borrador y a la versión pública. */
export async function marcarCampo(db: D1Database, slug: string, campo: 'destacado' | 'publicado' | 'en_feria', valor: boolean) {
  const r = await obtenerRegistro(db, slug);
  if (!r) return;
  const borrador = { ...r.borrador, [campo]: valor };
  const publicado = r.publicado ? { ...r.publicado, [campo]: valor } : null;
  await db
    .prepare(`UPDATE emprendedores SET borrador = ?, publicado = ? WHERE slug = ?`)
    .bind(JSON.stringify(borrador), publicado ? JSON.stringify(publicado) : null, slug)
    .run();
}

export async function borrarRegistro(db: D1Database, slug: string) {
  // Los reportes se conservan como historial; las calificaciones se van con el emprendimiento.
  await db.batch([db.prepare(`DELETE FROM emprendedores WHERE slug = ?`).bind(slug), db.prepare(`DELETE FROM calificaciones WHERE slug = ?`).bind(slug)]);
}

// ───────────────────────── Nuevos emprendimientos ─────────────────────────

function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function slugLibre(db: D1Database, base: string) {
  let slug = slugify(base) || 'emprendimiento';
  for (let n = 2; await obtenerRegistro(db, slug); n++) slug = `${slugify(base)}-${n}`;
  return slug;
}

/**
 * Crea un emprendimiento vacío en `draft`. Lo usa el comité ("+ Nuevo emprendimiento") y el
 * panel del vecino la primera vez que entra (con `owner_email`).
 */
export async function crearEmprendimiento(
  db: D1Database,
  c: { nombre_vecino: string; torre: TorreId; apartamento: string; nombre_emprendimiento?: string; whatsapp?: string },
  owner: string | null = null,
) {
  const slug = await slugLibre(db, c.nombre_emprendimiento || `${c.torre}-${c.apartamento}`);
  const datos = datosVacios({
    nombre_vecino: c.nombre_vecino,
    apartamento: c.apartamento,
    torre: c.torre,
    nombre_emprendimiento: c.nombre_emprendimiento ?? '',
    whatsapp: c.whatsapp ?? '',
  });
  await db
    .prepare(
      `INSERT INTO emprendedores (slug, owner_email, estado, borrador, publicado, borrador_at, publicado_at, creado_at)
       VALUES (?, ?, 'draft', ?, NULL, NULL, NULL, ?)`,
    )
    .bind(slug, owner, JSON.stringify(datos), ahora())
    .run();
  return slug;
}

// ───────────────────────── Cuentas de vecinos ─────────────────────────

interface FilaCuenta extends Cuenta {
  clave: string;
}

function aCuenta({ clave: _clave, ...c }: FilaCuenta): Cuenta {
  return c;
}

/** Devuelve false si ya existe una cuenta con ese correo. */
export async function crearCuenta(db: D1Database, c: Omit<Cuenta, 'estado' | 'motivo' | 'creado_at' | 'revisado_at' | 'revisado_por'>, claveHash: string) {
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO cuentas (email, nombre, torre, apartamento, whatsapp, clave, estado, creado_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_activation', ?)`,
    )
    .bind(c.email, c.nombre, c.torre, c.apartamento, c.whatsapp, claveHash, ahora())
    .run();
  return r.meta.changes > 0;
}

export async function obtenerCuentaConClave(db: D1Database, email: string) {
  return db.prepare(`SELECT * FROM cuentas WHERE email = ?`).bind(email).first<FilaCuenta>();
}

export async function obtenerCuenta(db: D1Database, email: string): Promise<Cuenta | null> {
  const f = await obtenerCuentaConClave(db, email);
  return f ? aCuenta(f) : null;
}

export async function listarCuentas(db: D1Database): Promise<Cuenta[]> {
  const { results } = await db.prepare(`SELECT * FROM cuentas ORDER BY creado_at DESC`).all<FilaCuenta>();
  return results.map(aCuenta);
}

export async function revisarCuenta(db: D1Database, email: string, estado: EstadoCuenta, revisor: string, motivo = '') {
  await db
    .prepare(`UPDATE cuentas SET estado = ?, motivo = ?, revisado_at = ?, revisado_por = ? WHERE email = ?`)
    .bind(estado, motivo, ahora(), revisor, email)
    .run();
}

// ───────────────────────── Cambio de contraseña (con permiso del comité) ─────────────────────────
// pendiente (el vecino la pidió) → aprobada (el comité generó un link de un solo uso) → usada.
// `cerrada` = reemplazada por un link más nuevo o no aprobada por el comité.

export interface CambioClave {
  id: string;
  email: string;
  estado: 'pendiente' | 'aprobada' | 'usada' | 'cerrada';
  creado_at: string;
  vence_at: string | null;
}

/** Devuelve false si ya había una solicitud pendiente de ese correo. */
export async function pedirCambioClave(db: D1Database, email: string) {
  const ya = await db.prepare(`SELECT id FROM cambios_clave WHERE email = ? AND estado = 'pendiente'`).bind(email).first();
  if (ya) return false;
  await db.prepare(`INSERT INTO cambios_clave (id, email, estado, creado_at) VALUES (?, ?, 'pendiente', ?)`).bind(crypto.randomUUID(), email, ahora()).run();
  return true;
}

export async function listarCambiosClave(db: D1Database): Promise<CambioClave[]> {
  const { results } = await db
    .prepare(`SELECT id, email, estado, creado_at, vence_at FROM cambios_clave WHERE estado = 'pendiente' ORDER BY creado_at`)
    .all<CambioClave>();
  return results;
}

/** Cierra lo anterior de ese correo y deja un solo link vigente. */
export async function autorizarCambioClave(db: D1Database, email: string, tokenHash: string, venceAt: string, revisor: string) {
  const t = ahora();
  await db.batch([
    db
      .prepare(`UPDATE cambios_clave SET estado = 'cerrada', revisado_at = ?, revisado_por = ? WHERE email = ? AND estado IN ('pendiente', 'aprobada')`)
      .bind(t, revisor, email),
    db
      .prepare(`INSERT INTO cambios_clave (id, email, estado, token_hash, creado_at, vence_at, revisado_at, revisado_por) VALUES (?, ?, 'aprobada', ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), email, tokenHash, t, venceAt, t, revisor),
  ]);
}

export async function negarCambioClave(db: D1Database, email: string, revisor: string) {
  await db
    .prepare(`UPDATE cambios_clave SET estado = 'cerrada', revisado_at = ?, revisado_por = ? WHERE email = ? AND estado = 'pendiente'`)
    .bind(ahora(), revisor, email)
    .run();
}

/** Correo dueño de un link vigente (aprobado y sin vencer), o null. */
export async function emailDeLinkClave(db: D1Database, tokenHash: string) {
  const f = await db
    .prepare(`SELECT email FROM cambios_clave WHERE token_hash = ? AND estado = 'aprobada' AND vence_at > ?`)
    .bind(tokenHash, ahora())
    .first<{ email: string }>();
  return f?.email ?? null;
}

/** Quema el link y cambia la contraseña. Devuelve el correo, o null si el link ya no sirve. */
export async function usarLinkClave(db: D1Database, tokenHash: string, claveHash: string) {
  const email = await emailDeLinkClave(db, tokenHash);
  if (!email) return null;
  const r = await db
    .prepare(`UPDATE cambios_clave SET estado = 'usada' WHERE token_hash = ? AND estado = 'aprobada'`)
    .bind(tokenHash)
    .run();
  if (!r.meta.changes) return null;
  await db.prepare(`UPDATE cuentas SET clave = ? WHERE email = ?`).bind(claveHash, email).run();
  return email;
}

// ───────────────────────── Notificaciones (bandeja manual) ─────────────────────────
// Aún no hay envío automático por WhatsApp: cada aviso queda aquí con su texto listo y el
// comité lo manda con un clic (wa.me) desde /admin/comite#notificaciones.

interface FilaNotificacion extends Omit<Notificacion, 'enviada'> {
  enviada: number;
}

export async function crearNotificacion(db: D1Database, n: Omit<Notificacion, 'id' | 'creado_at' | 'enviada'>): Promise<Notificacion> {
  const nueva: Notificacion = { ...n, id: crypto.randomUUID(), creado_at: ahora(), enviada: false };
  await db
    .prepare(
      `INSERT INTO notificaciones (id, creado_at, para, tipo, titulo, mensaje, whatsapp, email, slug, enviada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .bind(nueva.id, nueva.creado_at, nueva.para, nueva.tipo, nueva.titulo, nueva.mensaje, nueva.whatsapp, nueva.email, nueva.slug)
    .run();
  return nueva;
}

export async function listarNotificaciones(db: D1Database, limite = 200): Promise<Notificacion[]> {
  const { results } = await db.prepare(`SELECT * FROM notificaciones ORDER BY creado_at DESC LIMIT ?`).bind(limite).all<FilaNotificacion>();
  return results.map((n) => ({ ...n, enviada: n.enviada === 1 }));
}

export async function marcarNotificacion(db: D1Database, id: string, enviada: boolean) {
  await db.prepare(`UPDATE notificaciones SET enviada = ? WHERE id = ?`).bind(enviada ? 1 : 0, id).run();
}

// ───────────────────────── Link para compartir ─────────────────────────

export async function sumarVisita(db: D1Database, slug: string) {
  await db
    .prepare(`INSERT INTO visitas_link (slug, total, ultima_at) VALUES (?, 1, ?) ON CONFLICT (slug) DO UPDATE SET total = total + 1, ultima_at = excluded.ultima_at`)
    .bind(slug, ahora())
    .run();
}

export async function visitasDe(db: D1Database, slug: string) {
  return (await db.prepare(`SELECT total FROM visitas_link WHERE slug = ?`).bind(slug).first<{ total: number }>())?.total ?? 0;
}

// ───────────────────────── Solicitudes de emprendimiento adicional ─────────────────────────

export interface Solicitud {
  id: string;
  email: string;
  nombre_emprendimiento: string;
  motivo: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  respuesta: string;
  slug: string | null;
  creado_at: string;
  revisado_at: string | null;
  revisado_por: string | null;
}

export async function crearSolicitud(db: D1Database, email: string, nombre: string, motivo: string): Promise<Solicitud> {
  const s: Solicitud = {
    id: crypto.randomUUID(),
    email,
    nombre_emprendimiento: nombre,
    motivo,
    estado: 'pendiente',
    respuesta: '',
    slug: null,
    creado_at: ahora(),
    revisado_at: null,
    revisado_por: null,
  };
  await db
    .prepare(`INSERT INTO solicitudes (id, email, nombre_emprendimiento, motivo, estado, creado_at) VALUES (?, ?, ?, ?, 'pendiente', ?)`)
    .bind(s.id, email, nombre, motivo, s.creado_at)
    .run();
  return s;
}

export async function listarSolicitudes(db: D1Database, email?: string): Promise<Solicitud[]> {
  const stmt = email
    ? db.prepare(`SELECT * FROM solicitudes WHERE email = ? ORDER BY creado_at DESC`).bind(email)
    : db.prepare(`SELECT * FROM solicitudes ORDER BY CASE estado WHEN 'pendiente' THEN 0 ELSE 1 END, creado_at DESC LIMIT 200`);
  return (await stmt.all<Solicitud>()).results;
}

export async function obtenerSolicitud(db: D1Database, id: string) {
  return db.prepare(`SELECT * FROM solicitudes WHERE id = ?`).bind(id).first<Solicitud>();
}

/** Cierra la solicitud. Solo si seguía pendiente (evita aprobar dos veces y crear dos emprendimientos). */
export async function cerrarSolicitud(db: D1Database, id: string, estado: 'aprobada' | 'rechazada', respuesta: string, revisor: string, slug: string | null) {
  const r = await db
    .prepare(`UPDATE solicitudes SET estado = ?, respuesta = ?, slug = ?, revisado_at = ?, revisado_por = ? WHERE id = ? AND estado = 'pendiente'`)
    .bind(estado, respuesta, slug, ahora(), revisor, id)
    .run();
  return r.meta.changes > 0;
}

// ───────────────────────── Calificaciones y reportes ─────────────────────────
// Cualquier visitante califica (sin login) y sale al instante; el comité puede ocultar.
// Los reportes solo los ve el comité.

interface FilaCalificacion extends Omit<Calificacion, 'oculta'> {
  oculta: number;
}

/** Cuántas acciones (calificar o reportar) hizo esta IP desde `desde`. Sirve para frenar ráfagas. */
export async function contarRecientes(db: D1Database, tabla: 'calificaciones' | 'reportes', ip: string, desde: string) {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ip = ? AND creado_at >= ?`).bind(ip, desde).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Guarda o reemplaza la calificación de este navegador. Devuelve true si ya existía (se actualizó). */
export async function guardarCalificacion(
  db: D1Database,
  c: Pick<Calificacion, 'slug' | 'estrellas' | 'nombre' | 'conjunto' | 'comentario'> & { visitante: string; ip: string },
) {
  const previa = await db.prepare(`SELECT id FROM calificaciones WHERE slug = ? AND visitante = ?`).bind(c.slug, c.visitante).first<{ id: string }>();
  // Al cambiar su calificación se conserva `oculta`: si el comité la ocultó, sigue oculta.
  await db
    .prepare(
      `INSERT INTO calificaciones (id, slug, visitante, ip, estrellas, nombre, conjunto, comentario, creado_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (slug, visitante) DO UPDATE SET
         ip = excluded.ip, estrellas = excluded.estrellas, nombre = excluded.nombre,
         conjunto = excluded.conjunto, comentario = excluded.comentario, creado_at = excluded.creado_at`,
    )
    .bind(crypto.randomUUID(), c.slug, c.visitante, c.ip, c.estrellas, c.nombre, c.conjunto, c.comentario, ahora())
    .run();
  return !!previa;
}

/** Resumen por emprendimiento para la landing (solo calificaciones visibles). */
export async function resumenCalificaciones(db: D1Database, soloSlug?: string, porSlug = 6): Promise<Record<string, ResumenCalificaciones>> {
  const filtro = soloSlug ? 'AND slug = ?' : '';
  const stmt = db.prepare(`SELECT slug, estrellas, nombre, conjunto, comentario, creado_at FROM calificaciones WHERE oculta = 0 ${filtro} ORDER BY creado_at DESC`);
  const { results } = await (soloSlug ? stmt.bind(soloSlug) : stmt)
    .all<Pick<Calificacion, 'slug' | 'estrellas' | 'nombre' | 'conjunto' | 'comentario' | 'creado_at'>>();
  const out: Record<string, ResumenCalificaciones & { suma: number }> = {};
  for (const r of results) {
    const s = (out[r.slug] ??= { promedio: 0, total: 0, suma: 0, resenas: [] });
    s.total++;
    s.suma += r.estrellas;
    if (r.comentario && s.resenas.length < porSlug) {
      s.resenas.push({ estrellas: r.estrellas, nombre: r.nombre, conjunto: r.conjunto, comentario: r.comentario, creado_at: r.creado_at });
    }
  }
  return Object.fromEntries(
    Object.entries(out).map(([slug, { suma, ...s }]) => [slug, { ...s, promedio: Math.round((suma / s.total) * 10) / 10 }]),
  );
}

export async function listarCalificaciones(db: D1Database, limite = 300): Promise<Calificacion[]> {
  const { results } = await db
    .prepare(`SELECT id, slug, estrellas, nombre, conjunto, comentario, creado_at, oculta FROM calificaciones ORDER BY creado_at DESC LIMIT ?`)
    .bind(limite)
    .all<FilaCalificacion>();
  return results.map((c) => ({ ...c, oculta: c.oculta === 1 }));
}

export async function ocultarCalificacion(db: D1Database, id: string, oculta: boolean) {
  await db.prepare(`UPDATE calificaciones SET oculta = ? WHERE id = ?`).bind(oculta ? 1 : 0, id).run();
}

export async function borrarCalificacion(db: D1Database, id: string) {
  await db.prepare(`DELETE FROM calificaciones WHERE id = ?`).bind(id).run();
}

const COLS_REPORTE = `id, slug, motivo, detalle, evidencias, creado_at, estado, nota, revisado_at, revisado_por`;
const aReporte = (f: Omit<Reporte, 'evidencias'> & { evidencias: string }): Reporte => ({ ...f, evidencias: JSON.parse(f.evidencias || '[]') });

export async function crearReporte(
  db: D1Database,
  r: Pick<Reporte, 'slug' | 'motivo' | 'detalle' | 'evidencias'> & { visitante: string; ip: string },
): Promise<Reporte> {
  const nuevo: Reporte = {
    id: crypto.randomUUID(),
    slug: r.slug,
    motivo: r.motivo,
    detalle: r.detalle,
    evidencias: r.evidencias,
    creado_at: ahora(),
    estado: 'abierto',
    nota: '',
    revisado_at: null,
    revisado_por: null,
  };
  await db
    .prepare(
      `INSERT INTO reportes (id, slug, visitante, ip, motivo, detalle, evidencias, creado_at, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'abierto')`,
    )
    .bind(nuevo.id, r.slug, r.visitante, r.ip, r.motivo, r.detalle, JSON.stringify(r.evidencias), nuevo.creado_at)
    .run();
  return nuevo;
}

export async function listarReportes(db: D1Database, limite = 300): Promise<Reporte[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLS_REPORTE} FROM reportes
        ORDER BY CASE estado WHEN 'abierto' THEN 0 ELSE 1 END, creado_at DESC LIMIT ?`,
    )
    .bind(limite)
    .all<Parameters<typeof aReporte>[0]>();
  return results.map(aReporte);
}

export async function revisarReporte(db: D1Database, id: string, estado: EstadoReporte, nota: string, revisor: string) {
  const t = estado === 'abierto' ? null : ahora();
  await db
    .prepare(`UPDATE reportes SET estado = ?, nota = ?, revisado_at = ?, revisado_por = ? WHERE id = ?`)
    .bind(estado, nota, t, estado === 'abierto' ? null : revisor, id)
    .run();
  const f = await db.prepare(`SELECT ${COLS_REPORTE} FROM reportes WHERE id = ?`).bind(id).first<Parameters<typeof aReporte>[0]>();
  return f ? aReporte(f) : null;
}

// ───────────────────────── Vistas para panel y comité ─────────────────────────

export function resumenPanel(r: Registro) {
  return {
    slug: r.slug,
    estado: r.estado,
    estado_visible: estadoVisible(r),
    motivo_rechazo: r.motivo_rechazo,
    nota_cambios: r.nota_cambios,
    torre_publicada: r.publicado?.torre ?? null,
    borrador: r.borrador,
    borrador_at: r.borrador_at,
    publicado_at: r.publicado_at,
    enviado_at: r.enviado_at,
    revisado_at: r.revisado_at,
    cambios_sin_publicar: tieneCambiosSinPublicar(r),
  };
}
export type ResumenPanel = ReturnType<typeof resumenPanel>;

export function filaComite(r: Registro) {
  const d = r.borrador;
  return {
    slug: r.slug,
    nombre: d.nombre_emprendimiento,
    vecino: d.nombre_vecino,
    torre: d.torre,
    apartamento: d.apartamento,
    categoria: d.categoria,
    descripcion_corta: d.descripcion_corta,
    descripcion_larga: d.descripcion_larga,
    whatsapp: d.whatsapp,
    instagram: d.instagram,
    tiktok: d.tiktok,
    facebook: d.facebook,
    pagina_web: d.pagina_web,
    foto: d.foto_principal,
    galeria: d.galeria,
    emoji: d.emoji_placeholder,
    destacado: d.destacado,
    en_feria: d.en_feria,
    recibir_avisos: d.recibir_avisos,
    owner_email: r.owner_email,
    estado: r.estado,
    estado_visible: estadoVisible(r),
    motivo_rechazo: r.motivo_rechazo,
    nota_cambios: r.nota_cambios,
    cambios_sin_publicar: tieneCambiosSinPublicar(r),
    publicado_at: r.publicado_at,
    borrador_at: r.borrador_at,
    enviado_at: r.enviado_at,
    revisado_at: r.revisado_at,
    revisado_por: r.revisado_por,
    creado_at: r.creado_at,
  };
}
export type FilaComite = ReturnType<typeof filaComite>;
