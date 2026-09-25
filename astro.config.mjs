import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Sitio 100 % server-rendered sobre Cloudflare Pages:
// la landing lee de D1 en cada request, así lo que el vecino publica
// aparece de inmediato sin esperar un rebuild.
export default defineConfig({
  site: 'https://feria4vientos.pages.dev',
  output: 'server',
  adapter: cloudflare({
    // En `npm run dev` wrangler levanta D1 y R2 locales (carpeta .wrangler/)
    platformProxy: { enabled: true },
    imageService: 'passthrough',
  }),
  vite: {
    plugins: [tailwindcss()],
    // Rama que Cloudflare Pages está compilando (vacío en local y en `npm run deploy`).
    // Los previews usan la MISMA D1 de producción: ver `esPreviewSobreProduccion` en src/lib/db.ts.
    define: { 'import.meta.env.RAMA_CF': JSON.stringify(process.env.CF_PAGES_BRANCH ?? '') },
  },
});
