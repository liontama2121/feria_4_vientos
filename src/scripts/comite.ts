// Lógica de /admin/comite. Todo se pinta desde los datos en memoria y cada acción
// llama a /api/comite/* y actualiza solo lo que cambió.
import type { Fecha, FilaComite, Patrocinador, Torre } from '../lib/db';

interface DatosComite {
  filas: FilaComite[];
  torres: Torre[];
  patrocinadores: Patrocinador[];
  fechas: Fecha[];
  categorias: { id: string; label: string; emoji: string }[];
}

type Tab = 'emprendedores' | 'torres' | 'patrocinadores' | 'fechas';
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

const ETIQUETA: Record<FilaComite['estado_visible'], string> = {
  publicado: 'Publicado',
  pendiente: 'Pendiente',
  borrador: 'Borrador',
  oculto: 'Oculto',
  rechazado: 'Oculto',
};

export function iniciarComite() {
  const nodo = document.getElementById('comite-datos');
  if (!nodo?.textContent) return;
  const D = JSON.parse(nodo.textContent) as DatosComite;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const torreDe = (id: string | null) => D.torres.find((t) => t.id === id) ?? D.torres[0];
  const catDe = (id: string) => D.categorias.find((c) => c.id === id) ?? D.categorias[D.categorias.length - 1];

  function toast(msg: string, tipo: 'ok' | 'error' | 'info' = 'info') {
    const t = h('div', { class: `toast ${tipo}`, text: msg });
    $('toasts').append(t);
    setTimeout(() => t.remove(), tipo === 'error' ? 6000 : 3500);
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

  function confirmar(texto: string): Promise<boolean> {
    const dlg = $<HTMLDialogElement>('dlgConfirmar');
    $('confirmarTexto').textContent = texto;
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
    const pendientes = D.filas.filter((f) => f.estado_visible === 'pendiente').length;
    const set = (tab: string, v: string) => {
      const b = document.querySelector<HTMLElement>(`[data-badge="${tab}"]`);
      if (b) b.textContent = v;
    };
    set('emprendedores', pendientes ? `${pendientes} por aprobar` : String(D.filas.length));
    set('torres', String(D.torres.length));
    set('patrocinadores', String(D.patrocinadores.length));
    set('fechas', String(D.fechas.length));
  }

  // ───────────────────────── Emprendedores ─────────────────────────
  const fBuscar = $<HTMLInputElement>('fBuscar');
  const fTorre = $<HTMLSelectElement>('fTorre');
  const fCategoria = $<HTMLSelectElement>('fCategoria');
  const fEstado = $<HTMLSelectElement>('fEstado');

  fTorre.append(h('option', { value: '', text: 'Todas' }), ...D.torres.map((t) => h('option', { value: t.id, text: `${t.emoji_simbolo} ${t.nombre}` })));
  fCategoria.append(h('option', { value: '', text: 'Todas' }), ...D.categorias.map((c) => h('option', { value: c.id, text: `${c.emoji} ${c.label}` })));

  function filtros() {
    return { q: fBuscar.value.trim().toLowerCase(), torre: fTorre.value, categoria: fCategoria.value, estado: fEstado.value };
  }

  function filtradas() {
    const f = filtros();
    const orden: Record<string, number> = { pendiente: 0, rechazado: 1, borrador: 2, publicado: 3, oculto: 4 };
    return D.filas
      .filter(
        (r) =>
          (!f.torre || r.torre === f.torre) &&
          (!f.categoria || r.categoria === f.categoria) &&
          (!f.estado || r.estado_visible === f.estado) &&
          (!f.q || `${r.nombre} ${r.vecino} ${r.apartamento} ${r.owner_email ?? ''}`.toLowerCase().includes(f.q)),
      )
      .sort((a, b) => orden[a.estado_visible] - orden[b.estado_visible] || a.nombre.localeCompare(b.nombre, 'es'));
  }

  function renderStats() {
    const c = (e: FilaComite['estado_visible']) => D.filas.filter((f) => f.estado_visible === e).length;
    const stat = (n: number, l: string, cls = '') => h('div', { class: `stat ${cls}` }, h('b', { text: n }), h('span', { text: l }));
    $('stats').replaceChildren(
      stat(D.filas.length, 'Emprendimientos'),
      stat(c('publicado'), 'Publicados', 'verde'),
      stat(c('pendiente'), 'Por aprobar', 'naranja'),
      stat(D.filas.filter((f) => f.destacado).length, 'En la vitrina', 'morado'),
    );
  }

  async function accion(slug: string, cuerpo: Record<string, unknown>, ok: string) {
    try {
      const fila = await api<FilaComite>('/api/comite/emprendedores', 'PATCH', { slug, ...cuerpo });
      D.filas = D.filas.map((f) => (f.slug === slug ? fila : f));
      toast(ok, 'ok');
      renderEmprendedores();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function filaEmprendedor(r: FilaComite) {
    const t = torreDe(r.torre);
    const cat = catDe(r.categoria);
    const foto = h('div', { class: 'mini-foto' }, r.foto ? h('img', { src: r.foto, alt: '' }) : r.emoji || cat.emoji);

    const acciones = h('div', { class: 'fila-acciones' });
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
    const visible = r.estado === 'aprobado';
    acciones.append(
      h('button', {
        type: 'button',
        class: `btn ${visible ? 'btn-ghost' : 'btn-primary'} btn-sm`,
        text: visible ? 'Ocultar' : 'Mostrar',
        title: visible ? 'Quitarlo de la landing sin borrarlo' : 'Volver a mostrarlo en la landing',
        on: {
          click: () =>
            visible
              ? accion(r.slug, { accion: 'rechazar', motivo: 'Oculto por el comité' }, `${r.nombre || 'Emprendimiento'} oculto de la landing`)
              : accion(r.slug, { accion: 'aprobar' }, `${r.nombre || 'Emprendimiento'} visible en la landing ✓`),
        },
      }),
    );
    acciones.append(
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
        h('div', { class: 'sub', text: `${r.vecino || 'Vecino sin nombre'} · ${t.nombre} ${r.apartamento}${r.whatsapp ? ` · +57 ${r.whatsapp}` : ''}` }),
      ),
      h(
        'div',
        { class: 'meta' },
        h('span', { class: 'pill-t', text: `${t.emoji_simbolo} ${t.nombre}` }),
        h('span', { class: `pill-estado ${r.estado_visible}`, text: ETIQUETA[r.estado_visible] }),
        h('span', { class: 'sub', text: `${cat.emoji} ${cat.label}` }),
        r.cambios_sin_publicar && r.estado_visible !== 'borrador' ? h('span', { class: 'pill-cambios', text: '● cambios sin publicar' }) : null,
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
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    $<HTMLAnchorElement>('btnExportar').href = `/api/comite/export.csv${qs.size ? `?${qs}` : ''}`;
    renderStats();
    badges();
  }
  [fBuscar, fTorre, fCategoria, fEstado].forEach((el) => el.addEventListener('input', renderEmprendedores));

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
          text: 'Guardar torre',
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

  // ───────────────────────── Fechas ─────────────────────────
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

  function editorFecha(fe: Fecha | null) {
    const base: Fecha = fe ?? { id: '', titulo: 'Feria 4 Vientos', fecha: hoy, hora_inicio: '09:00', hora_fin: '16:00', descripcion: '' };
    const f = {
      titulo: inp(base.titulo, { maxlength: 80 }),
      fecha: inp(base.fecha, { type: 'date' }),
      hi: inp(base.hora_inicio, { type: 'time' }),
      hf: inp(base.hora_fin, { type: 'time' }),
      desc: inp(base.descripcion, { maxlength: 300, placeholder: 'Qué habrá: emprendimientos, vacunación, música…' }),
    };
    const card = h('div', { class: `card fecha-card${base.fecha < hoy && base.id ? ' pasada' : ''}` });
    card.append(
      h(
        'div',
        { class: 'fecha-fila' },
        campo('Título', f.titulo),
        campo('Fecha', f.fecha),
        campo('Desde', f.hi),
        campo('Hasta', f.hf),
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
                    if (!(await confirmar(`Se borrará la fecha “${base.titulo}” (${base.fecha}).`))) return;
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
            text: base.id ? 'Guardar' : 'Crear',
            on: {
              click: async () => {
                try {
                  const nueva = await api<Fecha>('/api/comite/contenido', 'PUT', {
                    coleccion: 'fechas',
                    item: { id: base.id, titulo: f.titulo.value, fecha: f.fecha.value, hora_inicio: f.hi.value, hora_fin: f.hf.value, descripcion: f.desc.value },
                  });
                  D.fechas = [...D.fechas.filter((x) => x.id !== nueva.id), nueva].sort((a, b) => a.fecha.localeCompare(b.fecha));
                  toast('Fecha guardada ✓', 'ok');
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
    $('listaFechas').replaceChildren(
      ...(D.fechas.length ? D.fechas.map((f) => editorFecha(f)) : [h('div', { class: 'vacio-lista', text: 'No hay fechas. Agrega la próxima feria.' })]),
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
  renderTorres();
  renderPatrocinadores();
  renderFechas();
  const inicial = location.hash.slice(1) as Tab;
  irA(['emprendedores', 'torres', 'patrocinadores', 'fechas'].includes(inicial) ? inicial : 'emprendedores');
}
