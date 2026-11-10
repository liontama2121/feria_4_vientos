// Lógica de /coordinacion. Todo se pinta desde los datos en memoria; cada acción llama a
// /api/coordinacion/* (que valida el rol) y actualiza solo lo que cambió.
import type { Cuenta, Fecha, Notificacion, Torre } from '../lib/db';
import { categoria, type Categoria, type TorreId } from '../lib/constantes';
import { aceptaInscripciones, cierreInscripciones, fechaLarga, inscripcionesPorAbrir, rangoHoras } from '../lib/fechas';
import {
  ESTADOS_INSCRIPCION,
  ETIQUETA_FERIA,
  ETIQUETA_INSCRIPCION,
  UBICADOS,
  celularCO,
  linkWa,
  mensajeSeleccion,
  pesos,
  type EstadoFeria,
  type FilaInscripcion,
} from '../lib/ferias';

interface Datos {
  rol: 'admin' | 'coordinadora';
  ferias: (Fecha & { estado: EstadoFeria })[];
  inscripciones: FilaInscripcion[];
  torres: Torre[];
  categorias: Categoria[];
  cuentas: Cuenta[];
  admins: string[];
}
interface CambioExcel {
  id: string;
  fila: number;
  nombre: string;
  emprendedor: string;
  de: TorreId | null;
  a: TorreId;
}

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

const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const primerNombre = (s: string) => s.trim().split(/\s+/)[0] || s;

