// Lógica del panel del emprendimiento (/admin).
// Estado único en memoria (`estado`) → todo se re-pinta desde ahí: vista previa, chip del
// usuario, contador de fotos, pasos completos y color de torre.
// Vecino: edita solo en draft / changes_requested y manda a revisión. Admin: edita y publica.
import { ESTADOS_EDITABLES, dominioWeb, iniciales, type CategoriaId, type DatosEmprendimiento, type TorreId } from '../lib/constantes';
import type { Notificacion, ResumenPanel, Rol, Torre } from '../lib/db';

type Vista = 'emprendimiento' | 'fotos' | 'redes' | 'publicacion' | 'configuracion';
type Red = 'whatsapp' | 'instagram' | 'tiktok' | 'facebook';

interface DatosPanel {
  resumen: ResumenPanel;
  rol: Rol;
  editable: boolean;
  comiteWhatsapp: string;
  torres: Torre[];
  categorias: { id: CategoriaId; label: string; emoji: string }[];
  limites: { descripcionCorta: number; galeria: number; fotoOriginalBytes: number; fotoBytes: number; fotoLado: number; autoSaveMs: number };
  iconos: Record<Red, string>;
}

const CABECERAS: Record<Vista, { eyebrow: string; titulo: [string, string, string]; desc: string }> = {
  emprendimiento: {
    eyebrow: 'MI EMPRENDIMIENTO',
    titulo: ['Cuenta tu ', 'historia', '.'],
    desc: 'Completa tus datos y envíalos al comité. Cuando lo aprueben, apareces en la landing de la feria.',
  },
  fotos: {
    eyebrow: 'FOTOS',
    titulo: ['Que se ', 'vea', ' lo que haces.'],
    desc: 'La primera foto es la principal y es la que sale en tu card. Arrastra las fotos para cambiar el orden.',
  },
  redes: {
    eyebrow: 'REDES SOCIALES',
    titulo: ['Que te ', 'encuentren', ' fácil.'],
    desc: 'Tus vecinos te escriben directo desde la landing. El WhatsApp es obligatorio; las redes suman confianza.',
  },
  publicacion: {
    eyebrow: 'PUBLICACIÓN',
    titulo: ['Tú decides ', 'cuándo', ' salir.'],
    desc: 'Enciende o apaga tu aparición en la landing, pide salir en la vitrina y elige si quieres avisos del comité.',
  },
  configuracion: {
    eyebrow: 'CONFIGURACIÓN',
    titulo: ['Tu ', 'acceso', '.'],
    desc: 'Usuario del panel y cómo cambiar la contraseña.',
  },
};

const FORMATOS = ['image/jpeg', 'image/png', 'image/webp'];

