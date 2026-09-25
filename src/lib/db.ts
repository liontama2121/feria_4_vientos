// Capa de datos sobre Cloudflare D1.
// - El esquema se crea solo (CREATE TABLE IF NOT EXISTS) en el primer request de cada isolate.
// - `migrar()` agrega columnas nuevas y traduce los estados viejos (aprobado/rechazado/pendiente).
// - Si la base está vacía, se siembra con las content collections de src/content/.
import { getCollection } from 'astro:content';
import {
  LIMITES,
  TORRES_BASE,
  datosVacios,
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
  tipo: 'envio' | 'aprobado' | 'rechazado' | 'cambios' | 'cuenta_nueva' | 'cuenta_activada' | 'cuenta_rechazada';
  titulo: string;
  mensaje: string;
  /** Celular de 10 dígitos (sin +57) al que hay que mandar el mensaje, si aplica. */
  whatsapp: string;
  email: string;
  slug: string | null;
  enviada: boolean;
}

export type EmprendedorPublico = DatosEmprendimiento & { slug: string };

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
  ];
  // Agregar columnas con default no afecta al código viejo: se hace siempre.
  const stmts = columnas.filter(([n]) => !hay.has(n)).map(([n, tipo]) => db.prepare(`ALTER TABLE emprendedores ADD COLUMN ${n} ${tipo}`));
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
          `INSERT OR IGNORE INTO emprendedores (slug, owner_email, estado, borrador, publicado, borrador_at, publicado_at, revisado_at, revisado_por, creado_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(e.id, estado, json, aprobado ? json : null, t, aprobado ? t : null, aprobado ? t : null, aprobado ? 'semilla' : null, t),
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

type Coleccion = 'torres' | 'patrocinadores' | 'fechas';

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

/** El emprendimiento de un vecino (uno por cuenta). */
export async function registroDeVecino(db: D1Database, email: string): Promise<Registro | null> {
  const fila = await db.prepare(`SELECT * FROM emprendedores WHERE owner_email = ? ORDER BY creado_at LIMIT 1`).bind(email).first<FilaEmprendedor>();
  return fila ? aRegistro(fila) : null;
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
    .prepare(`SELECT slug, publicado FROM emprendedores WHERE estado = 'approved' AND publicado IS NOT NULL`)
    .all<{ slug: string; publicado: string }>();
  return results
    .map((r) => {
      const e = { ...datosVacios(), ...JSON.parse(r.publicado), slug: r.slug } as EmprendedorPublico;
      // Registros de antes del límite de 3 fotos pueden traer más: la landing muestra solo 3.
      return { ...e, galeria: e.galeria.slice(0, LIMITES.galeria) };
    })
    .filter((e) => e.publicado)
    .sort((a, b) => Number(b.destacado) - Number(a.destacado) || a.nombre_emprendimiento.localeCompare(b.nombre_emprendimiento, 'es'));
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
              estado = 'approved', motivo_rechazo = '', nota_cambios = '',
              revisado_at = ?, revisado_por = ?
        WHERE slug = ?`,
    )
    .bind(json, json, t, t, t, revisor, slug)
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
  await db.prepare(`DELETE FROM emprendedores WHERE slug = ?`).bind(slug).run();
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
