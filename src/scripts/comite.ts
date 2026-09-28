// Lógica de /admin/comite. Todo se pinta desde los datos en memoria y cada acción
// llama a /api/comite/* y actualiza solo lo que cambió.
import type { Calificacion, Cuenta, EstadoReporte, EstadoVisible, Fecha, FilaComite, Notificacion, Patrocinador, Reporte, Solicitud, Torre } from '../lib/db';
import { estaActiva as estaActivaEn } from '../lib/fechas';
import { CATEGORIA_COMODIN, categoria, type Categoria } from '../lib/constantes';

interface DatosComite {
  filas: FilaComite[];
  torres: Torre[];
  patrocinadores: Patrocinador[];
  fechas: Fecha[];
  cuentas: Cuenta[];
  notificaciones: Notificacion[];
  calificaciones: Calificacion[];
  reportes: Reporte[];
  solicitudes: Solicitud[];
  motivos: { id: string; label: string }[];
  /** Correos de ADMIN_EMAILS: al activar esas cuentas tendrán acceso total. */
  admins: string[];
  categorias: Categoria[];
  /** Emprendimientos (cualquier estado) por id de categoría. */
  usosCategorias: Record<string, number>;
  /** Las base no se borran, solo se ocultan. */
  categoriasBase: string[];
}

const TABS = ['emprendedores', 'cuentas', 'resenas', 'notificaciones', 'categorias', 'torres', 'patrocinadores', 'fechas'] as const;
type Tab = (typeof TABS)[number];
type Attrs = Record<string, unknown> & { class?: string; text?: string | number; on?: Record<string, (ev: Event) => void>; style?: string };

/** Crea elementos sin innerHTML: todo texto de usuario entra como textContent. */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...hijos: (Node | string | null | false | undefined)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'on') Object.entries(v as Record<string, EventListener>).forEach(([ev, fn]) => el.addEventListener(ev, fn));
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...(hijos.filter(Boolean) as (Node | string)[]));
  return el;
}

const ETIQUETA: Record<EstadoVisible, string> = {
  pending_review: 'En revisión',
  approved: 'Aprobado',
  oculto: 'Aprobado · oculto',
  changes_requested: 'Cambios pedidos',
  rejected: 'Rechazado',
  draft: 'Borrador',
};

const ETIQUETA_CUENTA: Record<Cuenta['estado'], string> = {
  pending_activation: 'Por activar',
  active: 'Activa',
  rejected: 'Rechazada',
};

/** "Mistral 402", o solo "Mistral" si no dio torre/apto. */
const donde = (t: Torre, apto: string) => `${t.nombre}${apto ? ` ${apto}` : ''}`;
const wsp = (numero: string, mensaje: string) => `https://wa.me/57${numero}?text=${encodeURIComponent(mensaje)}`;
const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

