# Feria 4 Vientos

Sitio de la feria de emprendimientos del **Conjunto Residencial 4 Vientos** (Bogotá): landing pública agrupada por torre (Mistral, Gregal, Austro, Cierzo) y **panel del comité** en `/admin` (protegido con usuario y contraseña). Lo que se publica en el panel se ve en la landing al instante.

Astro 5 · Tailwind v4 · Cloudflare Pages + D1 + R2.
Sitio web hecho con amor por JuanCode.

---

## 1. Correr en local

Requisitos: Node 18.20+ (probado con Node 25) y npm.

```bash
npm install
npm run dev          # http://localhost:4321
```

No necesitas cuenta de Cloudflare para desarrollar: wrangler crea D1 y R2 locales en `.wrangler/state/` y la base se siembra sola con el contenido de `src/content/` (8 emprendedores, 4 torres, 3 patrocinadores, 4 fechas).

**Entrar al panel en local:** http://localhost:4321/admin → usuario `comite`, contraseña `feria4vientos` (valores por defecto solo en `npm run dev`). Para usar otros, crea un archivo `.dev.vars` (no se sube a git):

```
ADMIN_USER=comite
ADMIN_PASSWORD=otra-clave
```

Reiniciar la base local: parar el servidor y borrar la carpeta `.wrangler/`.

## 2. Build y verificación

```bash
npx astro check      # tipos (0 errores)
npm run build        # genera dist/ para Cloudflare Pages
npm run preview      # build + wrangler pages dev (igual que producción)
```

## 3. Deploy a Cloudflare Pages (con D1 y R2)

```bash
npx wrangler login

# Base de datos: copia el "database_id" que imprime y pégalo en wrangler.jsonc
npx wrangler d1 create feria-4-vientos

# Bucket para las fotos (binding MEDIA)
npx wrangler r2 bucket create feria-4-vientos-media

# Proyecto de Pages (una sola vez)
npx wrangler pages project create feria-4-vientos --production-branch pro/feria4vientos   # ya creado

# Build + deploy (usa los bindings DB y MEDIA de wrangler.jsonc)
npm run deploy
```

El esquema de D1 se crea y se siembra solo en el primer request. Queda en `https://feria-4-vientos.pages.dev`.

Alternativa por Git: en el dashboard → Workers & Pages → Create → Pages → Connect to Git; build command `npm run build`, output `dist`. Los bindings se toman de `wrangler.jsonc`.

## 4. Usuario y contraseña del panel

En el dashboard: **Workers & Pages → feria-4-vientos → Settings → Variables and Secrets → Add** (tipo *Secret*, entorno *Production*):

| Nombre | Valor |
|---|---|
| `ADMIN_USER` | el usuario del comité, p. ej. `comite` |
| `ADMIN_PASSWORD` | una contraseña larga |
| `SESSION_SECRET` | opcional: texto aleatorio largo que refuerza la cookie de sesión |

Luego **Deployments → … → Retry deployment** (o cualquier push) para que tomen efecto. Por CLI es lo mismo:

```bash
npx wrangler pages secret put ADMIN_USER --project-name feria-4-vientos
npx wrangler pages secret put ADMIN_PASSWORD --project-name feria-4-vientos
```

Nunca pongas la contraseña en `wrangler.jsonc`: ese archivo está en git. Cambiar la contraseña cierra todas las sesiones abiertas. La sesión dura 7 días.

## 5. Agregar un vecino

1. El vecino escribe por WhatsApp al comité: nombre, torre, apartamento, qué ofrece, fotos y redes.
2. En `/admin` → **+ Nuevo emprendimiento** (torre y apto).
3. Llena sus datos, sube las fotos y dale **Publicar cambios**: aparece al instante en la sección de su torre.
4. Para quitarlo sin borrarlo: **Ocultar** en la lista (o apaga "Publicar en la landing").

## 6. Qué hay dónde

- `src/content/` — contenido semilla (emprendedores, torres, patrocinadores, fechas).
- `src/lib/sitio.ts` — WhatsApp e Instagram del comité, enlace de JuanCode.
- `src/pages/admin/` — login, lista del comité y editor de cada emprendimiento. Lógica en `src/scripts/`.
- `CLAUDE.md` — contexto completo del proyecto (identidad, decisiones, modelo de datos, tareas).
