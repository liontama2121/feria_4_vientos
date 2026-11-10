// Cerrar o reabrir las inscripciones de una feria. Lo pueden hacer las coordinadoras y el admin.
// Es lo ÚNICO de la feria que coordinación puede cambiar: solo pasa el estado entre
// "inscripciones" y "cerrada" (fechas, conjuntos, cupos y valor siguen siendo del admin).
import type { APIRoute } from 'astro';
import { error, json, leerJson } from '../../../lib/api';
import { guardarFecha, listarFechas } from '../../../lib/db';
import { cierreInscripciones, estadoFeria, hoyBogota } from '../../../lib/fechas';

export const PATCH: APIRoute = async ({ locals, request }) => {
  const db = locals.runtime.env.DB;
  const body = await leerJson<{ feria?: string; accion?: 'cerrar' | 'abrir' }>(request);
  const feria = (await listarFechas(db)).find((f) => f.id === body?.feria);
  if (!feria) return error('No encontramos esa feria.', 404);
  const estado = estadoFeria(feria);

  if (body?.accion === 'cerrar') {
    if (estado !== 'inscripciones') return error('Las inscripciones de esta feria ya están cerradas.', 409);
    const f = { ...feria, estado: 'cerrada' as const, activa: true };
    await guardarFecha(db, f);
    return json({ feria: f });
  }
  if (body?.accion === 'abrir') {
    if (estado !== 'cerrada') return error('Solo se reabren ferias con inscripciones cerradas.', 409);
    if (hoyBogota() > cierreInscripciones(feria)) return error('La fecha límite de inscripción ya pasó. El administrador debe cambiarla para reabrir.', 409);
    const f = { ...feria, estado: 'inscripciones' as const, activa: true };
    await guardarFecha(db, f);
    return json({ feria: f });
  }
  return error('Acción desconocida.');
};
