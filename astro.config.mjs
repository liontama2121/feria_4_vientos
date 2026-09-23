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
  },
});
