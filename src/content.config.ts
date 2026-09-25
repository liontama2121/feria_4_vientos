// Content collections (Astro 5, content layer).
// Los .md de src/content/ son el contenido SEMILLA versionado en git:
// la primera vez que arranca el sitio se copian a D1, y desde ahí los
// editan los vecinos (/admin, con moderación) y el comité (/admin/comite). Ver CLAUDE.md.
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORIA_IDS, ESTADOS, TIPOS_PATROCINADOR, TORRE_IDS } from './lib/constantes';

const usuario = z
  .string()
  .default('')
  .transform((v) => v.replace(/^@/, '').trim());

const emprendedores = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/emprendedores' }),
  schema: z.object({
    nombre_emprendimiento: z.string().min(1),
    nombre_vecino: z.string().min(1),
    apartamento: z.string().default(''),
    torre: z.enum(TORRE_IDS),
    categoria: z.enum(CATEGORIA_IDS),
    descripcion_corta: z.string().max(160),
    descripcion_larga: z.string().default(''),
    foto_principal: z.string().default(''),
    galeria: z.array(z.string()).max(6).default([]),
    whatsapp: z.string().regex(/^\d{10}$/, 'Celular colombiano de 10 dígitos, sin +57'),
    instagram: usuario,
    tiktok: usuario,
    facebook: usuario,
    pagina_web: z.string().url().or(z.literal('')).default(''),
    destacado: z.boolean().default(false),
    publicado: z.boolean().default(true),
    /** Los emprendedores semilla son los de la feria. */
    en_feria: z.boolean().default(true),
    emoji_placeholder: z.string().default('✨'),
    /** Estado de moderación con el que se siembra en D1. Solo `approved` sale en la landing. */
    estado: z.enum(ESTADOS).default('approved'),
  }),
});

const torres = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/torres' }),
  schema: z.object({
    nombre: z.string(),
    rumbo: z.string(),
    caracter: z.string(),
    color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    color_claro: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    tagline: z.string(),
    emoji_simbolo: z.string(),
    orden: z.number().int(),
  }),
});

const patrocinadores = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/patrocinadores' }),
  schema: z.object({
    nombre: z.string(),
    tipo: z.enum(TIPOS_PATROCINADOR),
    etiqueta: z.string(),
    rol_corto: z.string(),
    descripcion: z.string(),
    logo: z.string().default(''),
    emoji: z.string().default('🤝'),
    orden: z.number().int(),
    destacado: z.boolean().default(false),
  }),
});

const fechas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/fechas' }),
  schema: z.object({
    eventos: z.array(
      z.object({
        titulo: z.string(),
        // Entre comillas en el YAML ("2026-09-26") para que no se convierta en Date
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
        hora_fin: z.string().regex(/^\d{2}:\d{2}$/),
        descripcion: z.string().default(''),
      }),
    ),
  }),
});

export const collections = { emprendedores, torres, patrocinadores, fechas };