export function iniciarComite() {
  const nodo = document.getElementById('comite-datos');
  if (!nodo?.textContent) return;
  const D = JSON.parse(nodo.textContent) as DatosComite;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const torreDe = (id: string | null) => D.torres.find((t) => t.id === id) ?? D.torres[0];
  const catDe = (id: string) => categoria(id, D.categorias);

  function toast(msg: string, tipo: 'ok' | 'error' | 'info' = 'info', enlace?: { href: string; texto: string }) {
    const t = h(
      'div',
      { class: `toast ${tipo}`, text: msg },
      enlace ? h('a', { href: enlace.href, target: '_blank', rel: 'noopener', text: ` ${enlace.texto}`, style: 'color:inherit;text-decoration:underline;margin-left:6px' }) : null,
    );
    $('toasts').append(t);
    setTimeout(() => t.remove(), enlace ? 12000 : tipo === 'error' ? 6000 : 3500);
  }

  /** Guarda la notificación nueva en la bandeja y avisa con un toast que abre el WhatsApp del vecino. */
  function notificar(msg: string, n: Notificacion | null | undefined) {
    if (n) {
      D.notificaciones = [n, ...D.notificaciones];
      renderNotificaciones();
    }
    toast(msg, 'ok', n?.whatsapp ? { href: wsp(n.whatsapp, n.mensaje), texto: 'Avisar por WhatsApp' } : undefined);
  }

  async function api<T = unknown>(url: string, metodo: string, cuerpo?: unknown): Promise<T> {
    const res = await fetch(url, {
      method: metodo,
      headers: cuerpo instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo instanceof FormData ? cuerpo : cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((j as { error?: string }).error || 'Algo salió mal. Intenta de nuevo.');
    return j as T;
  }

  function confirmar(texto: string, boton = 'Sí, eliminar'): Promise<boolean> {
    const dlg = $<HTMLDialogElement>('dlgConfirmar');
    $('confirmarTexto').textContent = texto;
    dlg.querySelector('button[value="ok"]')!.textContent = boton;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((r) => dlg.addEventListener('close', () => r(dlg.returnValue === 'ok'), { once: true }));
  }

  // ───────────────────────── Tabs ─────────────────────────
  function irA(tab: Tab) {
    document.querySelectorAll<HTMLElement>('[data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    document.querySelectorAll<HTMLElement>('[data-tab-panel]').forEach((p) => (p.hidden = p.dataset.tabPanel !== tab));
    history.replaceState(null, '', `#${tab}`);
  }
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((a) =>
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      irA(a.dataset.tab as Tab);
    }),
  );

  function badges() {
    const pendientes = D.filas.filter((f) => f.estado === 'pending_review').length;
    const cuentas = D.cuentas.filter((c) => c.estado === 'pending_activation').length;
    const avisos = D.notificaciones.filter((n) => !n.enviada && n.para === 'vecino').length;
    const set = (tab: string, v: string) => {
      const b = document.querySelector<HTMLElement>(`[data-badge="${tab}"]`);
      if (b) b.textContent = v;
    };
    set('emprendedores', pendientes ? `${pendientes} por revisar` : String(D.filas.length));
    const solicitudes = D.solicitudes.filter((s) => s.estado === 'pendiente').length;
    set('cuentas', cuentas || solicitudes ? `${cuentas + solicitudes} por revisar` : String(D.cuentas.length));
    set('notificaciones', avisos ? `${avisos} por enviar` : '');
    const reportes = D.reportes.filter((r) => r.estado === 'abierto').length;
    set('resenas', reportes ? `${reportes} ⚠️` : String(D.calificaciones.length));
    set('categorias', String(D.categorias.filter((c) => !c.oculta).length));
    set('torres', String(D.torres.length));
    set('patrocinadores', String(D.patrocinadores.length));
    set('fechas', D.fechas.some(estaActiva) ? 'activa' : String(D.fechas.length));
  }

  // ───────────────────────── Emprendedores ─────────────────────────
  const fBuscar = $<HTMLInputElement>('fBuscar');
  const fTorre = $<HTMLSelectElement>('fTorre');
  const fCategoria = $<HTMLSelectElement>('fCategoria');
  const fEstado = $<HTMLSelectElement>('fEstado');
  const fFeria = $<HTMLSelectElement>('fFeria');

  fTorre.append(h('option', { value: '', text: 'Todos' }), ...D.torres.map((t) => h('option', { value: t.id, text: `${t.emoji_simbolo} ${t.nombre}` })));
  fCategoria.append(h('option', { value: '', text: 'Todas' }), ...D.categorias.map((c) => h('option', { value: c.id, text: `${c.emoji} ${c.label}` })));

  function filtros() {
    return { q: fBuscar.value.trim().toLowerCase(), torre: fTorre.value, categoria: fCategoria.value, estado: fEstado.value, feria: fFeria.value };
  }

  function filtradas() {
    const f = filtros();
    const orden: Record<EstadoVisible, number> = { pending_review: 0, changes_requested: 1, draft: 2, approved: 3, oculto: 4, rejected: 5 };
    return D.filas
      .filter(
        (r) =>
          (!f.torre || r.torre === f.torre) &&
          (!f.categoria || r.categoria === f.categoria) &&
          (!f.estado || r.estado_visible === f.estado) &&
          (!f.feria || r.en_feria === (f.feria === 'si')) &&
          (!f.q || `${r.nombre} ${r.vecino} ${r.apartamento} ${r.owner_email ?? ''}`.toLowerCase().includes(f.q)),
      )
      .sort((a, b) => orden[a.estado_visible] - orden[b.estado_visible] || a.nombre.localeCompare(b.nombre, 'es'));
  }

  function renderStats() {
    const c = (e: EstadoVisible) => D.filas.filter((f) => f.estado_visible === e).length;
    const stat = (n: number, l: string, cls = '') => h('div', { class: `stat ${cls}` }, h('b', { text: n }), h('span', { text: l }));
    $('stats').replaceChildren(
      stat(D.filas.length, 'Emprendimientos'),
      stat(c('approved'), 'En la landing', 'verde'),
      stat(c('pending_review'), 'Por revisar', 'naranja'),
      stat(D.filas.filter((f) => f.en_feria && f.estado === 'approved').length, 'En la feria', 'morado'),
    );
  }

  async function accion(slug: string, cuerpo: Record<string, unknown>, ok: string) {
    try {
      const r = await api<{ fila: FilaComite; notificacion: Notificacion | null }>('/api/comite/emprendedores', 'PATCH', { slug, ...cuerpo });
      D.filas = D.filas.map((f) => (f.slug === slug ? r.fila : f));
      notificar(ok, r.notificacion);
      renderEmprendedores();
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    }
  }

  // ───────────────────────── Moderación: rechazar / pedir cambios (con nota) ─────────────────────────
  const dlgModerar = $<HTMLDialogElement>('dlgModerar');
  const notaModerar = $<HTMLTextAreaElement>('moderarNota');

  function pedirNota(tipo: 'rechazar' | 'pedir_cambios', r: FilaComite): Promise<string | null> {
    const rechazo = tipo === 'rechazar';
    $('dlgModerarTitulo').textContent = rechazo ? `Rechazar “${r.nombre || r.slug}”` : `Pedir cambios a “${r.nombre || r.slug}”`;
    $('moderarTexto').textContent = rechazo
      ? 'El vecino verá este motivo en su panel y no podrá editar. Queda un aviso listo para mandarle por WhatsApp.'
      : 'El vecino verá esta nota y podrá editar y reenviar. Queda un aviso listo para mandarle por WhatsApp.';
    $('moderarLabel').textContent = rechazo ? 'Motivo del rechazo' : 'Qué debe ajustar';
    const ok = $<HTMLButtonElement>('moderarOk');
    ok.textContent = rechazo ? '✕ Rechazar' : '✎ Pedir cambios';
    ok.className = `btn ${rechazo ? 'btn-rechazar' : 'btn-cambios'}`;
    notaModerar.value = '';
    dlgModerar.returnValue = '';
    dlgModerar.showModal();
    return new Promise((res) =>
      dlgModerar.addEventListener('close', () => res(dlgModerar.returnValue === 'ok' && notaModerar.value.trim() ? notaModerar.value.trim() : null), { once: true }),
    );
  }

  async function moderar(tipo: 'aprobar' | 'rechazar' | 'pedir_cambios', r: FilaComite) {
    const nombre = r.nombre || 'Emprendimiento';
    if (tipo === 'aprobar') return accion(r.slug, { accion: 'aprobar' }, `${nombre} aprobado y publicado ✓`);
    const nota = await pedirNota(tipo, r);
    if (!nota) return false;
    return tipo === 'rechazar'
      ? accion(r.slug, { accion: 'rechazar', motivo: nota }, `${nombre} rechazado`)
      : accion(r.slug, { accion: 'pedir_cambios', nota }, `Cambios pedidos a ${nombre}`);
  }

  function solicitud(r: FilaComite) {
    const t = torreDe(r.torre);
    const cat = catDe(r.categoria);
    const fotos = [r.foto, ...r.galeria].filter(Boolean);
    const dato = (k: string, v: string, href?: string) =>
      v ? [h('dt', { text: k }), h('dd', {}, href ? h('a', { href, target: '_blank', rel: 'noopener', text: v }) : v)] : [];
    return h(
      'article',
      { class: 'card solicitud', style: `--t:${t.color_hex};--t-claro:${t.color_claro}` },
      h(
        'div',
        { class: 'solicitud-head' },
        h(
          'div',
          {},
          h('h3', { text: r.nombre || 'Sin nombre' }),
          h('div', { class: 'sub', text: `${r.vecino || 'Vecino sin nombre'} · ${donde(t, r.apartamento)} · enviado ${fechaCorta(r.enviado_at)}` }),
        ),
        h('div', { class: 'meta' }, h('span', { class: 'pill-t', text: `${t.emoji_simbolo} ${t.nombre}${r.apartamento ? ` · Apto ${r.apartamento}` : ''}` }), h('span', { class: 'sub', text: `${cat.emoji} ${cat.label}` })),
      ),
      h('p', { class: 'corta', text: r.descripcion_corta }),
      r.descripcion_larga ? h('p', { class: 'desc-larga', text: r.descripcion_larga }) : null,
      fotos.length
        ? h('div', { class: 'fotos-sol' }, ...fotos.map((f, i) => h('a', { href: f, target: '_blank', rel: 'noopener', class: i === 0 ? 'principal' : '' }, h('img', { src: f, alt: '', loading: 'lazy' }))))
        : h('p', { class: 'sin-fotos', text: `Sin fotos · usa el emoji ${r.emoji || cat.emoji}` }),
      h(
        'dl',
        { class: 'datos-sol' },
        ...dato('WhatsApp', r.whatsapp ? `+57 ${r.whatsapp}` : '', r.whatsapp ? `https://wa.me/57${r.whatsapp}` : undefined),
        ...dato('Instagram', r.instagram ? `@${r.instagram}` : '', r.instagram ? `https://instagram.com/${r.instagram}` : undefined),
        ...dato('TikTok', r.tiktok ? `@${r.tiktok}` : '', r.tiktok ? `https://tiktok.com/@${r.tiktok}` : undefined),
        ...dato('Facebook', r.facebook, r.facebook ? `https://facebook.com/${r.facebook}` : undefined),
        ...dato('Página web', r.pagina_web, r.pagina_web || undefined),
        ...dato('Cuenta', r.owner_email ?? ''),
      ),
      h(
        'div',
        { class: 'acciones-sol' },
        h('button', { type: 'button', class: 'btn btn-sm btn-aprobar', text: '✓ Aprobar', on: { click: () => moderar('aprobar', r) } }),
        h('button', { type: 'button', class: 'btn btn-sm btn-rechazar', text: '✕ Rechazar', on: { click: () => moderar('rechazar', r) } }),
        h('button', { type: 'button', class: 'btn btn-sm btn-cambios', text: '✎ Pedir cambios', on: { click: () => moderar('pedir_cambios', r) } }),
        h('a', { class: 'btn btn-ghost btn-sm', href: `/admin?slug=${encodeURIComponent(r.slug)}`, text: 'Abrir en el editor' }),
      ),
    );
  }

  function renderCola() {
    const pendientes = D.filas
      .filter((f) => f.estado === 'pending_review')
      .sort((a, b) => (a.enviado_at ?? '').localeCompare(b.enviado_at ?? ''));
    const cont = $('contadorPendientes');
    cont.textContent = String(pendientes.length);
    cont.classList.toggle('cero', !pendientes.length);
    $('colaPendientes').replaceChildren(
      ...(pendientes.length ? pendientes.map(solicitud) : [h('div', { class: 'vacio-lista', text: 'Nada pendiente. Todo al día ✓' })]),
    );
  }

  function filaEmprendedor(r: FilaComite) {
    const t = torreDe(r.torre);
    const cat = catDe(r.categoria);
    const foto = h('div', { class: 'mini-foto' }, r.foto ? h('img', { src: r.foto, alt: '' }) : r.emoji || cat.emoji);

    const acciones = h('div', { class: 'fila-acciones' });
    acciones.append(
      h('button', {
        type: 'button',
        class: 'btn-feria',
        'aria-pressed': String(r.en_feria),
        title: r.en_feria ? 'Sacarlo de la feria (sigue en el directorio)' : 'Marcarlo como participante de la feria',
        text: r.en_feria ? '🎪 En la feria' : '＋ Feria',
        on: {
          click: () =>
            accion(r.slug, { accion: 'en_feria', valor: !r.en_feria }, r.en_feria ? `${r.nombre || 'Emprendimiento'} ya no está en la feria` : `${r.nombre || 'Emprendimiento'} está en la feria 🎪`),
        },
      }),
    );
    acciones.append(
      h('button', {
        type: 'button',
        class: 'estrella',
        'aria-pressed': String(r.destacado),
        title: r.destacado ? 'Quitar de la vitrina' : 'Destacar en la vitrina',
        'aria-label': r.destacado ? 'Quitar de la vitrina' : 'Destacar en la vitrina',
        text: r.destacado ? '★' : '☆',
        on: { click: () => accion(r.slug, { accion: 'destacar', valor: !r.destacado }, r.destacado ? 'Quitado de la vitrina' : 'Destacado en la vitrina ★') },
      }),
    );
    if (r.estado === 'approved') {
      const visible = r.estado_visible === 'approved';
      acciones.append(
        h('button', {
          type: 'button',
          class: `btn ${visible ? 'btn-ghost' : 'btn-primary'} btn-sm`,
          text: visible ? 'Ocultar' : 'Mostrar',
          title: visible ? 'Quitarlo de la landing sin borrarlo' : 'Volver a mostrarlo en la landing',
          on: {
            click: () =>
              accion(r.slug, { accion: 'visible', valor: !visible }, visible ? `${r.nombre || 'Emprendimiento'} oculto de la landing` : `${r.nombre || 'Emprendimiento'} visible en la landing ✓`),
          },
        }),
      );
    }
    // Link para compartir /e/<slug>: solo sirve si está publicado en la landing.
    if (r.estado_visible === 'approved') {
      const link = `${location.origin}/e/${encodeURIComponent(r.slug)}`;
      acciones.append(
        h('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: '🔗 Link',
          title: link,
          on: {
            click: async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast('Link copiado ✓', 'ok');
              } catch {
                toast(link, 'info');
              }
            },
          },
        }),
      );
      if (r.whatsapp) {
        acciones.append(
          h('a', {
            class: 'btn btn-sm btn-wsp',
            href: wsp(
              r.whatsapp,
              `¡Hola ${(r.vecino || '').split(' ')[0]}! 👋 Este es el link de "${r.nombre}" en la Feria 4 Vientos: ${link}\nCompártelo por WhatsApp y en tus redes: abre directo tu emprendimiento.`,
            ),
            target: '_blank',
            rel: 'noopener',
            text: 'Enviarle su link',
          }),
        );
      }
    }
    acciones.append(
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        text: '👤 Vincular',
        title: r.owner_email ? `Dueño: ${r.owner_email}` : 'Asignarlo a la cuenta de un vecino',
        on: { click: () => vincular(r) },
      }),
      h('a', { class: 'btn btn-ghost btn-sm', href: `/admin?slug=${encodeURIComponent(r.slug)}`, text: 'Editar' }),
      h('button', {
        type: 'button',
        class: 'btn btn-peligro btn-sm',
        text: 'Eliminar',
        on: {
          click: async () => {
            if (!(await confirmar(`Se eliminará “${r.nombre || r.slug}” de la feria. Las fotos quedan en R2. Esto no se puede deshacer.`))) return;
            try {
              await api('/api/comite/emprendedores', 'DELETE', { slug: r.slug });
              D.filas = D.filas.filter((f) => f.slug !== r.slug);
              toast('Emprendimiento eliminado', 'ok');
              renderEmprendedores();
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          },
        },
      }),
    );

    return h(
      'article',
      { class: 'fila', style: `--t:${t.color_hex};--t-claro:${t.color_claro}` },
      foto,
      h(
        'div',
        {},
        h('h3', { text: r.nombre || 'Sin nombre todavía' }),
        h('div', { class: 'sub', text: `${r.vecino || 'Vecino sin nombre'} · ${donde(t, r.apartamento)}${r.whatsapp ? ` · +57 ${r.whatsapp}` : ''}` }),
        h('div', { class: 'sub', text: r.owner_email ? `👤 ${r.owner_email}` : '👤 Sin cuenta (cargado por el comité)' }),
        r.estado === 'rejected' && r.motivo_rechazo ? h('div', { class: 'nota-fila', text: `Motivo: ${r.motivo_rechazo}` }) : null,
        r.estado === 'changes_requested' && r.nota_cambios ? h('div', { class: 'nota-fila', text: `Cambios pedidos: ${r.nota_cambios}` }) : null,
      ),
      h(
        'div',
        { class: 'meta' },
        h('span', { class: 'pill-t', text: `${t.emoji_simbolo} ${t.nombre}` }),
        h('span', { class: `pill-estado ${r.estado_visible}`, text: ETIQUETA[r.estado_visible] }),
        h('span', { class: 'sub', text: `${cat.emoji} ${cat.label}` }),
        r.cambios_sin_publicar && r.estado === 'approved' ? h('span', { class: 'pill-cambios', text: '● cambios sin publicar' }) : null,
      ),
      acciones,
    );
  }

  function renderEmprendedores() {
    const lista = filtradas();
    $('listaEmprendedores').replaceChildren(
      ...(lista.length ? lista.map(filaEmprendedor) : [h('div', { class: 'vacio-lista', text: 'No hay emprendimientos con esos filtros.' })]),
    );
    const f = filtros();
    const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== 'feria') as [string, string][]);
    $<HTMLAnchorElement>('btnExportar').href = `/api/comite/export.csv${qs.size ? `?${qs}` : ''}`;
    renderCola();
    renderStats();
    badges();
  }

  // ───────────────────────── Vincular emprendimiento ↔ cuenta ─────────────────────────
  const dlgVincular = $<HTMLDialogElement>('dlgVincular');
  const vCuenta = $<HTMLSelectElement>('vCuenta');
  function vincular(r: FilaComite) {
    $('vincularTexto').textContent = `“${r.nombre || r.slug}” ${r.owner_email ? `hoy es de ${r.owner_email}` : 'no tiene cuenta'}. El dueño lo podrá editar desde su panel.`;
    const activas = D.cuentas.filter((c) => c.estado === 'active');
    vCuenta.replaceChildren(
      ...(activas.length
        ? activas.map((c) => {
            const n = D.filas.filter((f) => f.owner_email === c.email).length;
            return h('option', { value: c.email, text: `${c.nombre} · ${c.email} (${n} emprendimiento${n === 1 ? '' : 's'})`, selected: c.email === r.owner_email });
          })
        : [h('option', { value: '', text: 'No hay cuentas activas' })]),
    );
    $<HTMLButtonElement>('vQuitar').hidden = !r.owner_email;
    dlgVincular.returnValue = '';
    dlgVincular.showModal();
    dlgVincular.addEventListener(
      'close',
      async () => {
        const v = dlgVincular.returnValue;
        if (v !== 'ok' && v !== 'quitar') return;
        const email = v === 'ok' ? vCuenta.value : '';
        if (v === 'ok' && !email) return;
        if (await accion(r.slug, { accion: 'vincular', email }, email ? `Vinculado a ${email} ✓` : 'Vínculo quitado')) renderCuentas();
      },
      { once: true },
    );
  }

  // ───────────────────────── Solicitudes de otro emprendimiento ─────────────────────────
  async function responderSolicitud(s: Solicitud, aprobar: boolean) {
    const respuesta = '';
    if (!aprobar && !(await confirmar(`No se creará “${s.nombre_emprendimiento}” para ${s.email}. Quedará un aviso listo para mandarle.`, 'Sí, no aprobar'))) return;
    try {
      const r = await api<{ solicitud: Solicitud; fila: FilaComite | null; notificacion: Notificacion }>('/api/comite/solicitudes', 'PATCH', {
        id: s.id,
        accion: aprobar ? 'aprobar' : 'rechazar',
        respuesta,
      });
      D.solicitudes = D.solicitudes.map((x) => (x.id === s.id ? r.solicitud : x));
      if (r.fila) D.filas = [r.fila, ...D.filas];
      notificar(aprobar ? `Creado “${s.nombre_emprendimiento}” para ${s.email} ✓` : 'Solicitud no aprobada', r.notificacion);
      renderSolicitudes();
      renderEmprendedores();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function renderSolicitudes() {
    const pendientes = D.solicitudes.filter((s) => s.estado === 'pendiente');
    $('contadorSolicitudes').textContent = String(pendientes.length);
    $('listaSolicitudes').replaceChildren(
      ...(pendientes.length
        ? pendientes.map((s) => {
            const c = D.cuentas.find((x) => x.email === s.email);
            const n = D.filas.filter((f) => f.owner_email === s.email).length;
            return h(
              'article',
              { class: 'noti' },
              h(
                'div',
                {},
                h('h3', { text: `＋ ${s.nombre_emprendimiento}` }),
                s.motivo ? h('p', { text: s.motivo }) : null,
                h('div', { class: 'sub', text: `${c?.nombre ?? s.email} · ${s.email} · ya tiene ${n} · ${fechaCorta(s.creado_at)}` }),
              ),
              h(
                'div',
                { class: 'fila-acciones' },
                h('button', { type: 'button', class: 'btn btn-sm btn-aprobar', text: '✓ Aprobar y crear', on: { click: () => responderSolicitud(s, true) } }),
                h('button', { type: 'button', class: 'btn btn-sm btn-peligro', text: '✕ No aprobar', on: { click: () => responderSolicitud(s, false) } }),
              ),
            );
          })
        : [h('div', { class: 'vacio-lista', text: 'Nadie está pidiendo otro emprendimiento.' })]),
    );
    badges();
  }

  // ───────────────────────── Cuentas ─────────────────────────
  async function revisarCuenta(c: Cuenta, activar: boolean) {
    if (activar && D.admins.includes(c.email) && !(await confirmar(`${c.email} está en ADMIN_EMAILS: al activarla tendrá acceso TOTAL al comité. ¿Es tuya?`, 'Sí, activar'))) return;
    try {
      const r = await api<{ cuenta: Cuenta; notificacion: Notificacion }>('/api/comite/cuentas', 'PATCH', { email: c.email, accion: activar ? 'activar' : 'rechazar' });
      D.cuentas = D.cuentas.map((x) => (x.email === c.email ? r.cuenta : x));
      notificar(activar ? `Cuenta de ${c.nombre} activada ✓` : `Cuenta de ${c.nombre} rechazada`, r.notificacion);
      renderCuentas();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function renderCuentas() {
    const orden: Record<Cuenta['estado'], number> = { pending_activation: 0, active: 1, rejected: 2 };
    const lista = [...D.cuentas].sort((a, b) => orden[a.estado] - orden[b.estado] || b.creado_at.localeCompare(a.creado_at));
    $('listaCuentas').replaceChildren(
      ...(lista.length
        ? lista.map((c) => {
            const t = torreDe(c.torre);
            const emps = D.filas.filter((f) => f.owner_email === c.email);
            const emp = emps.length === 1 ? emps[0] : null;
            return h(
              'article',
              { class: 'fila', style: `--t:${t.color_hex};--t-claro:${t.color_claro}` },
              h('div', { class: 'mini-foto', text: t.emoji_simbolo }),
              h(
                'div',
                {},
                h('h3', { text: c.nombre }),
                h('div', { class: 'sub', text: `${c.email} · +57 ${c.whatsapp}` }),
                h('div', { class: 'sub', text: `Pidió acceso ${fechaCorta(c.creado_at)}${c.revisado_por ? ` · revisó ${c.revisado_por}` : ''}` }),
              ),
              h(
                'div',
                { class: 'meta' },
                h('span', { class: 'pill-t', text: `${t.emoji_simbolo} ${donde(t, c.apartamento)}` }),
                h('span', { class: `pill-estado ${c.estado}`, text: ETIQUETA_CUENTA[c.estado] }),
                D.admins.includes(c.email) ? h('span', { class: 'pill-admin', text: 'ADMIN' }) : null,
                emp ? h('span', { class: `pill-estado ${emp.estado_visible}`, text: `Emprendimiento: ${ETIQUETA[emp.estado_visible]}` }) : null,
                emps.length > 1 ? h('span', { class: 'pill-t', text: `${emps.length} emprendimientos` }) : null,
              ),
              h(
                'div',
                { class: 'fila-acciones' },
                c.estado !== 'active' ? h('button', { type: 'button', class: 'btn btn-sm btn-aprobar', text: '✓ Activar', on: { click: () => revisarCuenta(c, true) } }) : null,
                c.estado !== 'rejected'
                  ? h('button', { type: 'button', class: 'btn btn-sm btn-peligro', text: c.estado === 'active' ? 'Desactivar' : '✕ Rechazar', on: { click: () => revisarCuenta(c, false) } })
                  : null,
                h('a', { class: 'btn btn-ghost btn-sm', href: `https://wa.me/57${c.whatsapp}`, target: '_blank', rel: 'noopener', text: 'WhatsApp' }),
              ),
            );
          })
        : [h('div', { class: 'vacio-lista', text: 'Aún no hay cuentas. Los vecinos se registran en /registro.' })]),
    );
    badges();
  }

  // ───────────────────────── Notificaciones ─────────────────────────
  function renderNotificaciones() {
    $('listaNotificaciones').replaceChildren(
      ...(D.notificaciones.length
        ? D.notificaciones.map((n) => {
            const marcar = async () => {
              try {
                await api('/api/comite/notificaciones', 'PATCH', { id: n.id, enviada: !n.enviada });
                n.enviada = !n.enviada;
                renderNotificaciones();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            };
            const copiar = async () => {
              try {
                await navigator.clipboard.writeText(n.mensaje);
                toast('Mensaje copiado', 'ok');
              } catch {
                toast('No se pudo copiar. Selecciónalo a mano.', 'error');
              }
            };
            const paraVecino = n.para === 'vecino';
            return h(
              'article',
              { class: `noti${n.enviada ? ' enviada' : ''}` },
              h(
                'div',
                {},
                h('h3', { text: `${paraVecino ? '→ Vecino' : '← Para el comité'} · ${n.titulo}` }),
                h('p', { text: n.mensaje }),
                h('div', { class: 'sub', text: `${fechaCorta(n.creado_at)}${n.whatsapp ? ` · +57 ${n.whatsapp}` : ''}${n.email ? ` · ${n.email}` : ''}${n.enviada ? ' · ✓ enviada' : ''}` }),
              ),
              h(
                'div',
                { class: 'fila-acciones' },
                n.whatsapp ? h('a', { class: 'btn btn-sm btn-wsp', href: wsp(n.whatsapp, n.mensaje), target: '_blank', rel: 'noopener', text: 'Abrir WhatsApp', on: { click: () => !n.enviada && marcar() } }) : null,
                n.email ? h('a', { class: 'btn btn-ghost btn-sm', href: `mailto:${n.email}?subject=${encodeURIComponent(`Feria 4 Vientos · ${n.titulo}`)}&body=${encodeURIComponent(n.mensaje)}`, text: 'Correo' }) : null,
                n.slug && !paraVecino
                  ? h('a', {
                      class: 'btn btn-ghost btn-sm',
                      href: n.tipo === 'reporte' ? '#resenas' : '#emprendedores',
                      text: 'Revisar',
                      on: { click: () => irA(n.tipo === 'reporte' ? 'resenas' : 'emprendedores') },
                    })
                  : null,
                h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Copiar', on: { click: copiar } }),
                h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: n.enviada ? 'Marcar pendiente' : 'Marcar enviada', on: { click: marcar } }),
              ),
            );
          })
        : [h('div', { class: 'vacio-lista', text: 'Sin notificaciones todavía.' })]),
    );
    badges();
  }
  [fBuscar, fTorre, fCategoria, fEstado, fFeria].forEach((el) => el.addEventListener('input', renderEmprendedores));

  // ───────────────────────── Reseñas y reportes ─────────────────────────
  const filaDe = (slug: string) => D.filas.find((f) => f.slug === slug);
  const nombreDe = (slug: string) => filaDe(slug)?.nombre || slug;
  const motivoDe = (id: string) => D.motivos.find((m) => m.id === id)?.label ?? id;
  const estrellas = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const ETIQUETA_REPORTE: Record<EstadoReporte, string> = { abierto: 'Abierto', resuelto: 'Resuelto', descartado: 'Descartado' };

  function tarjetaReporte(rep: Reporte) {
    const fila = filaDe(rep.slug);
    const visible = fila?.estado_visible === 'approved';
    const nota = inp(rep.nota, { maxlength: 400, placeholder: 'Nota del comité (qué se hizo)' });
    const cerrar = async (estado: EstadoReporte) => {
      try {
        const r = await api<{ reporte: Reporte }>('/api/comite/resenas', 'PATCH', { tipo: 'reporte', id: rep.id, estado, nota: nota.value });
        D.reportes = D.reportes.map((x) => (x.id === rep.id ? r.reporte : x));
        toast(estado === 'abierto' ? 'Reporte reabierto' : `Reporte ${ETIQUETA_REPORTE[estado].toLowerCase()} ✓`, 'ok');
        renderResenas();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    };
    const abierto = rep.estado === 'abierto';
    return h(
      'article',
      { class: `noti reporte${abierto ? '' : ' cerrado'}` },
      h(
        'div',
        {},
        h('div', { class: 'motivo', text: `⚠️ ${motivoDe(rep.motivo)}` }),
        h('h3', { text: `${nombreDe(rep.slug)}${fila ? ` · ${ETIQUETA[fila.estado_visible]}` : ' · (eliminado)'}` }),
        rep.detalle ? h('p', { text: rep.detalle }) : null,
        rep.evidencias.length
          ? h(
              'div',
              { class: 'evidencias-comite' },
              ...rep.evidencias.map((k, i) => {
                const src = `/api/comite/evidencia/${k}`;
                return h('a', { href: src, target: '_blank', rel: 'noopener', title: `Abrir evidencia ${i + 1}` }, h('img', { src, alt: `Evidencia ${i + 1}`, loading: 'lazy' }));
              }),
            )
          : null,
        h('div', {
          class: 'sub',
          text: `${fechaCorta(rep.creado_at)} · ${rep.evidencias.length} foto(s)${
            abierto ? '' : ` · ${ETIQUETA_REPORTE[rep.estado]} por ${rep.revisado_por ?? ''}${rep.nota ? ` — ${rep.nota}` : ''}`
          }`,
        }),
        abierto ? h('div', { style: 'margin-top:8px' }, nota) : null,
      ),
      h(
        'div',
        { class: 'fila-acciones' },
        fila && visible
          ? h('button', {
              type: 'button',
              class: 'btn btn-peligro btn-sm',
              text: 'Ocultar emprendimiento',
              title: 'Lo saca de la landing sin borrarlo',
              on: {
                click: async () => {
                  if (!(await confirmar(`“${nombreDe(rep.slug)}” dejará de salir en la landing hasta que lo vuelvas a mostrar.`, 'Sí, ocultar'))) return;
                  if (await accion(rep.slug, { accion: 'visible', valor: false }, `${nombreDe(rep.slug)} oculto de la landing`)) renderResenas();
                },
              },
            })
          : null,
        fila ? h('a', { class: 'btn btn-ghost btn-sm', href: `/admin?slug=${encodeURIComponent(rep.slug)}`, text: 'Ver ficha' }) : null,
        abierto
          ? h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: '✓ Resuelto', on: { click: () => cerrar('resuelto') } })
          : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Reabrir', on: { click: () => cerrar('abierto') } }),
        abierto ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Descartar', on: { click: () => cerrar('descartado') } }) : null,
      ),
    );
  }

  const fResBuscar = $<HTMLInputElement>('fResBuscar');
  const fResEstrellas = $<HTMLSelectElement>('fResEstrellas');

  function tarjetaCalificacion(c: Calificacion) {
    const alternar = async () => {
      try {
        await api('/api/comite/resenas', 'PATCH', { tipo: 'calificacion', id: c.id, oculta: !c.oculta });
        c.oculta = !c.oculta;
        toast(c.oculta ? 'Calificación oculta de la landing' : 'Calificación visible ✓', 'ok');
        renderResenas();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    };
    const borrar = async () => {
      if (!(await confirmar('Se borrará esta calificación para siempre (cuenta para el promedio). Ocultarla es reversible.'))) return;
      try {
        await api('/api/comite/resenas', 'DELETE', { id: c.id });
        D.calificaciones = D.calificaciones.filter((x) => x.id !== c.id);
        toast('Calificación borrada', 'ok');
        renderResenas();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    };
    return h(
      'article',
      { class: `noti calif-fila${c.oculta ? ' oculta' : ''}` },
      h(
        'div',
        {},
        h('h3', {}, h('span', { class: 'est', text: estrellas(c.estrellas) }), ` · ${nombreDe(c.slug)}`),
        c.comentario ? h('p', { text: c.comentario }) : null,
        h('div', {
          class: 'sub',
          text: `${c.nombre || 'Sin nombre'}${c.conjunto ? ` · ${c.conjunto}` : ''} · ${fechaCorta(c.creado_at)}${c.oculta ? ' · oculta' : ''}`,
        }),
      ),
      h(
        'div',
        { class: 'fila-acciones' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: c.oculta ? 'Mostrar' : 'Ocultar', on: { click: alternar } }),
        h('button', { type: 'button', class: 'btn btn-peligro btn-sm', text: 'Borrar', on: { click: borrar } }),
      ),
    );
  }

  function renderResenas() {
    const abiertos = D.reportes.filter((r) => r.estado === 'abierto');
    const cerrados = D.reportes.filter((r) => r.estado !== 'abierto');
    $('contadorReportes').textContent = String(abiertos.length);
    $('listaReportes').replaceChildren(
      ...(abiertos.length ? abiertos.map(tarjetaReporte) : [h('div', { class: 'vacio-lista', text: 'Sin reportes abiertos. 🙌' })]),
    );
    $('listaReportesCerrados').replaceChildren(
      ...(cerrados.length ? cerrados.map(tarjetaReporte) : [h('div', { class: 'vacio-lista', text: 'Todavía no hay reportes cerrados.' })]),
    );

    const q = fResBuscar.value.trim().toLowerCase();
    const filtro = fResEstrellas.value;
    const lista = D.calificaciones.filter((c) => {
      if (filtro === 'bajas' && c.estrellas > 2) return false;
      if (filtro === 'altas' && c.estrellas < 4) return false;
      if (filtro === '3' && c.estrellas !== 3) return false;
      if (filtro === 'ocultas' && !c.oculta) return false;
      return !q || `${nombreDe(c.slug)} ${c.nombre} ${c.comentario}`.toLowerCase().includes(q);
    });
    $('listaCalificaciones').replaceChildren(
      ...(lista.length ? lista.map(tarjetaCalificacion) : [h('div', { class: 'vacio-lista', text: 'No hay calificaciones con ese filtro.' })]),
    );
    badges();
  }
  [fResBuscar, fResEstrellas].forEach((el) => el.addEventListener('input', renderResenas));

  // ───────────────────────── Nuevo emprendimiento ─────────────────────────
  const dlgNuevo = $<HTMLDialogElement>('dlgNuevo');
  const formNuevo = $<HTMLFormElement>('formNuevo');
  $('btnNuevoEmp').addEventListener('click', () => {
    formNuevo.reset();
    dlgNuevo.showModal();
  });
  dlgNuevo.querySelector('[data-cerrar]')!.addEventListener('click', () => dlgNuevo.close());
  formNuevo.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = formNuevo.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    boton.disabled = true;
    try {
      const r = await api<{ slug: string }>('/api/comite/emprendedores', 'POST', Object.fromEntries(new FormData(formNuevo)));
      location.href = `/admin?slug=${encodeURIComponent(r.slug)}`;
    } catch (e) {
      toast((e as Error).message, 'error');
      boton.disabled = false;
    }
  });

  // ───────────────────────── Editores genéricos ─────────────────────────
  function campo(label: string, input: HTMLElement, full = false) {
    return h('div', { class: `field${full ? ' full' : ''}` }, h('label', { text: label }), input);
  }
  const inp = (valor: string | number, attrs: Attrs = {}) => h('input', { type: 'text', value: String(valor ?? ''), ...attrs }) as HTMLInputElement;

  function colorInput(valor: string, onCambio: () => void) {
    const texto = inp(valor, { maxlength: 7, pattern: '#[0-9A-Fa-f]{6}' });
    const picker = h('input', { type: 'color', value: valor }) as HTMLInputElement;
    picker.addEventListener('input', () => {
      texto.value = picker.value.toUpperCase();
      onCambio();
    });
    texto.addEventListener('input', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(texto.value)) picker.value = texto.value;
      onCambio();
    });
    return { nodo: h('div', { class: 'color-row' }, picker, texto), texto };
  }

  // ───────────────────────── Torres ─────────────────────────
  function renderTorres() {
    $('listaTorres').replaceChildren(
      ...D.torres.map((t) => {
        const f = {
          nombre: inp(t.nombre, { maxlength: 30 }),
          rumbo: inp(t.rumbo, { maxlength: 40 }),
          caracter: inp(t.caracter, { maxlength: 40 }),
          emoji: inp(t.emoji_simbolo, { maxlength: 8 }),
          tagline: h('textarea', { rows: 2, maxlength: 140, text: t.tagline }) as HTMLTextAreaElement,
          orden: inp(t.orden, { type: 'number', min: 1, max: 9 }),
        };
        const swatch = h('div', { class: 'swatch', text: t.emoji_simbolo });
        const card = h('div', { class: 'card', style: `--t:${t.color_hex};--t-claro:${t.color_claro}` });
        const pintar = () => {
          card.style.setProperty('--t', color.texto.value);
          card.style.setProperty('--t-claro', claro.texto.value);
          swatch.textContent = f.emoji.value;
        };
        const color = colorInput(t.color_hex, pintar);
        const claro = colorInput(t.color_claro, pintar);
        f.emoji.addEventListener('input', pintar);
        const guardar = h('button', {
          type: 'button',
          class: 'btn btn-primary btn-sm',
          text: 'Guardar conjunto',
          on: {
            click: async () => {
              try {
                const nueva = await api<Torre>('/api/comite/contenido', 'PUT', {
                  coleccion: 'torres',
                  item: {
                    id: t.id,
                    nombre: f.nombre.value,
                    rumbo: f.rumbo.value,
                    caracter: f.caracter.value,
                    emoji_simbolo: f.emoji.value,
                    tagline: f.tagline.value,
                    orden: Number(f.orden.value),
                    color_hex: color.texto.value,
                    color_claro: claro.texto.value,
                  },
                });
                D.torres = D.torres.map((x) => (x.id === t.id ? nueva : x)).sort((a, b) => a.orden - b.orden);
                toast(`${nueva.nombre} guardada ✓`, 'ok');
                renderTorres();
                renderEmprendedores();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            },
          },
        });
        card.append(
          h('div', { class: 'editor-head' }, swatch, h('div', {}, h('h2', { text: t.nombre }), h('div', { class: 'sub', text: `id: ${t.id}` }))),
          h(
            'div',
            { class: 'field-grid' },
            campo('Nombre', f.nombre),
            campo('Rumbo', f.rumbo),
            campo('Carácter (eyebrow)', f.caracter),
            campo('Emoji', f.emoji),
            campo('Frase (tagline en itálica)', f.tagline, true),
            campo('Color principal', color.nodo),
            campo('Color claro', claro.nodo),
            campo('Orden en la landing', f.orden),
          ),
          h('div', { class: 'editor-acciones' }, guardar),
        );
        return card;
      }),
    );
  }

  // ───────────────────────── Patrocinadores ─────────────────────────
  const ACENTO: Record<string, string> = { oficial: 'cierzo', comunitario: 'mistral', cultural: 'austro' };

  function editorPatro(p: Patrocinador | null) {
    const base: Patrocinador = p ?? {
      id: '',
      nombre: '',
      tipo: 'comunitario',
      etiqueta: 'Aliado',
      rol_corto: '',
      descripcion: '',
      logo: '',
      emoji: '🤝',
      orden: D.patrocinadores.length + 1,
      destacado: false,
    };
    let logo = base.logo;
    const f = {
      nombre: inp(base.nombre, { maxlength: 80, placeholder: 'Nombre del patrocinador' }),
      etiqueta: inp(base.etiqueta, { maxlength: 40 }),
      rol: inp(base.rol_corto, { maxlength: 80 }),
      emoji: inp(base.emoji, { maxlength: 8 }),
      orden: inp(base.orden, { type: 'number', min: 1, max: 20 }),
      desc: h('textarea', { rows: 3, maxlength: 400, text: base.descripcion }) as HTMLTextAreaElement,
      tipo: h(
        'select',
        {},
        h('option', { value: 'oficial', text: 'Oficial (acento Cierzo)' }),
        h('option', { value: 'comunitario', text: 'Comunitario (acento Mistral)' }),
        h('option', { value: 'cultural', text: 'Cultural (acento Austro)' }),
      ) as HTMLSelectElement,
      destacado: h('input', { type: 'checkbox', checked: base.destacado }) as HTMLInputElement,
    };
    f.tipo.value = base.tipo;
    const prev = h('div', { class: 'logo-prev' });
    const pintarLogo = () => prev.replaceChildren(logo ? h('img', { src: logo, alt: '' }) : f.emoji.value || '🤝');
    pintarLogo();
    f.emoji.addEventListener('input', pintarLogo);

    const archivo = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true }) as HTMLInputElement;
    archivo.addEventListener('change', async () => {
      const file = archivo.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('logo', file);
      try {
        const r = await api<{ url: string }>('/api/comite/logo', 'POST', fd);
        logo = r.url;
        pintarLogo();
        toast('Logo subido. Guarda para aplicarlo.', 'ok');
      } catch (e) {
        toast((e as Error).message, 'error');
      }
      archivo.value = '';
    });

    const card = h('div', { class: 'card', style: `--t:var(--${ACENTO[base.tipo]});--t-claro:var(--${ACENTO[base.tipo]}-claro)` });
    f.tipo.addEventListener('change', () => {
      card.style.setProperty('--t', `var(--${ACENTO[f.tipo.value]})`);
      card.style.setProperty('--t-claro', `var(--${ACENTO[f.tipo.value]}-claro)`);
    });

    card.append(
      h(
        'div',
        { class: 'editor-head' },
        prev,
        h(
          'div',
          { style: 'display:flex;gap:6px;flex-wrap:wrap' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: logo ? 'Cambiar logo' : 'Subir logo', on: { click: () => archivo.click() } }),
          h('button', {
            type: 'button',
            class: 'btn btn-ghost btn-sm',
            text: 'Usar emoji',
            on: {
              click: () => {
                logo = '';
                pintarLogo();
              },
            },
          }),
          archivo,
        ),
      ),
      h(
        'div',
        { class: 'field-grid' },
        campo('Nombre', f.nombre, true),
        campo('Tipo', f.tipo),
        campo('Etiqueta (badge)', f.etiqueta),
        campo('Rol corto', f.rol),
        campo('Emoji (si no hay logo)', f.emoji),
        campo('Descripción', f.desc, true),
        campo('Orden', f.orden),
        h('label', { class: 'check' }, f.destacado, 'Destacado (card grande)'),
      ),
      h(
        'div',
        { class: 'editor-acciones' },
        base.id
          ? h('button', {
              type: 'button',
              class: 'btn btn-peligro btn-sm',
              text: 'Eliminar',
              on: {
                click: async () => {
                  if (!(await confirmar(`Se quitará a “${base.nombre}” de la sección “Con el respaldo de”.`))) return;
                  try {
                    await api('/api/comite/contenido', 'DELETE', { coleccion: 'patrocinadores', id: base.id });
                    D.patrocinadores = D.patrocinadores.filter((x) => x.id !== base.id);
                    toast('Patrocinador eliminado', 'ok');
                    renderPatrocinadores();
                  } catch (e) {
                    toast((e as Error).message, 'error');
                  }
                },
              },
            })
          : null,
        h('button', {
          type: 'button',
          class: 'btn btn-primary btn-sm',
          text: base.id ? 'Guardar' : 'Crear patrocinador',
          on: {
            click: async () => {
              try {
                const nuevo = await api<Patrocinador>('/api/comite/contenido', 'PUT', {
                  coleccion: 'patrocinadores',
                  item: {
                    id: base.id,
                    nombre: f.nombre.value,
                    tipo: f.tipo.value,
                    etiqueta: f.etiqueta.value,
                    rol_corto: f.rol.value,
                    descripcion: f.desc.value,
                    logo,
                    emoji: f.emoji.value,
                    orden: Number(f.orden.value),
                    destacado: f.destacado.checked,
                  },
                });
                D.patrocinadores = [...D.patrocinadores.filter((x) => x.id !== nuevo.id), nuevo].sort((a, b) => a.orden - b.orden);
                toast(`${nuevo.nombre} guardado ✓`, 'ok');
                renderPatrocinadores();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            },
          },
        }),
      ),
    );
    return card;
  }

  function renderPatrocinadores() {
    $('listaPatrocinadores').replaceChildren(...D.patrocinadores.map((p) => editorPatro(p)));
    badges();
  }
  $('btnNuevoPatro').addEventListener('click', () => {
    const lista = $('listaPatrocinadores');
    const nuevo = editorPatro(null);
    lista.prepend(nuevo);
    nuevo.querySelector('input')?.focus();
  });

  // ───────────────────────── Categorías ─────────────────────────
  function editorCategoria(c: Categoria | null) {
    const base: Categoria = c ?? { id: '', label: '', emoji: '🏷️', orden: 500, oculta: false };
    const usos = D.usosCategorias[base.id] ?? 0;
    const esBase = D.categoriasBase.includes(base.id);
    const f = {
      emoji: inp(base.emoji, { maxlength: 16, class: 'emoji-inp', 'aria-label': 'Emoji' }),
      label: inp(base.label, { maxlength: 40, placeholder: 'Ej: Mascotas' }),
      orden: inp(base.orden, { type: 'number', step: 10 }),
      oculta: h('input', { type: 'checkbox', checked: base.oculta, disabled: base.id === CATEGORIA_COMODIN }) as HTMLInputElement,
    };
    const guardar = async () => {
      try {
        const nueva = await api<Categoria>('/api/comite/contenido', 'PUT', {
          coleccion: 'categorias',
          item: { id: base.id, label: f.label.value, emoji: f.emoji.value, orden: Number(f.orden.value), oculta: f.oculta.checked },
        });
        D.categorias = [...D.categorias.filter((x) => x.id !== nueva.id), nueva].sort((a, b) => a.orden - b.orden || a.label.localeCompare(b.label, 'es'));
        toast(`${nueva.emoji} ${nueva.label} guardada ✓`, 'ok');
        renderCategorias();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    };
    const borrar = async () => {
      if (!(await confirmar(`Se borrará la categoría “${base.label}”.`))) return;
      try {
        await api('/api/comite/contenido', 'DELETE', { coleccion: 'categorias', id: base.id });
        D.categorias = D.categorias.filter((x) => x.id !== base.id);
        toast('Categoría borrada', 'ok');
        renderCategorias();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    };
    return h(
      'div',
      { class: `card cat-fila${base.oculta ? ' oculta' : ''}` },
      campo('Emoji', f.emoji),
      campo('Nombre', f.label),
      campo('Orden', f.orden),
      h(
        'div',
        {},
        h('label', { class: 'check', title: base.id === CATEGORIA_COMODIN ? '“Otros” siempre está disponible' : '' }, f.oculta, 'Oculta'),
        base.id ? h('div', { class: 'usos', text: `${usos} emprendimiento${usos === 1 ? '' : 's'}${esBase ? ' · base' : ''}` }) : null,
      ),
      h(
        'div',
        { class: 'editor-acciones', style: 'margin-top:0' },
        base.id && !esBase && !usos ? h('button', { type: 'button', class: 'btn btn-peligro btn-sm', text: 'Borrar', on: { click: borrar } }) : null,
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: base.id ? 'Guardar' : 'Crear', on: { click: guardar } }),
      ),
    );
  }

  function renderCategorias() {
    $('listaCategorias').replaceChildren(...D.categorias.map((c) => editorCategoria(c)));
    badges();
  }
  $('btnNuevaCategoria').addEventListener('click', () => {
    const nueva = editorCategoria(null);
    $('listaCategorias').prepend(nueva);
    nueva.querySelectorAll('input')[1]?.focus();
  });

  // ───────────────────────── Fechas ─────────────────────────
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

  const hasta = (fe: Fecha) => fe.mostrar_hasta || fe.fecha;
  const estaActiva = (fe: Fecha) => estaActivaEn(fe, hoy);

  function pillFecha(fe: Fecha) {
    if (!fe.activa) return h('span', { class: 'pill-inactiva', text: 'Apagada · oculta' });
    if (hoy > hasta(fe)) return h('span', { class: 'pill-inactiva', text: 'Terminó · oculta' });
    if (fe.mostrar_desde && hoy < fe.mostrar_desde) return h('span', { class: 'pill-programada', text: `Programada · sale el ${fe.mostrar_desde}` });
    return h('span', { class: 'pill-activa', text: `🎪 En la landing hasta el ${hasta(fe)}` });
  }

  function editorFecha(fe: Fecha | null) {
    // Crear una feria la deja activa de una vez; se puede apagar antes de guardar.
    const base: Fecha = fe ?? {
      id: '',
      titulo: 'Feria 4 Vientos',
      fecha: hoy,
      hora_inicio: '09:00',
      hora_fin: '13:00',
      descripcion: '',
      activa: true,
      mostrar_desde: hoy,
      mostrar_hasta: hoy,
    };
    const terminada = !!base.id && hoy > hasta(base);
    const f = {
      titulo: inp(base.titulo, { maxlength: 80 }),
      fecha: inp(base.fecha, { type: 'date' }),
      hi: inp(base.hora_inicio, { type: 'time' }),
      hf: inp(base.hora_fin, { type: 'time' }),
      desc: inp(base.descripcion, { maxlength: 300, placeholder: 'Qué habrá: emprendimientos, vacunación, música…' }),
      activa: h('input', { type: 'checkbox', checked: base.activa === true }) as HTMLInputElement,
      desde: inp(base.mostrar_desde ?? '', { type: 'date' }),
      hasta: inp(hasta(base), { type: 'date' }),
    };
    // En una feria nueva, mover el día de la feria arrastra "Mostrar hasta" si quedaba antes.
    f.fecha.addEventListener('change', () => {
      if (!base.id && f.fecha.value && f.hasta.value < f.fecha.value) f.hasta.value = f.fecha.value;
    });
    const card = h('div', { class: `card fecha-card${terminada ? ' pasada' : ''}${base.id && estaActiva(base) ? ' activa' : ''}` });
    card.append(
      h(
        'div',
        { class: 'fecha-estado' },
        h('label', { class: 'check check-feria' }, f.activa, 'Feria activa'),
        base.id ? pillFecha(base) : h('span', { class: 'pill-inactiva', text: 'Nueva · sin guardar' }),
      ),
      h(
        'div',
        { class: 'fecha-ventana' },
        campo('Mostrar en la landing desde', f.desde),
        campo('Mostrar hasta (incluido)', f.hasta),
      ),
    );
    card.append(
      h(
        'div',
        { class: 'fecha-fila' },
        campo('Título', f.titulo),
        campo('Día de la feria', f.fecha),
        campo('Hora inicio', f.hi),
        campo('Hora fin', f.hf),
        h(
          'div',
          { class: 'editor-acciones', style: 'margin-top:0' },
          base.id
            ? h('button', {
                type: 'button',
                class: 'btn btn-peligro btn-sm',
                text: 'Borrar',
                on: {
                  click: async () => {
                    if (!(await confirmar(`Se borrará la feria “${base.titulo}” (${base.fecha}).`))) return;
                    try {
                      await api('/api/comite/contenido', 'DELETE', { coleccion: 'fechas', id: base.id });
                      D.fechas = D.fechas.filter((x) => x.id !== base.id);
                      toast('Fecha borrada', 'ok');
                      renderFechas();
                    } catch (e) {
                      toast((e as Error).message, 'error');
                    }
                  },
                },
              })
            : null,
          h('button', {
            type: 'button',
            class: 'btn btn-primary btn-sm',
            text: base.id ? 'Guardar' : 'Crear feria',
            on: {
              click: async () => {
                try {
                  const nueva = await api<Fecha>('/api/comite/contenido', 'PUT', {
                    coleccion: 'fechas',
                    item: {
                      id: base.id,
                      titulo: f.titulo.value,
                      fecha: f.fecha.value,
                      hora_inicio: f.hi.value,
                      hora_fin: f.hf.value,
                      descripcion: f.desc.value,
                      activa: f.activa.checked,
                      mostrar_desde: f.desde.value,
                      mostrar_hasta: f.hasta.value,
                    },
                  });
                  D.fechas = [...D.fechas.filter((x) => x.id !== nueva.id), nueva].sort((a, b) => a.fecha.localeCompare(b.fecha));
                  const msg = estaActiva(nueva)
                    ? 'Feria activa ✓ Ya se ve en la landing'
                    : !nueva.activa
                      ? 'Guardada ✓ Está apagada: no sale en la landing'
                      : hoy > hasta(nueva)
                        ? 'Guardada, pero su "Mostrar hasta" ya pasó: no se muestra'
                        : `Guardada ✓ Saldrá en la landing el ${nueva.mostrar_desde}`;
                  toast(msg, 'ok');
                  renderFechas();
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              },
            },
          }),
        ),
        campo('Descripción', f.desc, true),
      ),
    );
    return card;
  }

  function renderFechas() {
    const activa = D.fechas.find(estaActiva);
    const estado = $('estadoFeria');
    estado.classList.toggle('on', !!activa);
    estado.textContent = activa
      ? `🎪 En la landing ahora: ${activa.titulo} (${activa.fecha}), hasta el ${hasta(activa)}.`
      : 'Hoy no se muestra ninguna feria: la landing solo tiene el directorio. Crea una feria o ajusta sus fechas "Mostrar desde / hasta".';
    $('listaFechas').replaceChildren(
      ...(D.fechas.length ? D.fechas.map((f) => editorFecha(f)) : [h('div', { class: 'vacio-lista', text: 'No hay ferias. Crea la próxima.' })]),
    );
    badges();
  }
  $('btnNuevaFecha').addEventListener('click', () => {
    const nueva = editorFecha(null);
    $('listaFechas').prepend(nueva);
    nueva.querySelector('input')?.focus();
  });

  // ───────────────────────── Arranque ─────────────────────────
  renderEmprendedores();
  renderCuentas();
  renderSolicitudes();
  renderResenas();
  renderNotificaciones();
  renderCategorias();
  renderTorres();
  renderPatrocinadores();
  renderFechas();
  const inicial = location.hash.slice(1) as Tab;
  irA(TABS.includes(inicial) ? inicial : 'emprendedores');
}
