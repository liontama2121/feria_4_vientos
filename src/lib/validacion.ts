// Saneo y validación de lo que llega del panel. Todo input del navegador pasa por aquí
// antes de tocar D1, así la landing nunca recibe campos inesperados.
import {
  CATEGORIA_IDS,
  LIMITES,
  TORRE_IDS,
  datosVacios,
  type CategoriaId,
  type DatosEmprendimiento,
  type TorreId,
} from './constantes';

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function texto(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL, '').trim().slice(0, max);
}

/** Solo aceptamos fotos servidas por el propio sitio (R2 vía /media o /logos). */
export function urlFoto(v: unknown): string {
  const s = texto(v, 300);
  return /^\/(media|logos)\/[\w\-./]+$/.test(s) && !s.includes('..') ? s : '';
}

export function celular(v: unknown): string {
  let d = texto(v, 30).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  // Sin recortar a 10: un número con dígitos de más debe fallar la validación, no quedar mal guardado.
  return d.slice(0, 15);
}

export function usuarioRed(v: unknown): string {
  return texto(v, 60)
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '')
    .replace(/^@/, '')
    .replace(/[^\w.]/g, '')
    .slice(0, 30);
}

export function paginaFacebook(v: unknown): string {
  return texto(v, 120)
    .replace(/^https?:\/\/(www\.|m\.)?(facebook|fb)\.com\//i, '')
    .replace(/^facebook\.com\//i, '')
    .replace(/[^\w.\-/?=]/g, '')
    .slice(0, 80);
}

/** Página web del emprendimiento: siempre http(s), con dominio real. Sin esquema se asume https. */
export function paginaWeb(v: unknown): string {
  const s = texto(v, 200).replace(/\s+/g, '');
  if (!s) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function esTorre(v: unknown): v is TorreId {
  return typeof v === 'string' && (TORRE_IDS as readonly string[]).includes(v);
}

export function esCategoria(v: unknown): v is CategoriaId {
  return typeof v === 'string' && (CATEGORIA_IDS as readonly string[]).includes(v);
}

export function esEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;
}

/** Normaliza lo que manda el panel sobre la versión guardada (`base`). */
export function sanearDatos(input: unknown, base: DatosEmprendimiento = datosVacios()): DatosEmprendimiento {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const galeria = Array.isArray(i.galeria) ? i.galeria.map(urlFoto).filter(Boolean) : base.galeria;
  return {
    nombre_emprendimiento: texto(i.nombre_emprendimiento, 80),
    nombre_vecino: texto(i.nombre_vecino, 80),
    apartamento: texto(i.apartamento, 10),
    torre: esTorre(i.torre) ? i.torre : base.torre,
    categoria: esCategoria(i.categoria) ? i.categoria : base.categoria,
    descripcion_corta: texto(i.descripcion_corta, LIMITES.descripcionCorta),
    descripcion_larga: texto(i.descripcion_larga, LIMITES.descripcionLarga),
    foto_principal: urlFoto(i.foto_principal),
    galeria: [...new Set(galeria)].slice(0, LIMITES.galeria),
    whatsapp: celular(i.whatsapp),
    instagram: usuarioRed(i.instagram),
    tiktok: usuarioRed(i.tiktok),
    facebook: paginaFacebook(i.facebook),
    pagina_web: paginaWeb(i.pagina_web),
    destacado: i.destacado === true,
    publicado: i.publicado !== false,
    en_feria: i.en_feria === true,
    recibir_avisos: i.recibir_avisos !== false,
    emoji_placeholder: texto(i.emoji_placeholder, 16) || base.emoji_placeholder,
  };
}

/** Como `sanearDatos`, pero vitrina, "Publicar en la landing" y "Está en la feria" solo los cambia el comité. */
export function sanearDatosPara(locals: App.Locals, input: unknown, base: DatosEmprendimiento): DatosEmprendimiento {
  const datos = sanearDatos(input, base);
  if (locals.usuario?.rol === 'admin') return datos;
  return { ...datos, destacado: base.destacado, publicado: base.publicado, en_feria: base.en_feria };
}

export interface Faltante {
  campo: keyof DatosEmprendimiento;
  mensaje: string;
}

/** Lo mínimo para aparecer en la landing. */
export function validarPublicacion(d: DatosEmprendimiento): Faltante[] {
  const f: Faltante[] = [];
  if (!d.nombre_vecino) f.push({ campo: 'nombre_vecino', mensaje: 'Escribe tu nombre completo' });
  if (!d.nombre_emprendimiento) f.push({ campo: 'nombre_emprendimiento', mensaje: 'Ponle nombre a tu emprendimiento' });
  if (!d.descripcion_corta) f.push({ campo: 'descripcion_corta', mensaje: 'Escribe la descripción corta' });
  if (!d.foto_principal && !d.emoji_placeholder)
    f.push({ campo: 'foto_principal', mensaje: 'Sube la foto principal' });
  if (d.whatsapp.length !== 10) f.push({ campo: 'whatsapp', mensaje: 'El WhatsApp debe tener 10 dígitos' });
  return f;
}
