// Exporta emprendedores a CSV para la logística de la feria física.
// Separador ";" + BOM UTF-8 para que Excel en español lo abra con tildes y columnas correctas.
// Acepta los mismos filtros que la tabla: ?torre=&categoria=&estado=&q=
import type { APIRoute } from 'astro';
import { categoria as cat } from '../../../lib/constantes';
import { filaComite, listarRegistros, listarTorres, type FilaComite } from '../../../lib/db';

const ETIQUETA_ESTADO: Record<FilaComite['estado_visible'], string> = {
  publicado: 'Publicado',
  oculto: 'Oculto por el vecino',
  pendiente: 'Pendiente de aprobación',
  rechazado: 'Rechazado',
  borrador: 'Borrador',
};

function celda(v: unknown) {
  const s = String(v ?? '').replace(/\r?\n/g, ' ');
  // Evita que Excel interprete celdas como fórmulas (CSV injection).
  const seguro = /^[=+\-@\t]/.test(s) ? `'${s}` : s;
  return /[";]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const db = locals.runtime.env.DB;
  const [registros, torres] = await Promise.all([listarRegistros(db), listarTorres(db)]);
  const f = {
    torre: url.searchParams.get('torre') ?? '',
    categoria: url.searchParams.get('categoria') ?? '',
    estado: url.searchParams.get('estado') ?? '',
    q: (url.searchParams.get('q') ?? '').toLowerCase(),
  };
  const filas = registros
    .map(filaComite)
    .filter(
      (r) =>
        (!f.torre || r.torre === f.torre) &&
        (!f.categoria || r.categoria === f.categoria) &&
        (!f.estado || r.estado_visible === f.estado) &&
        (!f.q || `${r.nombre} ${r.vecino} ${r.apartamento}`.toLowerCase().includes(f.q)),
    )
    .sort((a, b) => a.torre.localeCompare(b.torre) || a.apartamento.localeCompare(b.apartamento, 'es', { numeric: true }));

  const nombreTorre = (id: string) => torres.find((t) => t.id === id)?.nombre ?? id;
  const encabezado = ['Emprendimiento', 'Vecino', 'Torre', 'Apartamento', 'Categoría', 'WhatsApp (+57)', 'Instagram (@)', 'TikTok (@)', 'Facebook', 'Página web', 'Estado', 'Destacado', 'Recibe avisos', 'Correo de acceso', 'Descripción corta', 'Última publicación'];
  const lineas = filas.map((r) =>
    [
      r.nombre,
      r.vecino,
      nombreTorre(r.torre),
      r.apartamento,
      cat(r.categoria).label,
      r.whatsapp.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3'),
      r.instagram,
      r.tiktok,
      r.facebook ? `facebook.com/${r.facebook}` : '',
      r.pagina_web,
      ETIQUETA_ESTADO[r.estado_visible],
      r.destacado ? 'Sí' : 'No',
      r.recibir_avisos ? 'Sí' : 'No',
      r.owner_email ?? '',
      r.descripcion_corta,
      r.publicado_at ? r.publicado_at.slice(0, 10) : '',
    ]
      .map(celda)
      .join(';'),
  );
  const csv = '﻿' + [encabezado.map(celda).join(';'), ...lineas].join('\r\n');
  const hoy = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="feria-4-vientos-emprendedores-${hoy}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
