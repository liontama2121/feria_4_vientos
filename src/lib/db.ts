// Capa de datos sobre Cloudflare D1.
// - El esquema se crea solo (CREATE TABLE IF NOT EXISTS) en el primer request de cada isolate.
// - Si la base está vacía, se siembra con las content collections de src/content/.
// - En `npm run dev` se crean además los usuarios de prueba (ver USUARIOS_DEV).
import { getCollection } from 'astro:content';
import {
  TORRES_BASE,
  datosVacios,
  type DatosEmprendimiento,
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

export type Estado = 'pendiente' | 'aprobado' | 'rechazado';
export type EstadoVisible = 'publicado' | 'oculto' | 'pendiente' | 'rechazado' | 'borrador';
export type Rol = 'vecino' | 'admin';

export interface Registro {
  slug: string;
  owner_email: string | null;
  estado: Estado;
  motivo: string;
  borrador: DatosEmprendimiento;
  publicado: DatosEmprendimiento | null;
  borrador_at: string | null;
  publicado_at: string | null;
  creado_at: string;
}

export interface Usuario {
  email: string;
  nombre: string;
  rol: Rol;
  torre: TorreId | null;
  apartamento: string;
  slug: string | null;
  email_avisos: string;
  creado_at: string;
}

export type EmprendedorPublico = DatosEmprendimiento & { slug: string };

// ───────────────────────── Esquema ─────────────────────────

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS emprendedores (
    slug TEXT PRIMARY KEY,
    owner_email TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    motivo TEXT NOT NULL DEFAULT '',
    borrador TEXT NOT NULL,
    publicado TEXT,
    borrador_at TEXT,
    publicado_at TEXT,
    creado_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_emprendedores_owner ON emprendedores(owner_email)`,
  `CREATE TABLE IF NOT EXISTS usuarios (
    email TEXT PRIMARY KEY,
    nombre TEXT NOT NULL DEFAULT '',
    rol TEXT NOT NULL DEFAULT 'vecino',
    torre TEXT,
    apartamento TEXT NOT NULL DEFAULT '',
    slug TEXT,
    email_avisos TEXT NOT NULL DEFAULT '',
    creado_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS contenido (
    coleccion TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (coleccion, id)
  )`,
  `CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
];

/** Usuarios de prueba creados solo en desarrollo. */
export const USUARIOS_DEV = [
  { email: 'aleida@dev.local', nombre: 'Aleida Rodríguez', rol: 'vecino', torre: 'austro', apartamento: '402', slug: 'dulces-aleida' },
  { email: 'julio@dev.local', nombre: 'Julio Martínez', rol: 'vecino', torre: 'cierzo', apartamento: '301', slug: 'reparaciones-don-julio' },
  { email: 'nuevo@dev.local', nombre: 'Camila Vecina', rol: 'vecino', torre: 'mistral', apartamento: '110', slug: null },
  { email: 'comite@dev.local', nombre: 'Comité de la Feria', rol: 'admin', torre: null, apartamento: '', slug: null },
] as const;

const ahora = () => new Date().toISOString();

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
  const semilla = await db.prepare(`SELECT valor FROM meta WHERE clave = 'semilla'`).first<{ valor: string }>();
  if (!semilla) await sembrar(db);
  if (import.meta.env.DEV) await sembrarUsuariosDev(db);
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
    const datos = sanearDatos({ ...e.data, recibir_avisos: true }, datosVacios({ emoji_placeholder: e.data.emoji_placeholder }));
    const json = JSON.stringify(datos);
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO emprendedores (slug, owner_email, estado, motivo, borrador, publicado, borrador_at, publicado_at, creado_at)
           VALUES (?, NULL, 'aprobado', '', ?, ?, ?, ?, ?)`,
        )
        .bind(e.id, json, json, t, t, t),
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

async function sembrarUsuariosDev(db: D1Database) {
  for (const u of USUARIOS_DEV) {
    const existe = await obtenerUsuario(db, u.email);
    if (existe) continue;
    if (u.rol === 'admin') {
      await db
        .prepare(`INSERT OR IGNORE INTO usuarios (email, nombre, rol, torre, apartamento, slug, email_avisos, creado_at) VALUES (?, ?, 'admin', NULL, '', NULL, ?, ?)`)
        .bind(u.email, u.nombre, u.email, ahora())
        .run();
      continue;
    }
    if (u.slug) {
      await db
        .prepare(`INSERT OR IGNORE INTO usuarios (email, nombre, rol, torre, apartamento, slug, email_avisos, creado_at) VALUES (?, ?, 'vecino', ?, ?, ?, ?, ?)`)
        .bind(u.email, u.nombre, u.torre, u.apartamento, u.slug, u.email, ahora())
        .run();
      await db.prepare(`UPDATE emprendedores SET owner_email = ? WHERE slug = ? AND owner_email IS NULL`).bind(u.email, u.slug).run();
    } else {
      await crearCuenta(db, { email: u.email, nombre: u.nombre, rol: 'vecino', torre: u.torre as TorreId, apartamento: u.apartamento });
    }
  }
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
  estado: Estado;
  motivo: string;
  borrador: string;
  publicado: string | null;
  borrador_at: string | null;
  publicado_at: string | null;
  creado_at: string;
}

function aRegistro(f: FilaEmprendedor): Registro {
  return {
    ...f,
    borrador: { ...datosVacios(), ...JSON.parse(f.borrador) },
    publicado: f.publicado ? { ...datosVacios(), ...JSON.parse(f.publicado) } : null,
  };
}

export function estadoVisible(r: Registro): EstadoVisible {
  if (r.estado === 'rechazado') return 'rechazado';
  if (!r.publicado) return 'borrador';
  if (r.estado === 'pendiente') return 'pendiente';
  return r.publicado.publicado ? 'publicado' : 'oculto';
}

export function tieneCambiosSinPublicar(r: Registro) {
  if (!r.publicado) return true;
  return JSON.stringify(r.borrador) !== JSON.stringify(r.publicado);
}

export async function obtenerRegistro(db: D1Database, slug: string): Promise<Registro | null> {
  const fila = await db.prepare(`SELECT * FROM emprendedores WHERE slug = ?`).bind(slug).first<FilaEmprendedor>();
  return fila ? aRegistro(fila) : null;
}

export async function listarRegistros(db: D1Database): Promise<Registro[]> {
  const { results } = await db.prepare(`SELECT * FROM emprendedores ORDER BY creado_at DESC`).all<FilaEmprendedor>();
  return results.map(aRegistro);
}

/** Lo que ve la landing: aprobado por el comité + publicado por el vecino + toggle "publicar" encendido. */
export async function listarPublicos(db: D1Database): Promise<EmprendedorPublico[]> {
  const { results } = await db
    .prepare(`SELECT slug, publicado FROM emprendedores WHERE estado = 'aprobado' AND publicado IS NOT NULL`)
    .all<{ slug: string; publicado: string }>();
  return results
    .map((r) => ({ ...datosVacios(), ...JSON.parse(r.publicado), slug: r.slug }) as EmprendedorPublico)
    .filter((e) => e.publicado)
    .sort((a, b) => Number(b.destacado) - Number(a.destacado) || a.nombre_emprendimiento.localeCompare(b.nombre_emprendimiento, 'es'));
}

export async function guardarBorrador(db: D1Database, slug: string, datos: DatosEmprendimiento) {
  const t = ahora();
  await db.prepare(`UPDATE emprendedores SET borrador = ?, borrador_at = ? WHERE slug = ?`).bind(JSON.stringify(datos), t, slug).run();
  return t;
}

/** Copia el borrador a la versión pública. Si estaba rechazado vuelve a revisión. */
export async function publicarRegistro(db: D1Database, slug: string, datos: DatosEmprendimiento) {
  const t = ahora();
  const json = JSON.stringify(datos);
  await db
    .prepare(
      `UPDATE emprendedores
         SET borrador = ?, publicado = ?, borrador_at = ?, publicado_at = ?,
             estado = CASE WHEN estado = 'rechazado' THEN 'pendiente' ELSE estado END,
             motivo = CASE WHEN estado = 'rechazado' THEN '' ELSE motivo END
       WHERE slug = ?`,
    )
    .bind(json, json, t, t, slug)
    .run();
  return t;
}

export async function cambiarEstado(db: D1Database, slug: string, estado: Estado, motivo = '') {
  await db.prepare(`UPDATE emprendedores SET estado = ?, motivo = ? WHERE slug = ?`).bind(estado, motivo, slug).run();
}

/** El comité destaca/quita del carrusel: se aplica al borrador y a la versión pública. */
export async function marcarDestacado(db: D1Database, slug: string, valor: boolean) {
  const r = await obtenerRegistro(db, slug);
  if (!r) return;
  const borrador = { ...r.borrador, destacado: valor };
  const publicado = r.publicado ? { ...r.publicado, destacado: valor } : null;
  await db
    .prepare(`UPDATE emprendedores SET borrador = ?, publicado = ? WHERE slug = ?`)
    .bind(JSON.stringify(borrador), publicado ? JSON.stringify(publicado) : null, slug)
    .run();
}

export async function borrarRegistro(db: D1Database, slug: string) {
  await db.batch([
    db.prepare(`DELETE FROM emprendedores WHERE slug = ?`).bind(slug),
    db.prepare(`UPDATE usuarios SET slug = NULL WHERE slug = ?`).bind(slug),
  ]);
}

// ───────────────────────── Usuarios ─────────────────────────

export async function obtenerUsuario(db: D1Database, email: string): Promise<Usuario | null> {
  return db.prepare(`SELECT * FROM usuarios WHERE email = ?`).bind(email.toLowerCase()).first<Usuario>();
}

export async function listarUsuarios(db: D1Database): Promise<Usuario[]> {
  const { results } = await db.prepare(`SELECT * FROM usuarios ORDER BY rol, creado_at DESC`).all<Usuario>();
  return results;
}

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

export interface NuevaCuenta {
  email: string;
  nombre: string;
  rol: Rol;
  torre: TorreId | null;
  apartamento: string;
  /** Asignar un emprendimiento existente (p. ej. uno sembrado) en lugar de crear uno vacío. */
  slug?: string | null;
}

/** Crea la cuenta del vecino y su emprendimiento vacío (en borrador) listo para completar en /admin. */
export async function crearCuenta(db: D1Database, c: NuevaCuenta): Promise<Usuario> {
  const email = c.email.toLowerCase();
  let slug: string | null = null;
  if (c.rol === 'vecino') {
    if (c.slug && (await obtenerRegistro(db, c.slug))) {
      slug = c.slug;
      await db.prepare(`UPDATE emprendedores SET owner_email = ? WHERE slug = ?`).bind(email, slug).run();
    } else {
      slug = await slugLibre(db, `${c.torre ?? 'torre'}-${c.apartamento || email.split('@')[0]}`);
      const datos = datosVacios({ nombre_vecino: c.nombre, apartamento: c.apartamento, torre: c.torre ?? 'mistral' });
      await db
        .prepare(
          `INSERT INTO emprendedores (slug, owner_email, estado, motivo, borrador, publicado, borrador_at, publicado_at, creado_at)
           VALUES (?, ?, 'pendiente', '', ?, NULL, NULL, NULL, ?)`,
        )
        .bind(slug, email, JSON.stringify(datos), ahora())
        .run();
    }
  }
  const usuario: Usuario = {
    email,
    nombre: c.nombre,
    rol: c.rol,
    torre: c.torre,
    apartamento: c.apartamento,
    slug,
    email_avisos: email,
    creado_at: ahora(),
  };
  await db
    .prepare(
      `INSERT OR REPLACE INTO usuarios (email, nombre, rol, torre, apartamento, slug, email_avisos, creado_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(usuario.email, usuario.nombre, usuario.rol, usuario.torre, usuario.apartamento, usuario.slug, usuario.email_avisos, usuario.creado_at)
    .run();
  return usuario;
}

export async function borrarCuenta(db: D1Database, email: string) {
  await db.batch([
    db.prepare(`UPDATE emprendedores SET owner_email = NULL WHERE owner_email = ?`).bind(email),
    db.prepare(`DELETE FROM usuarios WHERE email = ?`).bind(email),
  ]);
}

export async function actualizarCuenta(db: D1Database, email: string, cambios: { nombre?: string; email_avisos?: string; torre?: TorreId; apartamento?: string }) {
  const u = await obtenerUsuario(db, email);
  if (!u) return null;
  const nuevo = { ...u, ...cambios };
  await db
    .prepare(`UPDATE usuarios SET nombre = ?, email_avisos = ?, torre = ?, apartamento = ? WHERE email = ?`)
    .bind(nuevo.nombre, nuevo.email_avisos, nuevo.torre, nuevo.apartamento, u.email)
    .run();
  return nuevo;
}

// ───────────────────────── Vistas para panel y comité ─────────────────────────

export function resumenPanel(r: Registro) {
  return {
    slug: r.slug,
    estado: r.estado,
    estado_visible: estadoVisible(r),
    motivo: r.motivo,
    torre_publicada: r.publicado?.torre ?? null,
    borrador: r.borrador,
    borrador_at: r.borrador_at,
    publicado_at: r.publicado_at,
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
    whatsapp: d.whatsapp,
    instagram: d.instagram,
    tiktok: d.tiktok,
    facebook: d.facebook,
    foto: d.foto_principal,
    emoji: d.emoji_placeholder,
    destacado: d.destacado,
    recibir_avisos: d.recibir_avisos,
    owner_email: r.owner_email,
    estado: r.estado,
    estado_visible: estadoVisible(r),
    motivo: r.motivo,
    cambios_sin_publicar: tieneCambiosSinPublicar(r),
    publicado_at: r.publicado_at,
    borrador_at: r.borrador_at,
    creado_at: r.creado_at,
  };
}
export type FilaComite = ReturnType<typeof filaComite>;
