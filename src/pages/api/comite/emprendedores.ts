// Gestión de emprendedores por el comité: listar, crear, aprobar, ocultar, destacar, borrar.
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { borrarRegistro, cambiarEstado, crearEmprendimiento, filaComite, listarRegistros, marcarDestacado, obtenerRegistro } from '../../../lib/db';
import { esTorre, texto } from '../../../lib/validacion';

export const GET: APIRoute = async ({ locals }) => {
  const registros = await listarRegistros(locals.runtime.env.DB);
  return json(registros.map(filaComite));
};

/** Crea un emprendimiento vacío; el comité lo completa en /admin?slug=… */
export const POST: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ nombre_vecino?: string; torre?: string; apartamento?: string; nombre_emprendimiento?: string }>(request);
  if (!body || !esTorre(body.torre)) return error('Elige el conjunto.');
  const apartamento = texto(body.apartamento, 10);
  if (!apartamento) return error('Escribe el apartamento.');
  const slug = await crearEmprendimiento(locals.runtime.env.DB, {
    nombre_vecino: texto(body.nombre_vecino, 80),
    torre: body.torre,
    apartamento,
    nombre_emprendimiento: texto(body.nombre_emprendimiento, 80),
  });
  return json({ slug }, 201);
};

type Accion = 'aprobar' | 'rechazar' | 'destacar';

export const PATCH: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ slug?: string; accion?: Accion; valor?: boolean; motivo?: string }>(request);
  if (!body?.slug || !body.accion) return error('Falta el emprendimiento o la acción.');
  const db = locals.runtime.env.DB;
  const registro = await obtenerRegistro(db, body.slug);
  if (!registro) return error('No encontramos el emprendimiento.', 404);

  switch (body.accion) {
    case 'aprobar':
      await cambiarEstado(db, body.slug, 'aprobado');
      break;
    case 'rechazar':
      await cambiarEstado(db, body.slug, 'rechazado', texto(body.motivo, 400) || 'El comité necesita que revises tu registro.');
      break;
    case 'destacar':
      await marcarDestacado(db, body.slug, body.valor === true);
      break;
    default:
      return error('Acción desconocida.');
  }
  return json(filaComite((await obtenerRegistro(db, body.slug))!));
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ slug?: string }>(request);
  if (!body?.slug) return error('Falta el emprendimiento.');
  await borrarRegistro(locals.runtime.env.DB, body.slug);
  return json({ ok: true });
};
