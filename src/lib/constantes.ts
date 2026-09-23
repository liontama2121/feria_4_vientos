// Constantes compartidas entre servidor, content collections y scripts del panel.
// No importar nada de servidor aquí: este archivo también viaja al navegador.

export const TORRE_IDS = ['mistral', 'gregal', 'austro', 'cierzo'] as const;
export type TorreId = (typeof TORRE_IDS)[number];

/** Valores por defecto de cada torre. Los colores y textos reales viven en D1 (editables por el comité). */
export const TORRES_BASE: Record<TorreId, { nombre: string; rumbo: string; emoji: string; color: string; claro: string }> = {
  mistral: { nombre: 'Mistral', rumbo: 'Torre norte', emoji: '❄️', color: '#1E9C8C', claro: '#BFF0E6' },
  gregal: { nombre: 'Gregal', rumbo: 'Torre nororiente', emoji: '🌅', color: '#E8641B', claro: '#FFE1C7' },
  austro: { nombre: 'Austro', rumbo: 'Torre sur', emoji: '🌸', color: '#E3287A', claro: '#FFD3E6' },
  cierzo: { nombre: 'Cierzo', rumbo: 'Torre noroccidente', emoji: '⚡', color: '#7B3FE4', claro: '#E1D4FF' },
};

export const CATEGORIAS = [
  { id: 'comida', label: 'Comida', emoji: '🥟' },
  { id: 'reposteria', label: 'Repostería', emoji: '🧁' },
  { id: 'belleza', label: 'Belleza', emoji: '💅' },
  { id: 'bienestar', label: 'Bienestar', emoji: '🧘‍♀️' },
  { id: 'servicios', label: 'Servicios', emoji: '🔧' },
  { id: 'artesanias', label: 'Artesanías', emoji: '🧶' },
  { id: 'cafe', label: 'Café', emoji: '☕' },
  { id: 'arte', label: 'Arte', emoji: '🎨' },
  { id: 'oficios', label: 'Oficios', emoji: '🪚' },
  { id: 'otros', label: 'Otros', emoji: '✨' },
] as const;
export type CategoriaId = (typeof CATEGORIAS)[number]['id'];
export const CATEGORIA_IDS = CATEGORIAS.map((c) => c.id) as unknown as readonly [CategoriaId, ...CategoriaId[]];

export function categoria(id: string) {
  return CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[CATEGORIAS.length - 1];
}

export const TIPOS_PATROCINADOR = ['oficial', 'comunitario', 'cultural'] as const;
export type TipoPatrocinador = (typeof TIPOS_PATROCINADOR)[number];

export const LIMITES = {
  descripcionCorta: 160,
  descripcionLarga: 1500,
  galeria: 5, // fotos adicionales a la principal
  fotoBytes: 5 * 1024 * 1024,
  fotoLado: 1600, // px, lado mayor tras optimizar en el navegador
  autoSaveMs: 30_000,
} as const;

export const FORMATOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Estructura de un emprendimiento tal como la editan el panel y la landing. */
export interface DatosEmprendimiento {
  nombre_emprendimiento: string;
  nombre_vecino: string;
  apartamento: string;
  torre: TorreId;
  categoria: CategoriaId;
  descripcion_corta: string;
  descripcion_larga: string;
  foto_principal: string;
  galeria: string[];
  whatsapp: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  destacado: boolean;
  publicado: boolean;
  recibir_avisos: boolean;
  emoji_placeholder: string;
}

export function datosVacios(parcial: Partial<DatosEmprendimiento> = {}): DatosEmprendimiento {
  return {
    nombre_emprendimiento: '',
    nombre_vecino: '',
    apartamento: '',
    torre: 'mistral',
    categoria: 'otros',
    descripcion_corta: '',
    descripcion_larga: '',
    foto_principal: '',
    galeria: [],
    whatsapp: '',
    instagram: '',
    tiktok: '',
    facebook: '',
    destacado: false,
    publicado: true,
    recibir_avisos: true,
    emoji_placeholder: '',
    ...parcial,
  };
}

