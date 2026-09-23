/// <reference types="astro/client" />

// Tipos de Cloudflare importados como módulo (no globales) para no pisar los tipos del DOM
// que usan los scripts del navegador (panel y comité).
type D1Database = import('@cloudflare/workers-types/index').D1Database;
type D1PreparedStatement = import('@cloudflare/workers-types/index').D1PreparedStatement;
type R2Bucket = import('@cloudflare/workers-types/index').R2Bucket;

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  /** p. ej. "feria4vientos.cloudflareaccess.com" */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag(s) de las apps de Access, separados por coma */
  CF_ACCESS_AUD?: string;
  /** Correos con rol admin, separados por coma */
  ADMIN_EMAILS?: string;
  /** Opcionales: sincronizar cuentas nuevas con un grupo de Zero Trust */
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_ACCESS_GROUP_VECINOS?: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    /** Email verificado (Zero Trust o usuario dev). null si no hay sesión. */
    email: string | null;
    /** Cuenta en D1. null si el email no tiene cuenta activa. */
    usuario: import('./lib/db').Usuario | null;
  }
}
