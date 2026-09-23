# Feria 4 Vientos

Sitio de la feria de emprendimientos del **Conjunto Residencial 4 Vientos** (Bogotá): landing pública agrupada por torre (Mistral, Gregal, Austro, Cierzo), **panel del vecino** en `/admin` y **vista del comité** en `/admin/comite`.

Astro 5 · Tailwind v4 · Cloudflare Pages + D1 + R2 · Cloudflare Zero Trust (Google).
Sitio web hecho con amor por JuanCode.

---

## 1. Correr en local

Requisitos: Node 18.20+ (probado con Node 25) y npm.

```bash
npm install
npm run dev          # http://localhost:4321
```

No necesitas cuenta de Cloudflare para desarrollar: wrangler crea D1 y R2 locales en `.wrangler/state/` y la base se siembra sola con el contenido de `src/content/` (8 emprendedores, 4 torres, 3 patrocinadores, 4 fechas).

**Usuarios de prueba** (solo en `npm run dev`):

| Usuario | Rol | Entrar |
|---|---|---|
| `aleida@dev.local` | Vecina · Austro 402 · Dulces Aleida (por defecto) | http://localhost:4321/admin |
| `julio@dev.local` | Vecino · Cierzo 301 · Reparaciones Don Julio | http://localhost:4321/api/dev/login?as=julio@dev.local |
| `nuevo@dev.local` | Vecina nueva · Mistral 110 · registro vacío | http://localhost:4321/api/dev/login?as=nuevo@dev.local |
| `comite@dev.local` | Comité (admin) | http://localhost:4321/api/dev/login?as=comite@dev.local |

Reiniciar la base local: parar el servidor y borrar la carpeta `.wrangler/`.

## 2. Build y verificación

```bash
npx astro check      # tipos (0 errores)
npm run build        # genera dist/ para Cloudflare Pages
npm run preview      # build + wrangler pages dev (igual que producción: exige Zero Trust)
```

## 3. Deploy a Cloudflare Pages (con D1 y R2)

```bash
npx wrangler login

# Base de datos: copia el "database_id" que imprime y pégalo en wrangler.jsonc
npx wrangler d1 create feria-4-vientos

# Bucket para las fotos (binding MEDIA)
npx wrangler r2 bucket create feria-4-vientos-media

# Proyecto de Pages (una sola vez)
npx wrangler pages project create feria-4-vientos --production-branch pro/feria4vientos

# Build + deploy (usa los bindings DB y MEDIA de wrangler.jsonc)
npm run deploy
```

El esquema de D1 se crea y se siembra solo en el primer request. Queda en `https://feria-4-vientos.pages.dev`.

Alternativa por Git: en el dashboard → Workers & Pages → Create → Pages → Connect to Git; build command `npm run build`, output `dist`. Los bindings se toman de `wrangler.jsonc`.

Variables (en `wrangler.jsonc` → `vars`, luego `npm run deploy` de nuevo):

| Variable | Valor |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | `tu-equipo.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | AUD de la app "Panel" y de la app "Comité", separados por coma |
| `ADMIN_EMAILS` | correos del comité separados por coma (siempre son admin) |

Opcional, para que crear/quitar cuentas en el comité actualice solo el grupo de Zero Trust:

```bash
npx wrangler pages secret put CF_API_TOKEN --project-name feria-4-vientos           # token con permiso "Access: Organizations, Identity Providers, and Groups: Edit"
npx wrangler pages secret put CF_ACCOUNT_ID --project-name feria-4-vientos
npx wrangler pages secret put CF_ACCESS_GROUP_VECINOS --project-name feria-4-vientos # id del grupo "Vecinos Feria"
```

## 4. Zero Trust: proteger `/admin` con Google (roles `vecino` y `admin`)

1. **Google como login.** En Google Cloud Console → APIs y servicios → Credenciales → *ID de cliente OAuth* (aplicación web). URI de redirección: `https://<tu-equipo>.cloudflareaccess.com/cdn-cgi/access/callback`. En Zero Trust → Settings → Authentication → Login methods → Add → Google: pega Client ID y Secret. Prueba con *Test*.
2. **Grupos** (Access → Access Groups):
   - `Comité Feria` → Include → Emails → correos del comité.
   - `Vecinos Feria` → Include → Emails → correos de los vecinos habilitados.
3. **App "Feria · Panel"** (Access → Applications → Add → Self-hosted):
   - Hostnames: `feria-4-vientos.pages.dev` con paths `admin`, `api/panel`, `api/comite`. Si usas dominio propio, agrégalo también. Para los previews agrega `*.feria-4-vientos.pages.dev` con los mismos paths.
   - Identity providers: solo Google.
   - Policy `Vecinos y comité` → Allow → Include: grupo `Vecinos Feria` **o** grupo `Comité Feria`.
4. **App "Feria · Comité"** (más específica, gana sobre la anterior):
   - Paths: `admin/comite`, `api/comite`.
   - Policy `Solo comité` → Allow → Include: grupo `Comité Feria`.
5. Copia el **Application Audience (AUD) tag** de ambas apps (Overview de cada app) → `CF_ACCESS_AUD="audPanel,audComite"`. El team domain va en `CF_ACCESS_TEAM_DOMAIN`. Deploy de nuevo.

Doble control: Access decide quién pasa por la puerta; la app verifica la firma del JWT y toma el rol de su tabla `usuarios` (o de `ADMIN_EMAILS`).

## 5. Dar de alta a un vecino

1. El vecino escribe por WhatsApp al comité: nombre, torre, apartamento y su correo de Google.
2. En `/admin/comite` → **Cuentas** → crear cuenta (se crea su emprendimiento en borrador).
3. Si no está la sincronización automática: agregar el correo al grupo `Vecinos Feria` en Zero Trust.
4. Mandarle el enlace `https://feria-4-vientos.pages.dev/admin`.
5. Cuando publique, aparece como **Pendiente** en el comité → **Aprobar** → sale en la landing, en la sección de su torre.

## 6. Qué hay dónde

- `src/content/` — contenido semilla (emprendedores, torres, patrocinadores, fechas).
- `src/lib/sitio.ts` — WhatsApp e Instagram del comité, enlace de JuanCode.
- `src/pages/admin/` — panel del vecino y comité. Lógica en `src/scripts/`.
- `CLAUDE.md` — contexto completo del proyecto (identidad, decisiones, modelo de datos, tareas).