export function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function enlacesRedes(d: Pick<DatosEmprendimiento, 'whatsapp' | 'instagram' | 'tiktok' | 'facebook'>) {
  const redes: { red: 'whatsapp' | 'instagram' | 'tiktok' | 'facebook'; url: string; label: string }[] = [];
  if (d.whatsapp) redes.push({ red: 'whatsapp', url: `https://wa.me/57${d.whatsapp}`, label: 'WhatsApp' });
  if (d.instagram) redes.push({ red: 'instagram', url: `https://instagram.com/${d.instagram}`, label: 'Instagram' });
  if (d.tiktok) redes.push({ red: 'tiktok', url: `https://www.tiktok.com/@${d.tiktok}`, label: 'TikTok' });
  if (d.facebook) redes.push({ red: 'facebook', url: `https://facebook.com/${d.facebook}`, label: 'Facebook' });
  return redes;
}

/** Iconos SVG (paths de 24×24) usados en landing y panel. */
export const ICONOS = {
  whatsapp:
    'M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.4-.1-.6.1-.2.2-.7.9-.8 1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.5-.5-.7-.5h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.2 0 1.3.9 2.5 1 2.7.1.2 1.9 2.9 4.5 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3 0-.1-.2-.2-.5-.3zm-5.6 7.6h-.1c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.8 1 1-3.7-.3-.4C1.3 14.9.8 12.9.8 11c0-5.6 4.6-10.2 10.3-10.2 2.7 0 5.3 1.1 7.2 3 1.9 1.9 3 4.5 3 7.2 0 5.6-4.6 10.2-10.3 10.2zM17 3.1C15.4 1.4 13.2.5 11 .5 6 .5 1.9 4.6 1.9 9.6c0 1.8.5 3.5 1.4 5.1l-1.5 5.4 5.6-1.5c1.5.8 3.2 1.2 4.9 1.2 5.6 0 10.1-4.6 10.1-10.2 0-2.2-.9-4.4-2.4-6z',
  instagram:
    'M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8 0 3.2 0 3.6-.1 4.8-.1 3.3-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1-3.2 0-3.6 0-4.8-.1-3.3-.1-4.8-1.7-4.9-4.9-.1-1.3-.1-1.6-.1-4.8 0-3.2 0-3.6.1-4.8.1-3.3 1.7-4.8 4.9-4.9C8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7C8.3 24 8.7 24 12 24s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8c-3.4 0-6.2 2.8-6.2 6.2s2.8 6.2 6.2 6.2 6.2-2.8 6.2-6.2S15.4 5.8 12 5.8zM12 16c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm6.4-11.8c-.8 0-1.4.6-1.4 1.4 0 .8.6 1.4 1.4 1.4.8 0 1.4-.6 1.4-1.4 0-.8-.6-1.4-1.4-1.4z',
  tiktok:
    'M19.6 6.3c-1.6 0-3-1.4-3-3H14v13.4c0 1.4-1.1 2.5-2.5 2.5S9 18.1 9 16.7s1.1-2.5 2.5-2.5c.3 0 .6.1.9.2v-2.7c-.3-.1-.6-.1-.9-.1-2.9 0-5.2 2.3-5.2 5.2s2.3 5.2 5.2 5.2 5.2-2.3 5.2-5.2V9.9c1 .7 2.3 1.1 3.6 1.1V8.3c-.2 0-.4 0-.6-.1v-1.9z',
  facebook:
    'M22.7 0H1.3C.6 0 0 .6 0 1.3v21.4C0 23.4.6 24 1.3 24h11.5v-9.3H9.7v-3.6h3.1V8.4c0-3.1 1.9-4.8 4.7-4.8 1.3 0 2.5.1 2.8.1v3.3h-1.9c-1.5 0-1.8.7-1.8 1.8v2.3h3.6l-.5 3.6h-3.1V24h6.1c.7 0 1.3-.6 1.3-1.3V1.3C24 .6 23.4 0 22.7 0z',
} as const;
