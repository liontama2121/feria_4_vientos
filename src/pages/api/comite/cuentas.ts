// Alta y baja de cuentas de vecinos (y de otros miembros del comité).
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { borrarCuenta, crearCuenta, listarUsuarios, obtenerUsuario, type Rol } from '../../../lib/db';
import { esEmail, esTorre, texto } from '../../../lib/validacion';
import { sincronizarGrupoVecinos } from '../../../lib/zerotrust';

export const GET: APIRoute = async ({ locals }) => json(await listarUsuarios(locals.runtime.env.DB));

export const POST: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ email?: string; nombre?: string; rol?: Rol; torre?: string; apartamento?: string; slug?: string }>(request);
  const email = body?.email?.trim().toLowerCase();
  if (!body || !esEmail(email)) return error('Escribe un correo válido (el mismo con el que entra a Google).');
  const rol: Rol = body.rol === 'admin' ? 'admin' : 'vecino';
  if (rol === 'vecino' && !esTorre(body.torre)) return error('Elige la torre del vecino.');
  const apartamento = texto(body.apartamento, 10);
  if (rol === 'vecino' && !apartamento) return error('Escribe el apartamento del vecino.');

  const db = locals.runtime.env.DB;
  if (await obtenerUsuario(db, email)) return error('Ya existe una cuenta con ese correo.', 409);

  const usuario = await crearCuenta(db, {
    email,
    nombre: texto(body.nombre, 80),
    rol,
    torre: rol === 'vecino' && esTorre(body.torre) ? body.torre : null,
    apartamento,
    slug: texto(body.slug, 80) || null,
  });
  const zerotrust = await sincronizarGrupoVecinos(locals.runtime.env, email, 'agregar');
  return json({ usuario, zerotrust }, 201);
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const body = await leerJson<{ email?: string }>(request);
  const email = body?.email?.trim().toLowerCase();
  if (!email) return error('Falta el correo.');
  if (email === locals.usuario!.email) return error('No puedes borrar tu propia cuenta.');
  await borrarCuenta(locals.runtime.env.DB, email);
  const zerotrust = await sincronizarGrupoVecinos(locals.runtime.env, email, 'quitar');
  return json({ ok: true, zerotrust });
};