export function iniciarCoordinacion() {
  const nodo = document.getElementById('coord-datos');
  if (!nodo?.textContent) return;
  const D = JSON.parse(nodo.textContent) as Datos;
  const esAdmin = D.rol === 'admin';
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const torre = (id: string | null) => D.torres.find((t) => t.id === id);
  const nombreTorre = (id: string | null) => torre(id)?.nombre ?? '';

  let feriaId = '';
  const sel = new Set<string>();
  const feria = () => D.ferias.find((f) => f.id === feriaId);
  const deFeria = () => D.inscripciones.filter((i) => i.feria_id === feriaId);
  const conjuntosFeria = () => {
    const f = feria();
    return D.torres.filter((t) => !f?.conjuntos?.length || f.conjuntos.includes(t.id));
  };

  function toast(msg: string, tipo: 'ok' | 'error' | 'info' = 'info') {
    const t = h('div', { class: `toast ${tipo}`, text: msg });
    $('toasts').append(t);
    setTimeout(() => t.remove(), tipo === 'error' ? 7000 : 3800);
  }

  async function api<T = unknown>(url: string, metodo: string, cuerpo?: unknown): Promise<T> {
    const res = await fetch(url, {
      method: metodo,
      headers: cuerpo instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo instanceof FormData ? cuerpo : cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Su sesión expiró. Vuelva a entrar.');
    if (!res.ok) throw new Error((j as { error?: string }).error || 'Algo salió mal. Intente de nuevo.');
    return j as T;
  }

  function confirmar(texto: string, boton = 'Sí, continuar'): Promise<boolean> {
    const dlg = $<HTMLDialogElement>('dlgConfirmar');
    $('confirmarTexto').textContent = texto;
    dlg.querySelector('button[value="ok"]')!.textContent = boton;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((r) => dlg.addEventListener('close', () => r(dlg.returnValue === 'ok'), { once: true }));
  }

  function reemplazar(fila: FilaInscripcion | null | undefined) {
    if (fila) D.inscripciones = D.inscripciones.map((i) => (i.id === fila.id ? fila : i));
  }

  // ───────────────────────── Tabs ─────────────────────────
  function irA(tab: string) {
    document.querySelectorAll<HTMLElement>('[data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    document.querySelectorAll<HTMLElement>('[data-tab-panel]').forEach((p) => (p.hidden = p.dataset.tabPanel !== tab));
    history.replaceState(null, '', `${location.pathname}${location.search}#${tab}`);
  }
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((a) =>
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      irA(a.dataset.tab!);
    }),
  );
  function badges() {
    const set = (tab: string, v: string) => {
      const b = document.querySelector<HTMLElement>(`[data-badge="${tab}"]`);
      if (b) b.textContent = v;
    };
    const pend = deFeria().filter((i) => i.estado === 'pendiente').length;
    set('inscripciones', String(pend || deFeria().length));
    const cuentas = D.cuentas.filter((c) => c.estado === 'pending_activation').length;
    set('cuentas', cuentas ? String(cuentas) : '');
  }

  // ───────────────────────── Feria ─────────────────────────
  const selFeria = $<HTMLSelectElement>('cFeria');
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  selFeria.append(...D.ferias.map((f) => h('option', { value: f.id, text: `${f.titulo} · ${fechaLarga(f.fecha)} (${ETIQUETA_FERIA[f.estado]})` })));
  const pedida = new URLSearchParams(location.search).get('feria');
  const proxima = D.ferias.filter((f) => f.fecha >= hoy && f.estado !== 'finalizada').sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  feriaId = D.ferias.find((f) => f.id === pedida)?.id ?? proxima?.id ?? D.ferias.at(-1)?.id ?? '';
  selFeria.value = feriaId;
  selFeria.addEventListener('change', () => {
    feriaId = selFeria.value;
    sel.clear();
    const q = new URLSearchParams(location.search);
    q.set('feria', feriaId);
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
    pintarFeria();
  });
  $('sinFerias').hidden = D.ferias.length > 0;
  $('conFeria').hidden = D.ferias.length === 0;

  function renderResumen() {
    const f = feria();
    if (!f) return;
    const ins = deFeria();
    const ubicados = ins.filter((i) => UBICADOS.includes(i.estado) && i.conjunto_asignado).length;
    const porAvisar = ins.filter(avisable).filter((i) => !i.notificado_at || i.notificado_conjunto !== i.conjunto_asignado).length;
    // Estado real de las inscripciones: abiertas (con fecha límite), por abrir, cerradas a mano o vencidas.
    const cierre = cierreInscripciones(f);
    const textoIns = aceptaInscripciones(f, hoy)
      ? `Inscripciones abiertas hasta el ${fechaLarga(cierre).toLowerCase()}`
      : inscripcionesPorAbrir(f, hoy)
        ? `Inscripciones abren el ${fechaLarga(f.inscripciones_desde!).toLowerCase()}`
        : f.estado === 'inscripciones'
          ? 'Inscripciones cerradas: se cumplió la fecha límite'
          : ETIQUETA_FERIA[f.estado];
    const puedeCerrar = f.estado === 'inscripciones';
    const puedeAbrir = f.estado === 'cerrada' && hoy <= cierre;
    const btnEstado =
      puedeCerrar || puedeAbrir
        ? h('button', {
            type: 'button',
            class: `btn btn-sm ${puedeCerrar ? 'btn-rechazar' : 'btn-aprobar'}`,
            text: puedeCerrar ? 'Cerrar inscripciones' : 'Reabrir inscripciones',
            on: { click: () => cambiarInscripciones(f, puedeCerrar ? 'cerrar' : 'abrir') },
          })
        : null;
    $('resumenFeria').replaceChildren(
      h('b', { text: f.titulo }),
      h('span', { text: `${fechaLarga(f.fecha)} · ${rangoHoras(f)}` }),
      h('span', { class: `estado-ins${aceptaInscripciones(f, hoy) ? ' abiertas' : ''}`, text: textoIns }),
      h('span', { text: `Valor: ${pesos(f.valor ?? 0)}` }),
      h('span', { text: `${ins.length} inscritos · ${ubicados} aprobados y ubicados · ${porAvisar} por avisar` }),
      ...(btnEstado ? [btnEstado] : []),
    );
    ($('btnExcel') as HTMLAnchorElement).href = `/api/coordinacion/excel?feria=${encodeURIComponent(f.id)}`;
  }

  async function cambiarInscripciones(f: Datos['ferias'][number], accion: 'cerrar' | 'abrir') {
    const ok = await confirmar(
      accion === 'cerrar'
        ? `Nadie más podrá inscribirse a "${f.titulo}". En la página solo quedará el título de la feria. Puede reabrirlas mientras no pase la fecha límite.`
        : `"${f.titulo}" vuelve a recibir inscripciones y el botón "Inscribe tu emprendimiento" vuelve a la página.`,
      accion === 'cerrar' ? 'Sí, cerrar' : 'Sí, reabrir',
    );
    if (!ok) return;
    try {
      const r = await api<{ feria: Fecha }>('/api/coordinacion/feria', 'PATCH', { feria: f.id, accion });
      D.ferias = D.ferias.map((x) => (x.id === f.id ? { ...r.feria, estado: r.feria.estado ?? x.estado } as Datos['ferias'][number] : x));
      toast(accion === 'cerrar' ? 'Inscripciones cerradas ✓' : 'Inscripciones abiertas de nuevo ✓', 'ok');
      pintarFeria();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function ocupados() {
    const o: Partial<Record<TorreId, number>> = {};
    for (const i of deFeria()) if (i.conjunto_asignado && i.estado !== 'rechazada') o[i.conjunto_asignado] = (o[i.conjunto_asignado] ?? 0) + 1;
    return o;
  }

  function renderCupos() {
    const f = feria();
    const o = ocupados();
    $('cupos').replaceChildren(
      ...D.torres.map((t) => {
        const participa = !f?.conjuntos?.length || f.conjuntos.includes(t.id);
        const cupo = f?.cupos?.[t.id] ?? 0;
        const n = o[t.id] ?? 0;
        const lleno = cupo > 0 && n >= cupo;
        return h(
          'div',
          { class: `cupo${lleno ? ' lleno' : ''}${participa ? '' : ' no-participa'}`, 'data-conjunto': t.id },
          h('span', { class: 'nombre', text: t.nombre }),
          participa
            ? h('span', { class: 'num' }, String(n), h('small', { text: cupo ? ` de ${cupo}` : ' ubicados' }))
            : h('span', { class: 'num' }, h('small', { text: 'No participa' })),
          participa ? h('span', { class: 'libres', text: cupo ? (lleno ? 'Sin cupos' : `Quedan ${cupo - n}`) : 'Sin límite de cupos' }) : null,
        );
      }),
    );
  }

  // ───────────────────────── Filtros ─────────────────────────
  const fBuscar = $<HTMLInputElement>('cBuscar');
  const fEstado = $<HTMLSelectElement>('cEstado');
  const fConjunto = $<HTMLSelectElement>('cConjunto');
  fEstado.append(
    h('option', { value: '', text: 'Todos' }),
    h('option', { value: 'por_avisar', text: 'Por avisar' }),
    ...ESTADOS_INSCRIPCION.map((e) => h('option', { value: e, text: ETIQUETA_INSCRIPCION[e] })),
  );
  fConjunto.append(h('option', { value: '', text: 'Todos' }), h('option', { value: '-', text: 'Sin ubicar' }), ...D.torres.map((t) => h('option', { value: t.id, text: t.nombre })));
  [fBuscar, fEstado, fConjunto].forEach((el) => el.addEventListener('input', renderTabla));

  const avisable = (i: FilaInscripcion) => UBICADOS.includes(i.estado) && !!i.conjunto_asignado;
  const orden: Record<string, number> = { pendiente: 0, aprobado: 1, pago_aprobado: 2, participando: 3, rechazada: 4 };
  function visibles() {
    const q = fBuscar.value.trim().toLowerCase();
    const lista = deFeria()
      .filter(
        (i) =>
          (!fEstado.value || (fEstado.value === 'por_avisar' ? avisable(i) && (!i.notificado_at || i.notificado_conjunto !== i.conjunto_asignado) : i.estado === fEstado.value)) &&
          (!fConjunto.value || (fConjunto.value === '-' ? !i.conjunto_asignado : i.conjunto_asignado === fConjunto.value)) &&
          (!q || `${i.nombre} ${i.emprendedor} ${i.que_vende} ${i.descripcion}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre, 'es'));
    // Solicitudes en bloque: sus emprendimientos quedan seguidos, en el lugar del primero.
    const juntos: FilaInscripcion[] = [];
    for (const i of lista) {
      if (juntos.includes(i)) continue;
      juntos.push(...(i.grupo ? lista.filter((x) => x.grupo === i.grupo) : [i]));
    }
    return juntos;
  }
  /** Deja uno por solicitud en bloque (el servidor aplica la acción a todo el bloque). */
  const unoPorBloque = (l: FilaInscripcion[]) => l.filter((i, k) => !i.grupo || l.findIndex((x) => x.grupo === i.grupo) === k);
  /** Los emprendimientos de la misma solicitud en bloque (o solo este). */
  const bloque = (i: FilaInscripcion) => (i.grupo ? deFeria().filter((x) => x.grupo === i.grupo) : [i]);

  // ───────────────────────── Acciones ─────────────────────────
  async function accion(i: FilaInscripcion, cuerpo: Record<string, unknown>, ok: string, boton?: HTMLElement) {
    boton?.setAttribute('aria-busy', 'true');
    try {
      const r = await api<{ fila: FilaInscripcion; filas?: FilaInscripcion[]; notificacion: Notificacion | null }>('/api/coordinacion/inscripciones', 'PATCH', { id: i.id, ...cuerpo });
      (r.filas ?? [r.fila]).forEach(reemplazar);
      toast(ok, 'ok');
      pintarFeria();
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      boton?.removeAttribute('aria-busy');
      return false;
    }
  }

  async function ubicar(cambios: { id: string; conjunto: string }[]) {
    try {
      const r = await api<{ filas: FilaInscripcion[]; aplicados: number; errores: string[] }>('/api/coordinacion/inscripciones', 'PATCH', { accion: 'ubicar', feria: feriaId, cambios });
      D.inscripciones = [...D.inscripciones.filter((i) => i.feria_id !== feriaId), ...r.filas];
      if (r.aplicados) toast(r.aplicados === 1 ? 'Ubicación guardada ✓' : `${r.aplicados} ubicaciones guardadas ✓`, 'ok');
      r.errores.forEach((e) => toast(e, 'error'));
      pintarFeria();
      return r;
    } catch (e) {
      toast((e as Error).message, 'error');
      pintarFeria();
      return null;
    }
  }

  const dlgRechazo = $<HTMLDialogElement>('dlgRechazo');
  function rechazar(i: FilaInscripcion) {
    $('rechazoTexto').textContent = `"${i.nombre}" de ${i.emprendedor || 'un vecino'} no participará en esta feria. Queda un aviso listo en la bandeja del comité.`;
    ($('rechazoNota') as HTMLTextAreaElement).value = '';
    dlgRechazo.returnValue = '';
    dlgRechazo.showModal();
    dlgRechazo.addEventListener(
      'close',
      () => {
        if (dlgRechazo.returnValue === 'ok') accion(i, { accion: 'rechazar', nota: ($('rechazoNota') as HTMLTextAreaElement).value }, `${i.nombre}: rechazado`);
      },
      { once: true },
    );
  }

  /** Un solo mensaje por solicitud: si va en bloque, nombra todos sus emprendimientos ubicados. */
  function mensaje(i: FilaInscripcion) {
    const nombres = bloque(i)
      .filter(avisable)
      .map((x) => x.nombre);
    return mensajeSeleccion({ nombre: primerNombre(i.emprendedor || 'vecino'), emprendimiento: nombres.length ? nombres : [i.nombre], fecha: feria()!.fecha, conjunto: nombreTorre(i.conjunto_asignado) });
  }

  /** Registra el aviso (el WhatsApp ya se abrió con el clic del enlace). En bloque, marca a todos. */
  async function registrarAviso(i: FilaInscripcion) {
    try {
      const r = await api<{ fila: FilaInscripcion; filas?: FilaInscripcion[] }>('/api/coordinacion/inscripciones', 'PATCH', { id: i.id, accion: 'avisado' });
      (r.filas ?? [r.fila]).forEach(reemplazar);
      pintarFeria();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function selectorConjunto(i: FilaInscripcion) {
    const o = ocupados();
    const f = feria();
    const s = h('select', {
      class: 'sel-conjunto',
      'aria-label': `Conjunto donde vende ${i.nombre}`,
      disabled: i.estado === 'rechazada',
    }) as HTMLSelectElement;
    if (i.conjunto_asignado) s.setAttribute('data-conjunto', i.conjunto_asignado);
    s.append(h('option', { value: '', text: 'Sin ubicar', disabled: i.estado !== 'pendiente' && !!i.conjunto_asignado }));
    for (const t of conjuntosFeria()) {
      const cupo = f?.cupos?.[t.id] ?? 0;
      const lleno = cupo > 0 && (o[t.id] ?? 0) >= cupo && i.conjunto_asignado !== t.id;
      s.append(h('option', { value: t.id, text: lleno ? `${t.nombre} (lleno)` : t.nombre, disabled: lleno }));
    }
    s.value = i.conjunto_asignado ?? '';
    s.addEventListener('change', () => ubicar([{ id: i.id, conjunto: s.value }]));
    return s;
  }

  function botonAviso(i: FilaInscripcion) {
    if (!avisable(i)) return null;
    // En bloque, el aviso (uno solo) va en el primer emprendimiento de la solicitud.
    const primero = bloque(i).find(avisable);
    if (primero && primero.id !== i.id) return h('span', { class: 'avisado', text: 'Va en el mismo aviso' });
    const link = linkWa(i.whatsapp, mensaje(i));
    if (!link) return h('span', { class: 'sin-wsp', text: 'WhatsApp inválido' });
    const repetido = !!i.notificado_at && i.notificado_conjunto === i.conjunto_asignado;
    return h('a', {
      class: `btn btn-sm ${repetido ? 'btn-ghost' : 'btn-wsp'}`,
      href: link,
      target: '_blank',
      rel: 'noopener',
      text: repetido ? 'Avisar otra vez' : 'Avisar',
      on: { click: () => registrarAviso(i) },
    });
  }

  function fila(i: FilaInscripcion) {
    const t = torre(i.conjunto_origen);
    const cat = categoria(i.categoria, D.categorias);
    const chk = h('input', { type: 'checkbox', checked: sel.has(i.id), 'aria-label': `Seleccionar ${i.nombre}` }) as HTMLInputElement;
    chk.addEventListener('change', () => {
      // Una solicitud en bloque se selecciona entera.
      bloque(i).forEach((x) => (chk.checked ? sel.add(x.id) : sel.delete(x.id)));
      if (i.grupo) return renderTabla();
      tr.classList.toggle('sel', chk.checked);
      renderMasivo();
    });
    const btn = (texto: string, clase: string, fn: (b: HTMLElement) => void, titulo?: string, deshabilitado = false) => {
      const b = h('button', { type: 'button', class: `btn btn-sm ${clase}`, text: texto, title: titulo, disabled: deshabilitado });
      b.addEventListener('click', () => fn(b));
      return b;
    };
    const acciones: (HTMLElement | null)[] = [];
    if (i.estado === 'pendiente') {
      acciones.push(
        btn('Aprobar', 'btn-aprobar', (b) => accion(i, { accion: 'aprobar' }, `${i.nombre}: aprobado y ubicado en ${nombreTorre(i.conjunto_asignado)} ✓`, b), i.conjunto_asignado ? undefined : 'Primero ubíquelo en un conjunto', !i.conjunto_asignado),
        btn('Rechazar', 'btn-rechazar', () => rechazar(i)),
      );
    }
    if (i.estado === 'aprobado') {
      acciones.push(botonAviso(i));
      if (esAdmin) acciones.push(btn('Pago aprobado', 'btn-primary', (b) => accion(i, { accion: 'aprobar_pago' }, `${i.nombre}: pago aprobado ✓`, b)));
      acciones.push(btn('Rechazar', 'btn-rechazar', () => rechazar(i)));
    }
    if (i.estado === 'pago_aprobado') {
      acciones.push(botonAviso(i));
      if (esAdmin) acciones.push(btn('Participa', 'btn-primary', (b) => accion(i, { accion: 'participando' }, `${i.nombre}: participa ✓`, b)));
      if (esAdmin) acciones.push(btn('Rechazar', 'btn-rechazar', () => rechazar(i)));
    }
    if (i.estado === 'participando') acciones.push(botonAviso(i));
    if (i.estado === 'rechazada' && esAdmin) acciones.push(btn('Volver a revisar', 'btn-ghost', (b) => accion(i, { accion: 'reabrir' }, `${i.nombre}: de nuevo en espera`, b)));

    const avisoTxt = i.notificado_at
      ? h('span', {
          class: `avisado${i.notificado_conjunto !== i.conjunto_asignado ? ' cambio' : ''}`,
          text:
            i.notificado_conjunto !== i.conjunto_asignado
              ? `Avisado a ${nombreTorre(i.notificado_conjunto)}; ahora va a ${nombreTorre(i.conjunto_asignado) || 'ningún conjunto'}`
              : `✓ Avisado ${fechaCorta(i.notificado_at)}`,
        })
      : null;

    const tr = h(
      'tr',
      { class: `${sel.has(i.id) ? 'sel ' : ''}${i.estado}${i.grupo ? ' en-bloque' : ''}` },
      h('td', { class: 'col-check' }, chk),
      h(
        'td',
        {},
        h(
          'div',
          { class: 'emp', 'data-conjunto': i.conjunto_origen ?? undefined },
          h('div', { class: 'mini' }, i.foto ? h('img', { src: i.foto, alt: '', loading: 'lazy' }) : (i.nombre[0] ?? '?').toUpperCase()),
          h(
            'div',
            {},
            h('h3', { text: i.nombre }),
            h('div', { class: 'sub', text: `${i.emprendedor || 'Sin nombre'} · ${cat.label}${celularCO(i.whatsapp) ? ` · +57 ${i.whatsapp}` : ''}` }),
            t ? h('span', { class: 'origen', text: `Vive en ${t.nombre}`, style: `--c:${t.color_hex}` }) : null,
            i.cuenta_estado === 'pending_activation' ? h('div', { class: 'sub', text: 'Cuenta por activar' }) : null,
          ),
        ),
      ),
      h('td', { 'data-label': 'Qué vende' }, h('div', { class: 'vende' }, i.que_vende || i.descripcion || 'Sin detalle', i.necesidades ? h('span', { class: 'nec', text: `Necesita: ${i.necesidades}` }) : null)),
      h('td', { 'data-label': 'Estado' }, h('span', { class: `pill-ins ${i.estado}`, text: ETIQUETA_INSCRIPCION[i.estado] }), avisoTxt, i.estado === 'rechazada' && i.nota ? h('span', { class: 'avisado', text: `Motivo: ${i.nota}` }) : null),
      h('td', { 'data-label': 'Conjunto asignado' }, selectorConjunto(i)),
      h('td', {}, h('div', { class: 'acc' }, ...acciones)),
    );
    return tr;
  }

  function renderTabla() {
    const lista = visibles();
    // Encabezado antes de cada solicitud en bloque: deja claro que se deciden juntos.
    const filas: HTMLElement[] = [];
    lista.forEach((i, k) => {
      if (i.grupo && lista[k - 1]?.grupo !== i.grupo) {
        const n = bloque(i).length;
        filas.push(
          h(
            'tr',
            { class: 'grupo-cab' },
            h('td', { colspan: 6 }, h('b', { text: 'Solicitud en bloque' }), ` · ${i.emprendedor || 'Vecino'} · ${n} emprendimientos: se ubican, aprueban y avisan juntos`),
          ),
        );
      }
      filas.push(fila(i));
    });
    $('cuerpoIns').replaceChildren(...filas);
    const vacio = $('vacioIns');
    vacio.hidden = lista.length > 0;
    $('tablaIns').hidden = lista.length === 0;
    vacio.textContent = deFeria().length
      ? 'Ninguna inscripción coincide con los filtros.'
      : 'Todavía nadie se ha inscrito a esta feria. Cuando un vecino se inscriba, aparecerá aquí.';
    const todos = $<HTMLInputElement>('checkTodos');
    todos.checked = lista.length > 0 && lista.every((i) => sel.has(i.id));
    todos.indeterminate = !todos.checked && lista.some((i) => sel.has(i.id));
    renderMasivo();
  }
  $<HTMLInputElement>('checkTodos').addEventListener('change', (ev) => {
    const marcar = (ev.target as HTMLInputElement).checked;
    visibles().forEach((i) => (marcar ? sel.add(i.id) : sel.delete(i.id)));
    renderTabla();
  });

  // ───────────────────────── Selección múltiple ─────────────────────────
  const masivoConjunto = $<HTMLSelectElement>('masivoConjunto');
  function seleccionadas() {
    return deFeria().filter((i) => sel.has(i.id));
  }
  function renderMasivo() {
    const s = seleccionadas();
    $('masivo').hidden = s.length === 0;
    $('masivoTexto').textContent = s.length === 1 ? '1 seleccionado' : `${s.length} seleccionados`;
    const actual = masivoConjunto.value;
    masivoConjunto.replaceChildren(h('option', { value: '', text: 'Elegir conjunto…' }), ...conjuntosFeria().map((t) => h('option', { value: t.id, text: t.nombre })));
    masivoConjunto.value = actual;
    const avisables = s.filter(avisable).length;
    $('masivoAvisar').textContent = `Avisar por WhatsApp (${avisables})`;
    ($('masivoAvisar') as HTMLButtonElement).disabled = !avisables;
    const aprobables = s.filter((i) => i.estado === 'pendiente' && i.conjunto_asignado).length;
    $('masivoAprobar').textContent = `Aprobar (${aprobables})`;
    ($('masivoAprobar') as HTMLButtonElement).disabled = !aprobables;
  }
  $('masivoLimpiar').addEventListener('click', () => {
    sel.clear();
    renderTabla();
  });
  $('masivoUbicar').addEventListener('click', async () => {
    const c = masivoConjunto.value;
    if (!c) return toast('Elija el conjunto para los seleccionados.', 'error');
    const s = seleccionadas().filter((i) => i.estado !== 'rechazada' && i.conjunto_asignado !== c);
    if (!s.length) return toast(`Los seleccionados ya están en ${nombreTorre(c)}.`, 'info');
    await ubicar(s.map((i) => ({ id: i.id, conjunto: c })));
  });
  $('masivoAprobar').addEventListener('click', async () => {
    const s = unoPorBloque(seleccionadas().filter((i) => i.estado === 'pendiente' && i.conjunto_asignado));
    if (!(await confirmar(`Se aprobarán ${s.length} inscripción(es) en el conjunto que tienen asignado. Las que no están ubicadas se quedan en espera.`, 'Sí, aprobar'))) return;
    let ok = 0;
    for (const i of s) {
      try {
        const r = await api<{ fila: FilaInscripcion; filas?: FilaInscripcion[] }>('/api/coordinacion/inscripciones', 'PATCH', { id: i.id, accion: 'aprobar' });
        (r.filas ?? [r.fila]).forEach(reemplazar);
        ok++;
      } catch (e) {
        toast(`${i.nombre}: ${(e as Error).message}`, 'error');
      }
    }
    if (ok) toast(`${ok} aprobada(s) ✓`, 'ok');
    pintarFeria();
  });

  // ───────────────────────── Cola de avisos por WhatsApp ─────────────────────────
  let cola: FilaInscripcion[] = [];
  let paso = 0;
  $('masivoAvisar').addEventListener('click', async () => {
    let s = seleccionadas().filter(avisable);
    const invalidos = s.filter((i) => !celularCO(i.whatsapp));
    s = s.filter((i) => celularCO(i.whatsapp));
    if (invalidos.length) toast(`${invalidos.length} sin WhatsApp válido: no se incluyen.`, 'error');
    const repetidos = s.filter((i) => i.notificado_at && i.notificado_conjunto === i.conjunto_asignado);
    if (repetidos.length && !(await confirmar(`${repetidos.length} ya fueron avisados con este mismo conjunto. ¿Avisarles otra vez? (Cancelar = solo a los que faltan)`, 'Sí, a todos'))) {
      s = s.filter((i) => !repetidos.includes(i));
    }
    if (!s.length) return toast('No queda nadie por avisar en la selección.', 'info');
    cola = unoPorBloque(s);
    paso = 0;
    pintarCola();
  });
  function pintarCola() {
    const caja = $('colaWsp');
    const i = cola[paso];
    caja.hidden = !i;
    if (!i) {
      if (cola.length) toast('Avisos terminados ✓', 'ok');
      cola = [];
      return;
    }
    $('colaPaso').textContent = `Aviso ${paso + 1} de ${cola.length}`;
    $('colaNombre').textContent = `${i.emprendedor || 'Vecino'} · ${i.nombre}`;
    $('colaDetalle').textContent = `Vende en ${nombreTorre(i.conjunto_asignado)} · +57 ${i.whatsapp}`;
    ($('colaAbrir') as HTMLAnchorElement).href = linkWa(i.whatsapp, mensaje(i));
    $('colaAbrir').focus();
  }
  $('colaAbrir').addEventListener('click', () => {
    const i = cola[paso];
    if (!i) return;
    registrarAviso(i);
    paso++;
    // Se espera un instante para que el navegador abra la pestaña antes de cambiar el enlace.
    setTimeout(pintarCola, 300);
  });
  $('colaSaltar').addEventListener('click', () => {
    paso++;
    pintarCola();
  });
  $('colaCerrar').addEventListener('click', () => {
    cola = [];
    $('colaWsp').hidden = true;
  });

  // ───────────────────────── Excel ─────────────────────────
  const dlgExcel = $<HTMLDialogElement>('dlgExcel');
  const archivo = $<HTMLInputElement>('archivoExcel');
  const previa = $('previa');
  const aplicar = $<HTMLButtonElement>('excelAplicar');
  let pendientesExcel: CambioExcel[] = [];
  $('btnSubir').addEventListener('click', () => {
    archivo.value = '';
    previa.replaceChildren();
    aplicar.disabled = true;
    pendientesExcel = [];
    dlgExcel.showModal();
  });
  dlgExcel.querySelector('[data-cerrar]')!.addEventListener('click', () => dlgExcel.close());
  archivo.addEventListener('change', () => revisarExcel());
  $('excelRevisar').addEventListener('click', () => revisarExcel());
  async function revisarExcel() {
    const f = archivo.files?.[0];
    aplicar.disabled = true;
    if (!f) {
      previa.replaceChildren(h('p', { class: 'previa-errores', text: 'Elija el archivo .xlsx.' }));
      return;
    }
    previa.replaceChildren(h('div', { class: 'cargando', text: 'Leyendo el Excel…' }));
    const fd = new FormData();
    fd.set('feria', feriaId);
    fd.set('archivo', f);
    try {
      const r = await api<{ cambios: CambioExcel[]; errores: { fila: number; mensaje: string }[]; sinCambios: number; leidas: number }>('/api/coordinacion/excel', 'POST', fd);
      pendientesExcel = r.cambios;
      previa.replaceChildren(
        ...[
        h('p', { class: 'previa-resumen', text: `${r.leidas} filas leídas · ${r.cambios.length} cambios · ${r.sinCambios} sin cambios · ${r.errores.length} con error` }),
        r.cambios.length
          ? h(
              'div',
              { class: 'previa-scroll' },
              h(
                'table',
                { class: 'previa-tabla' },
                h('thead', {}, h('tr', {}, h('th', { text: 'Fila' }), h('th', { text: 'Emprendimiento' }), h('th', { text: 'Cambio' }))),
                h(
                  'tbody',
                  {},
                  ...r.cambios.map((c) =>
                    h('tr', {}, h('td', { text: c.fila }), h('td', { text: `${c.nombre} · ${c.emprendedor}` }), h('td', {}, nombreTorre(c.de) || 'Sin ubicar', h('span', { class: 'flecha', text: ' → ' }), h('b', { text: nombreTorre(c.a) }))),
                  ),
                ),
              ),
            )
          : h('p', { text: 'El Excel no trae cambios de ubicación.' }),
        r.errores.length ? h('ul', { class: 'previa-errores' }, ...r.errores.map((e) => h('li', { text: `Fila ${e.fila}: ${e.mensaje}` }))) : null,
        ].filter((x) => x !== null) as HTMLElement[],
      );
      aplicar.disabled = r.cambios.length === 0;
      aplicar.textContent = r.cambios.length ? `Aplicar ${r.cambios.length} cambio(s)` : 'Aplicar cambios';
    } catch (e) {
      previa.replaceChildren(h('p', { class: 'previa-errores', text: (e as Error).message }));
    }
  }
  aplicar.addEventListener('click', async () => {
    if (!pendientesExcel.length) return;
    aplicar.disabled = true;
    const r = await ubicar(pendientesExcel.map((c) => ({ id: c.id, conjunto: c.a })));
    if (r) {
      pendientesExcel = [];
      dlgExcel.close();
    } else aplicar.disabled = false;
  });

  // ───────────────────────── Cuentas nuevas ─────────────────────────
  async function revisarCuenta(c: Cuenta, activar: boolean, boton: HTMLElement) {
    if (!activar && !(await confirmar(`La cuenta de ${c.nombre} quedará rechazada y no podrá entrar.`, 'Sí, rechazar'))) return;
    boton.setAttribute('aria-busy', 'true');
    try {
      await api('/api/coordinacion/cuentas', 'PATCH', { email: c.email, accion: activar ? 'activar' : 'rechazar' });
      D.cuentas = D.cuentas.filter((x) => x.email !== c.email);
      toast(activar ? `Cuenta de ${c.nombre} activada ✓ El aviso quedó en la bandeja del comité.` : `Cuenta de ${c.nombre} rechazada`, 'ok');
      renderCuentas();
    } catch (e) {
      toast((e as Error).message, 'error');
      boton.removeAttribute('aria-busy');
    }
  }
  function renderCuentas() {
    const lista = D.cuentas.filter((c) => c.estado === 'pending_activation');
    $('listaCuentas').replaceChildren(
      ...(lista.length
        ? lista.map((c) => {
            const t = torre(c.torre);
            const deAdmin = D.admins.includes(c.email);
            const inscrita = D.inscripciones.find((i) => i.owner_email === c.email);
            const activarBtn = h('button', { type: 'button', class: 'btn btn-sm btn-aprobar', text: 'Activar', disabled: deAdmin && !esAdmin });
            activarBtn.addEventListener('click', () => revisarCuenta(c, true, activarBtn));
            const rechazarBtn = h('button', { type: 'button', class: 'btn btn-sm btn-rechazar', text: 'Rechazar', disabled: deAdmin && !esAdmin });
            rechazarBtn.addEventListener('click', () => revisarCuenta(c, false, rechazarBtn));
            return h(
              'article',
              { class: 'cuenta' },
              h(
                'div',
                {},
                h('h3', { text: c.nombre }),
                h('div', { class: 'sub', text: `${t?.nombre ?? c.torre}${c.apartamento ? ` ${c.apartamento}` : ''} · +57 ${c.whatsapp} · ${c.email}` }),
                h('div', { class: 'sub', text: `Se registró ${fechaCorta(c.creado_at)}${inscrita ? ` · se inscribió con "${inscrita.nombre}"` : ''}` }),
                deAdmin ? h('span', { class: 'pill-admin', text: esAdmin ? 'ADMIN: tendrá acceso total' : 'ADMIN: solo el administrador la activa' }) : null,
              ),
              h('div', { class: 'acc' }, activarBtn, rechazarBtn),
            );
          })
        : [h('div', { class: 'vacio-lista', text: 'No hay cuentas esperando. Cuando un vecino se registre, aparecerá aquí.' })]),
    );
    badges();
  }

  function pintarFeria() {
    if (!feria()) return;
    renderResumen();
    renderCupos();
    renderTabla();
    badges();
  }

  pintarFeria();
  renderCuentas();
  irA(location.hash.slice(1) === 'cuentas' ? 'cuentas' : 'inscripciones');
}
