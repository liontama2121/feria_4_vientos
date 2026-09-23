/// <reference types="astro/client" />

// Tipos de Cloudflare importados como módulo (no globales) para no pisar los tipos del DOM
// que usan los scripts del navegador (panel y comité).
type D1Database = import('@cloudflare/workers-types/index').D1Database;
type D1PreparedStatement = import('@cloudflare/workers-types/index').D1PreparedStatement;
type R2Bucket = import('@cloudflare/workers-types/index').R2Bucket;

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  /** Usuario y contraseña del panel del comité */
  ADMIN_USER?: string;
  ADMIN_PASSWORD?: string;
  /** Opcional: texto largo aleatorio que refuerza la firma de la cookie de sesión */
  SESSION_SECRET?: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    /** El comité si hay sesión válida; null si no. */
    usuario: import('./lib/db').Usuario | null;
  }
}
