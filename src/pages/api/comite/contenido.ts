// Edición de torres, patrocinadores y fechas desde /admin/comite.
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { TIPOS_PATROCINADOR } from '../../../lib/constantes';
import {
  borrarFecha,
  borrarPatrocinador,
  guardarFecha,
  guardarPatrocinador,
  guardarTorre,
  listarFechas,
  listarPatrocinadores,
  listarTorres,
  type Fecha,
  type Patrocinador,
  type Torre,
} from '../../../lib/db';
import { esTorre, texto, urlFoto } from '../../../lib/validacion';

type Coleccion = 'torres' | 'patrocinadores' | 'fechas';
const HEX = /^#[0-9A-Fa-f]{6}$/;

function slugDe(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;
  const [torres, patrocinadores, fechas] = await Promise.all([listarTorres(db), listarPatrocinadores(db), listarFechas(db)]);
  return json({ torres, patrocinadores, fechas });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ coleccion?: Coleccion; item?: Record<string, unknown> }>(request);
  const i = body?.item;
  if (!body || !i) return error('Faltan datos.');
  const db = locals.runtime.env.DB;

  if (body.coleccion === 'torres') {
    if (!esTorre(i.id)) return error('Conjunto desconocido.');
    const color = texto(i.color_hex, 7);
    const claro = texto(i.color_claro, 7);
    if (!HEX.test(color) || !HEX.test(claro)) return error('Los colores deben ser hexadecimales tipo #1E9C8C.');
    const torre: Torre = {
      id: i.id,
      nombre: texto(i.nombre, 30) || i.id,
      rumbo: texto(i.rumbo, 40),
      caracter: texto(i.caracter, 40),
      color_hex: color.toUpperCase(),
      color_claro: claro.toUpperCase(),
      tagline: texto(i.tagline, 140),
      emoji_simbolo: texto(i.emoji_simbolo, 16),
      orden: Number(i.orden) || 1,
    };
    await guardarTorre(db, torre);
    return json(torre);
  }

  if (body.coleccion === 'patrocinadores') {
    const nombre = texto(i.nombre, 80);
    if (!nombre) return error('El patrocinador necesita nombre.');
    const tipo = TIPOS_PATROCINADOR.includes(i.tipo as never) ? (i.tipo as Patrocinador['tipo']) : 'comunitario';
    const p: Patrocinador = {
      id: texto(i.id, 60) || slugDe(nombre),
      nombre,
      tipo,
      etiqueta: texto(i.etiqueta, 40),
      rol_corto: texto(i.rol_corto, 80),
      descripcion: texto(i.descripcion, 400),
      logo: urlFoto(i.logo),
      emoji: texto(i.emoji, 16) || '🤝',
      orden: Number(i.orden) || 1,
      destacado: i.destacado === true,
    };
    await guardarPatrocinador(db, p);
    return json(p);
  }

  if (body.coleccion === 'fechas') {
    const fecha = texto(i.fecha, 10);
    const hi = texto(i.hora_inicio, 5);
    const hf = texto(i.hora_fin, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return error('Fecha inválida.');
    if (!/^\d{2}:\d{2}$/.test(hi) || !/^\d{2}:\d{2}$/.test(hf)) return error('Horas inválidas (usa HH:MM).');
    const f: Fecha = {
      id: texto(i.id, 60) || `${fecha}-${crypto.randomUUID().slice(0, 8)}`,
      titulo: texto(i.titulo, 80) || 'Feria 4 Vientos',
      fecha,
      hora_inicio: hi,
      hora_fin: hf,
      descripcion: texto(i.descripcion, 300),
    };
    await guardarFecha(db, f);
    return json(f);
  }

  return error('Colección desconocida.');
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ coleccion?: Coleccion; id?: string }>(request);
  if (!body?.id) return error('Falta el id.');
  const db = locals.runtime.env.DB;
  if (body.coleccion === 'fechas') await borrarFecha(db, body.id);
  else if (body.coleccion === 'patrocinadores') await borrarPatrocinador(db, body.id);
  else return error('Esa colección no se puede borrar.');
  return json({ ok: true });
};