export function iniciarPanel() {
  const nodoDatos = document.getElementById('panel-datos');
  if (!nodoDatos) return;
  const D = JSON.parse(nodoDatos.textContent!) as DatosPanel;
  const LIM = D.limites;
  const slug = D.resumen.slug;

  let resumen = D.resumen;
  const esAdmin = D.rol === 'admin';
  let editable = D.editable;
  const estado: DatosEmprendimiento = structuredClone(resumen.borrador);
  // Registros de antes del límite de 3 fotos: se quedan con las primeras.
  estado.galeria = estado.galeria.slice(0, D.limites.galeria);
  let sucio = false;
  let guardando = false;
  let subiendo = 0;
  let ultimoGuardado: Date | null = resumen.borrador_at ? new Date(resumen.borrador_at) : null;
  let vista: Vista = 'emprendimiento';

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
  const torreDe = (id: string) => D.torres.find((t) => t.id === id) ?? D.torres[0];
  const categoriaDe = (id: string) => D.categorias.find((c) => c.id === id) ?? D.categorias[D.categorias.length - 1];
  const fotos = () => [estado.foto_principal, ...estado.galeria].filter(Boolean);
  const maxFotos = LIM.galeria + 1;

  // ───────────────────────── Toasts ─────────────────────────
  function toast(msg: string, tipo: 'ok' | 'error' | 'info' = 'info', enlace?: { href: string; texto: string }) {
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.textContent = msg;
    if (enlace) {
      const a = document.createElement('a');
      a.href = enlace.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = ` ${enlace.texto}`;
      a.style.cssText = 'color:inherit;text-decoration:underline;margin-left:6px';
      t.append(a);
    }
    $('toasts').append(t);
    setTimeout(() => t.remove(), enlace ? 12000 : tipo === 'error' ? 6000 : 3500);
  }

  const linkWsp = (numero: string, mensaje: string) => `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  const linkComite = (mensaje: string) => linkWsp(D.comiteWhatsapp, mensaje);

  // ───────────────────────── Torre: tiñe toda la UI ─────────────────────────
  function aplicarTorre() {
    const t = torreDe(estado.torre);
    document.body.dataset.torre = t.id;
    // Colores editables por el comité: pisan los tokens por defecto de body[data-torre].
    document.body.style.setProperty('--torre', t.color_hex);
    document.body.style.setProperty('--torre-claro', t.color_claro);
    document.body.style.setProperty('--torre-medio', `color-mix(in srgb, ${t.color_hex} 45%, ${t.color_claro})`);
    $$('#torrePicker .torre-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.torre === t.id)));
    $('prevTorre').textContent = t.nombre;
  }

  // ───────────────────────── Vista previa + chip ─────────────────────────
  function svgRed(red: Red) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', D.iconos[red]);
    svg.append(path);
    return svg;
  }

  function texto(el: HTMLElement, valor: string, vacio: string) {
    el.textContent = valor || vacio;
    el.classList.toggle('vacio-txt', !valor);
  }

  function renderPreview() {
    const t = torreDe(estado.torre);
    const cat = categoriaDe(estado.categoria);
    const foto = $('prevFoto');
    foto.replaceChildren();
    if (estado.foto_principal) {
      const img = document.createElement('img');
      img.src = estado.foto_principal;
      img.alt = '';
      foto.append(img);
    } else {
      foto.textContent = estado.emoji_placeholder || cat.emoji;
    }
    $('prevCat').textContent = `${cat.emoji} ${cat.label}`;
    texto($('prevNombre'), estado.nombre_emprendimiento, 'Tu emprendimiento');
    const donde = `${t.nombre}${estado.apartamento ? ` ${estado.apartamento}` : ''}`;
    texto($('prevBy'), estado.nombre_vecino ? `${estado.nombre_vecino} · ${donde}` : '', `Tu nombre · ${donde}`);
    texto($('prevDesc'), estado.descripcion_corta, 'Aquí va tu descripción corta: qué ofreces y qué te hace especial.');

    const web = $('prevWeb');
    web.hidden = !estado.pagina_web;
    $('prevWebDominio').textContent = dominioWeb(estado.pagina_web);

    const redes = $('prevRedes');
    redes.replaceChildren(
      ...(['whatsapp', 'instagram', 'tiktok', 'facebook'] as Red[])
        .filter((r) => estado[r])
        .map((r) => {
          const s = document.createElement('span');
          s.title = r;
          s.append(svgRed(r));
          return s;
        }),
    );
  }

  function renderChip() {
    const t = torreDe(estado.torre);
    const nombre = estado.nombre_vecino || 'Vecino sin nombre';
    $('userAvatar').textContent = iniciales(nombre);
    $('userName').textContent = nombre;
    $('userApto').textContent = `· ${t.nombre}${estado.apartamento ? ` ${estado.apartamento}` : ''}`;
  }

  function renderPasos() {
    const listos: Record<string, boolean> = {
      '1': !!(estado.nombre_vecino && estado.torre),
      '2': !!(estado.nombre_emprendimiento && estado.descripcion_corta && estado.categoria),
      '3': !!estado.foto_principal,
      '4': estado.whatsapp.length === 10,
      '5': esAdmin ? resumen.estado === 'approved' && !sucio : !ESTADOS_EDITABLES.includes(resumen.estado),
    };
    $$('section[data-paso]').forEach((s) => {
      const listo = listos[s.dataset.paso!];
      const step = s.querySelector('.step')!;
      step.classList.toggle('listo', listo);
      step.textContent = listo ? '✓' : s.dataset.paso!;
    });
  }

  function render() {
    renderPreview();
    renderChip();
    renderPasos();
    $('fotosBadge').textContent = String(fotos().length);
    const cnt = $('cntCorta');
    cnt.textContent = String(estado.descripcion_corta.length);
    $('cntCortaWrap').classList.toggle('lleno', estado.descripcion_corta.length >= LIM.descripcionCorta);
  }

  // ───────────────────────── Estado de moderación: banner + botón principal ─────────────────────────
  type Banner = { cls: string; ico: string; titulo: string; texto: string; nota?: string; landing?: boolean; wsp?: string };

  function fecha(iso: string | null) {
    return iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : '';
  }

  function bannerVecino(): Banner | null {
    const nombre = estado.nombre_emprendimiento || 'mi emprendimiento';
    switch (resumen.estado_visible) {
      case 'pending_review':
        return {
          cls: 'revision',
          ico: '⏳',
          titulo: 'En revisión',
          texto: 'Tu emprendimiento está en revisión. Te avisaremos por WhatsApp cuando esté aprobado.',
          wsp: `Hola comité 👋 Acabo de enviar "${nombre}" a revisión en la Feria 4 Vientos.`,
        };
      case 'approved':
        return {
          cls: 'ok',
          ico: '✓',
          titulo: `Aprobado y publicado en ${location.host}`,
          texto: 'Si necesitas cambios, contacta al comité.',
          landing: true,
          wsp: `Hola comité 👋 Necesito un cambio en "${nombre}" de la Feria 4 Vientos.`,
        };
      case 'oculto':
        return {
          cls: 'espera',
          ico: '🙈',
          titulo: 'Aprobado, pero oculto por ahora',
          texto: 'El comité lo tiene oculto de la landing. Escríbele si tienes dudas.',
          wsp: `Hola comité 👋 Tengo una pregunta sobre "${nombre}" en la Feria 4 Vientos.`,
        };
      case 'rejected':
        return {
          cls: 'alerta',
          ico: '🚫',
          titulo: 'Tu emprendimiento no fue aprobado',
          texto: 'Motivo del comité:',
          nota: resumen.motivo_rechazo || 'Sin motivo escrito.',
          wsp: `Hola comité 👋 Quiero hablar sobre el rechazo de "${nombre}" en la Feria 4 Vientos.`,
        };
      case 'changes_requested':
        return {
          cls: 'cambios',
          ico: '✎',
          titulo: 'El comité te pide unos cambios',
          texto: 'Ajusta lo que te indican y dale “Reenviar a revisión”.',
          nota: resumen.nota_cambios,
        };
      default:
        return null;
    }
  }

  function bannerAdmin(): Banner {
    const t = torreDe(resumen.torre_publicada ?? resumen.borrador.torre);
    const pendientes = resumen.cambios_sin_publicar ? ' Hay cambios guardados que aún no se publican.' : '';
    switch (resumen.estado_visible) {
      case 'approved':
        return { cls: 'ok', ico: '✅', titulo: 'Publicado en la landing', texto: `Aparece en la sección ${t.nombre}.${pendientes}`, landing: true };
      case 'oculto':
        return { cls: 'espera', ico: '🙈', titulo: 'Aprobado pero oculto', texto: '“Publicar en la landing” está apagado. Enciéndelo y publica, o usa “Mostrar” en la lista del comité.' };
      case 'pending_review':
        return {
          cls: 'revision',
          ico: '⏳',
          titulo: 'Solicitud del vecino en revisión',
          texto: `Enviada el ${fecha(resumen.enviado_at)}. Apruébala, recházala o pide cambios desde la cola del comité. “Publicar cambios” aquí también la aprueba.`,
        };
      case 'rejected':
        return { cls: 'alerta', ico: '🚫', titulo: 'Rechazado', texto: 'Motivo:', nota: resumen.motivo_rechazo };
      case 'changes_requested':
        return { cls: 'cambios', ico: '✎', titulo: 'Cambios pedidos al vecino', texto: 'Esperando que el vecino reenvíe. Nota enviada:', nota: resumen.nota_cambios };
      default:
        return { cls: 'espera', ico: '✏️', titulo: 'Aún no se ha publicado', texto: 'Completa los 5 pasos y dale a “Publicar cambios”: aparece en la landing al instante.' };
    }
  }

  function renderEstado() {
    const caja = $('estado');
    const c = esAdmin ? bannerAdmin() : bannerVecino();
    if (!c) {
      caja.hidden = true;
      return;
    }
    caja.className = `estado ${c.cls}`;
    const ico = document.createElement('span');
    ico.className = 'ico';
    ico.textContent = c.ico;
    const cuerpo = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = c.titulo;
    cuerpo.append(strong, c.texto);
    if (c.nota) {
      const nota = document.createElement('span');
      nota.className = 'nota';
      nota.textContent = c.nota;
      cuerpo.append(nota);
    }
    const acciones = document.createElement('div');
    acciones.className = 'estado-acciones';
    if (c.wsp) {
      const a = document.createElement('a');
      a.className = 'btn btn-sm btn-wsp';
      a.href = linkComite(c.wsp);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = resumen.estado === 'rejected' ? 'Contactar comité por WhatsApp' : resumen.estado === 'pending_review' ? 'Avisar al comité por WhatsApp' : 'Escribir al comité por WhatsApp';
      acciones.append(a);
    }
    if (c.landing) {
      const a = document.createElement('a');
      a.className = 'btn btn-sm btn-ghost';
      a.href = `/#${torreDe(resumen.torre_publicada ?? estado.torre).id}`;
      a.target = '_blank';
      a.textContent = 'Ver en la landing →';
      acciones.append(a);
    }
    if (acciones.childElementCount) cuerpo.append(acciones);
    caja.replaceChildren(ico, cuerpo);
    caja.hidden = false;
  }

  /** Texto y color del botón principal según rol y estado (tabla de CLAUDE.md). */
  function renderBoton() {
    const b = $<HTMLButtonElement>('btnPublicar');
    b.className = 'btn btn-primary';
    b.disabled = false;
    if (esAdmin) {
      b.textContent = 'Publicar cambios';
      return;
    }
    const conf: Record<ResumenPanel['estado'], [string, string]> = {
      draft: ['Enviar a revisión', ''],
      changes_requested: ['Reenviar a revisión', ''],
      pending_review: ['En revisión · No editable', 'gris'],
      approved: ['Aprobado y publicado', 'verde'],
      rejected: ['Rechazado', 'rojo'],
    };
    const [texto, color] = conf[resumen.estado];
    b.textContent = texto;
    if (color) {
      b.className = `btn btn-estado ${color}`;
      b.disabled = true;
    }
  }

  /** Bloquea (o libera) todo el formulario: inputs, chips, toggles y fotos. */
  function aplicarEditable() {
    document.body.classList.toggle('solo-lectura', !editable);
    $$<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('#panelMain .card :is(input, textarea, select, button)').forEach((el) => {
      el.disabled = !editable;
    });
    $<HTMLInputElement>('fileInput').disabled = !editable;
    $('btnBorrador').hidden = !editable;
    $('btnGuardarHead').hidden = !editable;
    renderFotos();
  }

  // ───────────────────────── Barra de estado (guardado) ─────────────────────────
  function relativo(fecha: Date) {
    const s = Math.round((Date.now() - fecha.getTime()) / 1000);
    if (s < 45) return 'unos segundos';
    const m = Math.round(s / 60);
    if (m < 60) return m === 1 ? '1 minuto' : `${m} minutos`;
    const h = Math.round(m / 60);
    if (h < 24) return h === 1 ? '1 hora' : `${h} horas`;
    return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  }

  function renderStatus() {
    const st = $('status');
    const txt = $('statusText');
    st.classList.toggle('sucio', sucio);
    txt.replaceChildren();
    if (guardando) {
      txt.textContent = 'Guardando…';
    } else if (sucio) {
      txt.textContent = `Cambios sin guardar · se guardan solos cada ${Math.round(LIM.autoSaveMs / 1000)} s`;
    } else if (ultimoGuardado) {
      const b = document.createElement('strong');
      b.textContent = relativo(ultimoGuardado);
      txt.append(`Último cambio guardado ${ultimoGuardado.getTime() > Date.now() - 86_400_000 ? 'hace ' : 'el '}`, b);
    } else {
      txt.textContent = 'Todavía no has guardado cambios';
    }
  }

  function marcarSucio() {
    if (!editable) return;
    sucio = true;
    render();
    renderStatus();
  }

  // ───────────────────────── Vistas del sidebar ─────────────────────────
  function irA(v: Vista, scroll = true) {
    vista = v;
    const desc = v === 'publicacion' && !esAdmin ? 'Elige si quieres que el comité te avise de las próximas ferias y novedades.' : CABECERAS[v].desc;
    $$('.sidebar-nav a').forEach((a) => a.classList.toggle('active', a.dataset.ir === v));
    $$('section.card[data-vistas]').forEach((s) => (s.hidden = !s.dataset.vistas!.split(' ').includes(v)));
    const c = CABECERAS[v];
    $('pageEyebrow').textContent = c.eyebrow;
    const h1 = $('pageTitle');
    const serif = document.createElement('span');
    serif.className = 'serif';
    serif.textContent = c.titulo[1];
    h1.replaceChildren(c.titulo[0], serif, c.titulo[2]);
    $('pageDesc').textContent = desc;
    history.replaceState(null, '', `${location.pathname}${location.search}#${v}`);
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $$('.sidebar-nav a').forEach((a) =>
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      irA(a.dataset.ir as Vista);
    }),
  );

  // ───────────────────────── Campos de texto ─────────────────────────
  function limpiarError(campo: string) {
    document.querySelector(`.field[data-field="${campo}"]`)?.classList.remove('error');
  }

  $$<HTMLInputElement | HTMLTextAreaElement>('input[data-campo], textarea[data-campo]').forEach((inp) => {
    const campo = inp.dataset.campo as keyof DatosEmprendimiento;
    inp.value = String(estado[campo] ?? '');
    if (campo === 'whatsapp') inp.value = formatoCelular(estado.whatsapp);
    if (campo === 'pagina_web') inp.value = estado.pagina_web.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    inp.addEventListener('input', () => {
      let v = inp.value;
      if (campo === 'whatsapp') {
        let d = v.replace(/\D/g, '');
        if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
        v = d.slice(0, 15);
      }
      if (campo === 'instagram' || campo === 'tiktok') v = v.replace(/^@+/, '').trim();
      // El prefijo https:// ya está pintado: si pegan la URL completa, no se duplica.
      if (campo === 'pagina_web' && /^https?:\/\//i.test(v)) inp.value = v = v.replace(/^https?:\/\//i, '');
      (estado as unknown as Record<string, string>)[campo] = v;
      limpiarError(campo);
      marcarSucio();
    });
    if (campo === 'whatsapp') inp.addEventListener('blur', () => (inp.value = formatoCelular(estado.whatsapp)));
  });

  function formatoCelular(d: string) {
    return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
  }

  // ───────────────────────── Torre, categoría y toggles ─────────────────────────
  $$('#torrePicker .torre-opt').forEach((b) =>
    b.addEventListener('click', () => {
      estado.torre = b.dataset.torre as TorreId;
      aplicarTorre();
      marcarSucio();
    }),
  );

  $$('#chipsCategoria .chip').forEach((b) =>
    b.addEventListener('click', () => {
      estado.categoria = b.dataset.categoria as CategoriaId;
      $$('#chipsCategoria .chip').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      marcarSucio();
    }),
  );

  $$('button.toggle[data-campo]').forEach((b) => {
    const campo = b.dataset.campo as 'publicado' | 'destacado' | 'en_feria' | 'recibir_avisos';
    b.setAttribute('aria-checked', String(estado[campo]));
    b.addEventListener('click', () => {
      estado[campo] = !estado[campo];
      b.setAttribute('aria-checked', String(estado[campo]));
      marcarSucio();
    });
  });

  // Flechas del teclado dentro de los grupos de radio (torre y categoría)
  $$('[role="radiogroup"]').forEach((grupo) =>
    grupo.addEventListener('keydown', (ev) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
      const opciones = $$('[role="radio"]', grupo);
      const i = opciones.indexOf(document.activeElement as HTMLElement);
      if (i < 0) return;
      ev.preventDefault();
      const sig = opciones[(i + (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length];
      sig.focus();
      sig.click();
    }),
  );

  // ───────────────────────── Fotos ─────────────────────────
  const grid = $('photoGrid');
  const fileInput = $<HTMLInputElement>('fileInput');
  let arrastrando: number | null = null;

  function setFotos(lista: string[]) {
    estado.foto_principal = lista[0] ?? '';
    estado.galeria = lista.slice(1, maxFotos);
    limpiarError('foto_principal');
    marcarSucio();
    renderFotos();
  }

  function mover(desde: number, hasta: number) {
    const lista = fotos();
    if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return;
    const [f] = lista.splice(desde, 1);
    lista.splice(hasta, 0, f);
    setFotos(lista);
  }

  function botonMini(textoBtn: string, label: string, accion: () => void) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini';
    b.textContent = textoBtn;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      accion();
    });
    return b;
  }

  function slotVacio(principal: boolean, texto: string) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `photo-slot${principal ? ' photo-main' : ''}`;
    b.setAttribute('aria-label', principal ? 'Subir foto principal' : 'Añadir foto');
    b.innerHTML = `<div class="placeholder"><div class="plus">+</div><span></span></div>`;
    b.querySelector('span')!.textContent = texto;
    b.disabled = !editable;
    b.addEventListener('click', () => editable && fileInput.click());
    return b;
  }

  function renderFotos() {
    const lista = fotos();
    const nodos: HTMLElement[] = [];

    for (let i = 0; i < maxFotos; i++) {
      const src = lista[i];
      const principal = i === 0;
      if (src) {
        const slot = document.createElement('div');
        slot.className = `photo-slot filled${principal ? ' photo-main' : ''}`;
        slot.draggable = editable;
        slot.dataset.idx = String(i);
        slot.tabIndex = 0;
        slot.setAttribute('aria-label', principal ? 'Foto principal' : `Foto ${i + 1}`);
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.draggable = false;
        slot.append(img);
        if (principal) {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = 'FOTO PRINCIPAL';
          slot.append(tag);
        }
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = '✕';
        del.setAttribute('aria-label', 'Eliminar foto');
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setFotos(lista.filter((_, j) => j !== i));
          toast('Foto quitada. Guarda o publica para confirmar.');
        });
        slot.append(del);
        const acciones = document.createElement('div');
        acciones.className = 'acciones';
        if (i > 0) acciones.append(botonMini('←', 'Mover a la izquierda', () => mover(i, i - 1)));
        if (i < lista.length - 1) acciones.append(botonMini('→', 'Mover a la derecha', () => mover(i, i + 1)));
        if (!principal) acciones.append(botonMini('★', 'Hacer foto principal', () => mover(i, 0)));
        slot.append(acciones);
        nodos.push(slot);
      } else if (i < lista.length + subiendo) {
        const s = document.createElement('div');
        s.className = `photo-slot subiendo${principal ? ' photo-main' : ''}`;
        s.setAttribute('aria-label', 'Subiendo foto');
        nodos.push(s);
      } else if (principal && estado.emoji_placeholder) {
        const b = slotVacio(true, '');
        b.classList.add('emoji-slot');
        b.innerHTML = '';
        b.append(estado.emoji_placeholder);
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'SUBE TU FOTO PRINCIPAL';
        b.append(tag);
        nodos.push(b);
      } else {
        nodos.push(slotVacio(principal, principal ? 'Foto principal' : 'Añadir'));
      }
    }

    const info = document.createElement('div');
    info.className = 'photo-info';
    const n = document.createElement('b');
    n.textContent = `${lista.length}/${maxFotos}`;
    info.append(n, 'fotos · arrastra o usa ← → ★ para ordenar');
    nodos.push(info);

    grid.replaceChildren(...nodos);
    $('fotosBadge').textContent = String(lista.length);
  }

  // Drag & drop: reordenar fotos y soltar archivos desde el computador
  grid.addEventListener('dragstart', (ev) => {
    const slot = (ev.target as HTMLElement).closest<HTMLElement>('.photo-slot.filled');
    if (!slot) return;
    arrastrando = Number(slot.dataset.idx);
    slot.classList.add('arrastrando');
    ev.dataTransfer!.effectAllowed = 'move';
    ev.dataTransfer!.setData('text/plain', slot.dataset.idx!);
  });
  grid.addEventListener('dragend', () => {
    arrastrando = null;
    $$('.photo-slot', grid).forEach((s) => s.classList.remove('arrastrando', 'drop'));
  });
  grid.addEventListener('dragover', (ev) => {
    const slot = (ev.target as HTMLElement).closest<HTMLElement>('.photo-slot');
    const conArchivos = ev.dataTransfer?.types.includes('Files');
    if (!slot && !conArchivos) return;
    ev.preventDefault();
    $$('.photo-slot', grid).forEach((s) => s.classList.toggle('drop', s === slot));
  });
  grid.addEventListener('dragleave', (ev) => {
    if (!grid.contains(ev.relatedTarget as Node)) $$('.photo-slot', grid).forEach((s) => s.classList.remove('drop'));
  });
  grid.addEventListener('drop', (ev) => {
    ev.preventDefault();
    if (!editable) return;
    $$('.photo-slot', grid).forEach((s) => s.classList.remove('drop'));
    if (ev.dataTransfer?.files.length) {
      subir(ev.dataTransfer.files);
      return;
    }
    const destino = (ev.target as HTMLElement).closest<HTMLElement>('.photo-slot');
    if (arrastrando === null || !destino) return;
    const hasta = destino.dataset.idx !== undefined ? Number(destino.dataset.idx) : fotos().length - 1;
    mover(arrastrando, hasta);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) subir(fileInput.files);
    fileInput.value = '';
  });

  /**
   * Reduce a máx. 1200 px y re-codifica a WEBP (o JPEG si el navegador no sabe WEBP).
   * Si aún pesa más del límite, baja calidad y tamaño hasta que quepa.
   */
  async function optimizar(file: File): Promise<Blob> {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return file;
    }
    const intentos: [number, number][] = [
      [LIM.fotoLado, 0.8],
      [LIM.fotoLado, 0.65],
      [1000, 0.6],
      [800, 0.55],
    ];
    let mejor: Blob = file;
    try {
      for (const [lado, calidad] of intentos) {
        const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bmp.width * escala);
        canvas.height = Math.round(bmp.height * escala);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const aBlob = (tipo: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, tipo, calidad));
        let blob = await aBlob('image/webp');
        if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/jpeg');
        if (blob && blob.size < mejor.size) mejor = blob;
        if (mejor.size <= LIM.fotoBytes) break;
      }
    } finally {
      bmp.close();
    }
    return mejor;
  }

  async function subir(archivos: FileList | File[]) {
    if (!editable) return;
    const libres = maxFotos - fotos().length - subiendo;
    const lista = Array.from(archivos);
    if (libres <= 0) {
      toast(`Ya tienes ${maxFotos} fotos. Quita alguna para subir otra.`, 'error');
      return;
    }
    if (lista.length > libres) toast(`Solo caben ${libres} foto(s) más; subimos las primeras.`);

    let subidas = 0;
    for (const f of lista.slice(0, libres)) {
      if (!FORMATOS.includes(f.type)) {
        toast(`“${f.name}” no es JPG, PNG ni WEBP.`, 'error');
        continue;
      }
      if (f.size > LIM.fotoOriginalBytes) {
        toast(`“${f.name}” es demasiado grande (más de ${Math.round(LIM.fotoOriginalBytes / 1024 / 1024)} MB).`, 'error');
        continue;
      }
      subiendo++;
      renderFotos();
      try {
        const blob = await optimizar(f);
        if (blob.size > LIM.fotoBytes) throw new Error(`No pudimos aligerar “${f.name}” lo suficiente. Prueba con otra foto o una captura de pantalla.`);
        const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
        const fd = new FormData();
        fd.append('foto', blob, `${f.name.replace(/\.[^.]+$/, '')}.${ext}`);
        fd.append('slug', slug);
        const res = await fetch('/api/panel/fotos', { method: 'POST', body: fd });
        const j = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !j.url) throw new Error(j.error || 'No se pudo subir la foto.');
        subiendo--;
        subidas++;
        setFotos([...fotos(), j.url]);
      } catch (e) {
        subiendo--;
        renderFotos();
        toast((e as Error).message, 'error');
      }
    }
    if (subidas) toast(subidas === 1 ? 'Foto lista. Se guarda con el borrador.' : `${subidas} fotos listas. Se guardan con el borrador.`, 'ok');
  }

  // ───────────────────────── Guardar y publicar ─────────────────────────
  const botones = () => [$<HTMLButtonElement>('btnBorrador'), $<HTMLButtonElement>('btnPublicar'), $<HTMLButtonElement>('btnGuardarHead')];

  async function enviar(url: string, metodo: 'PUT' | 'POST') {
    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, datos: estado }),
    });
    const j = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor.' }));
    return { res, j };
  }

  async function guardar(silencioso = false) {
    if (!editable || guardando || subiendo) return;
    guardando = true;
    botones().forEach((b) => (b.disabled = true));
    renderStatus();
    const foto = JSON.stringify(estado);
    try {
      const { res, j } = await enviar('/api/panel/borrador', 'PUT');
      if (!res.ok) throw new Error(j.error);
      resumen = j as ResumenPanel;
      ultimoGuardado = new Date(resumen.borrador_at ?? Date.now());
      if (JSON.stringify(estado) === foto) sucio = false;
      if (!silencioso) toast('Borrador guardado ✓', 'ok');
      renderEstado();
    } catch (e) {
      toast(silencioso ? 'No pudimos guardar automáticamente. Revisa tu conexión.' : (e as Error).message, 'error');
    } finally {
      guardando = false;
      botones().forEach((b) => (b.disabled = false));
      renderStatus();
      renderPasos();
    }
  }

  function faltantesLocales() {
    const f: { campo: string; mensaje: string }[] = [];
    if (!estado.nombre_vecino.trim()) f.push({ campo: 'nombre_vecino', mensaje: 'tu nombre' });
    if (!estado.nombre_emprendimiento.trim()) f.push({ campo: 'nombre_emprendimiento', mensaje: 'el nombre del emprendimiento' });
    if (!estado.descripcion_corta.trim()) f.push({ campo: 'descripcion_corta', mensaje: 'la descripción corta' });
    if (!estado.foto_principal && !estado.emoji_placeholder) f.push({ campo: 'foto_principal', mensaje: 'la foto principal' });
    if (estado.whatsapp.length !== 10) f.push({ campo: 'whatsapp', mensaje: 'un WhatsApp de 10 dígitos' });
    return f;
  }

  function marcarFaltantes(f: { campo: string; mensaje: string }[]) {
    f.forEach((x) => document.querySelector(`.field[data-field="${x.campo}"]`)?.classList.add('error'));
    if (vista !== 'emprendimiento') irA('emprendimiento', false);
    const primero = document.querySelector('.field.error');
    primero?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (primero?.querySelector('input, textarea, button') as HTMLElement | null)?.focus({ preventScroll: true });
    toast(`Para ${esAdmin ? 'publicar' : 'enviar'} falta: ${f.map((x) => x.mensaje).join(', ')}.`, 'error');
  }

  /** Admin: "Publicar cambios" (aprueba y sale al instante). Vecino: "Enviar a revisión". */
  async function publicar() {
    if (guardando) return;
    if (!esAdmin && !editable) return;
    if (subiendo) {
      toast('Espera a que terminen de subir las fotos.');
      return;
    }
    $$('.field.error').forEach((f) => f.classList.remove('error'));
    const locales = faltantesLocales();
    if (locales.length) {
      marcarFaltantes(locales);
      return;
    }
    guardando = true;
    botones().forEach((b) => (b.disabled = true));
    renderStatus();
    try {
      const { res, j } = await enviar(esAdmin ? '/api/panel/publicar' : '/api/panel/enviar', 'POST');
      if (res.status === 422 && j.faltantes) {
        marcarFaltantes(j.faltantes);
        return;
      }
      if (!res.ok) throw new Error(j.error);
      const { notificacion, ...r } = j as ResumenPanel & { notificacion?: Notificacion | null };
      resumen = r;
      ultimoGuardado = new Date((esAdmin ? resumen.publicado_at : resumen.enviado_at) ?? Date.now());
      sucio = false;
      if (esAdmin) {
        const t = torreDe(estado.torre).nombre;
        const aviso = notificacion?.whatsapp ? { href: linkWsp(`57${notificacion.whatsapp}`, notificacion.mensaje), texto: 'Avisar al vecino por WhatsApp' } : undefined;
        toast(resumen.estado_visible === 'oculto' ? 'Guardado. Está oculto de la landing.' : `¡Publicado! Ya aparece en la sección ${t} 🎉`, 'ok', aviso);
      } else {
        editable = false;
        aplicarEditable();
        toast('¡Enviado! El comité lo revisa y te avisa por WhatsApp.', 'ok');
      }
      renderEstado();
    } catch (e) {
      toast((e as Error).message || 'No se pudo enviar.', 'error');
    } finally {
      guardando = false;
      botones().forEach((b) => (b.disabled = false));
      renderBoton();
      renderStatus();
      renderPasos();
    }
  }

  $('btnBorrador').addEventListener('click', () => guardar());
  $('btnGuardarHead').addEventListener('click', () => guardar());
  $('btnPublicar').addEventListener('click', publicar);
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
      ev.preventDefault();
      if (editable) guardar();
    }
  });

  // Auto-save cada 30 s: solo borrador (nunca publica ni envía) y solo en estados editables.
  setInterval(() => {
    if (editable && sucio && !guardando && !subiendo) guardar(true);
  }, LIM.autoSaveMs);
  setInterval(renderStatus, 20_000);
  window.addEventListener('beforeunload', (ev) => {
    if (sucio) ev.preventDefault();
  });

  // ───────────────────────── Vista previa grande ─────────────────────────
  const dlg = $<HTMLDialogElement>('dlgPreview');
  $('btnVistaPrevia').addEventListener('click', () => {
    const copia = $('previewCard').cloneNode(true) as HTMLElement;
    copia.removeAttribute('id');
    copia.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    const larga = document.createElement('p');
    larga.style.cssText = 'margin-top:14px;font-size:14px;color:var(--tinta-media);white-space:pre-line';
    larga.textContent = estado.descripcion_larga || 'Sin descripción larga todavía.';
    $('dlgPreviewCard').replaceChildren(copia, larga);
    dlg.showModal();
  });
  dlg.querySelector('[data-cerrar]')!.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (ev) => ev.target === dlg && dlg.close());

  // ───────────────────────── Arranque ─────────────────────────
  aplicarTorre();
  aplicarEditable();
  render();
  renderEstado();
  renderBoton();
  renderStatus();
  const inicial = location.hash.slice(1) as Vista;
  irA(inicial in CABECERAS ? inicial : 'emprendimiento', false);
}
