# CLAUDE.md — Feria 4 Vientos

Sitio + panel de la feria de emprendimientos del **Conjunto Residencial 4 Vientos** (Bogotá).
Landing pública agrupada por torre y panel del comité en `/admin` (un solo usuario y contraseña, en variables de entorno). Lo publicado se ve al instante en la landing (sin caché).
Todo en español (es-CO). Sitio web patrocinado por **JuanCode** (solo el sitio, no el evento).

---

## Contexto del negocio

- **4 torres = 4 vientos**, cada una con su color:
  | Torre | Rumbo | Color | Claro | Emoji | Tagline |
  |---|---|---|---|---|---|
  | Mistral | Norte | `#1E9C8C` | `#BFF0E6` | ❄️ | Manos que crean con calma… |
  | Gregal | Nororiente | `#E8641B` | `#FFE1C7` | 🌅 | El primer aire de la mañana… |
  | Austro | Sur | `#E3287A` | `#FFD3E6` | 🌸 | Sabor que se comparte… |
  | Cierzo | Noroccidente | `#7B3FE4` | `#E1D4FF` | ⚡ | Oficios que resuelven… |
- **El terminalito**: kiosco/portería auxiliar cerrado por años; la asamblea lo recuperó y ahí se hace la feria. Es el corazón narrativo (sección Historia).
- **Patrocinadores**: Alcaldía Local de Fontibón (oficial: espacio y logística, logo real en `public/logos/`), Consejo del Conjunto / Junta directiva (gestión interna), Casa de Cultura Local (aliado cultural). **JuanCode** solo patrocina el sitio web → sección propia + footer "Sitio web hecho con amor por JuanCode".
- Próxima feria sembrada: sábado 26 de septiembre de 2026, 9 a.m. a 1 p.m. (con vacunación de mascotas y niños y deporte, según el promo).

## Identidad (fuente de verdad: `video-feria-4-vientos.html`, gana sobre los mockups)

Tokens en `src/styles/global.css` (`:root`) y `tailwind.config.mjs` (colores nativos `bg-mistral`, `text-austro-claro`, …):

```
--crema #FFF7EA (fondo base)   --tinta #1A1633   --tinta-suave #6B6880   --tinta-media #45405F
--{torre} / --{torre}-claro / --{torre}-medio
--grad-vientos  (mistral→gregal→austro→cierzo)
--grad-juancode linear-gradient(120deg, #06B6D4 0%, #D946EF 55%, #8B5CF6 100%)
Display: Plus Jakarta Sans 600/700/800 · Serif acento: Instrument Serif itálica · Cuerpo: Manrope 500/600/700
```

Reglas de diseño que NO se rompen:
1. **Nada de fondos negros/oscuros.** Base crema.
2. **Cada torre es su propia sección** con su color pleno. Los emprendedores NO se mezclan salvo en la vitrina.
3. **Vitrina (carrusel)**: mezcla las 4 torres (intercaladas), solo destacados; autoplay 4.5 s, pausa al hover/foco, botones circulares, dot activo del color de la torre.
4. **Itálica serif** solo en palabras clave de títulos: *viento(s)*, *cada viento*, *el terminalito*, *próxima feria*, *todos*… (clase `.serif`).
5. **JuanCode** es la ÚNICA sección con degradado eléctrico fuerte.
6. "Con el respaldo de": 3 cards; la destacada (Alcaldía) más grande con acento Cierzo; comunitario → Mistral; cultural → Austro.
7. Botón flotante WhatsApp `#25D366` en todas las páginas públicas (en el panel se oculta para no tapar la barra de acciones).
8. Footer: izq. "© 2026 Feria 4 Vientos · Con el respaldo de la Alcaldía Local", der. "Sitio web hecho con amor por JuanCode" con gradiente JuanCode en el texto.
9. Logo = molinete de 4 aspas (`src/components/Molinete.astro`, `public/favicon.svg`).

## Stack y arquitectura

- **Astro 5** (`output: 'server'`) + **@astrojs/cloudflare 12** sobre **Cloudflare Pages**.
- **Tailwind v4** vía `@tailwindcss/vite`; la config JS se carga con `@config` en `global.css`. La mayoría del estilo es CSS con scope en cada componente (portado de los mockups).
- **D1** (binding `DB`) guarda emprendedores, torres, patrocinadores y fechas. **R2** (binding `MEDIA`) guarda fotos y logos, servidos por `/media/...`.
- **Content collections** (`src/content/**`, esquema en `src/content.config.ts`) = **contenido semilla** versionado. En el primer request, `asegurarDb()` crea el esquema y, si la tabla `meta` no tiene `semilla`, copia las collections a D1. Después, la verdad vive en D1.
- En `npm run dev`, `platformProxy` de wrangler crea D1/R2 locales en `.wrangler/state/`. Borrar esa carpeta = reiniciar la base local desde la semilla.
- **Por qué no Decap CMS**: Decap escribe en git y exige rebuild por cada guardado; no permite auto-save, tinte por torre ni preview en vivo. Se hizo un panel custom que replica `panel-registro.html` 1:1. Por eso no existe `public/admin/`.
- **Por qué no Zero Trust**: decisión del cliente (2026-09-23). El panel se protege con un único usuario/contraseña del comité (`ADMIN_USER`/`ADMIN_PASSWORD`). Los vecinos NO tienen login: le mandan sus datos al comité por WhatsApp y el comité los carga.

```
src/
├── content.config.ts          esquemas de las 4 colecciones
├── content/{emprendedores,torres,patrocinadores,fechas}/   semilla
├── lib/
│   ├── constantes.ts          torres base, categorías, límites, iconos, tipos (se usa también en el navegador)
│   ├── db.ts                  esquema D1, siembra, consultas, vistas (resumenPanel, filaComite)
│   ├── validacion.ts          saneo de TODO input del panel (sanearDatos, validarPublicacion)
│   ├── auth.ts                usuario/contraseña de env + cookie de sesión firmada (HMAC)
│   ├── imagenes.ts            subida a R2 con verificación de bytes mágicos
│   ├── fechas.ts · sitio.ts · api.ts
├── middleware.ts              init D1, sesión, protección de /admin y /api/panel|comite (redirige a /admin/login)
├── pages/
│   ├── index.astro            landing (SSR)
│   ├── admin/login.astro      login del comité
│   ├── admin/index.astro      editor de un emprendimiento (?slug=)  (+ src/scripts/panel.ts)
│   ├── admin/comite.astro     lista del comité  (+ src/scripts/comite.ts)
│   ├── api/login.ts · api/logout.ts
│   ├── api/panel/{borrador,publicar,fotos}.ts
│   ├── api/comite/{emprendedores,contenido,logo,export.csv}.ts
│   └── media/[...key].ts      sirve R2
├── components/                landing + PanelTopbar/PanelSinAcceso/DetalleModal/Molinete
└── styles/{global,panel}.css
```

## Modelo de datos (D1)

- `emprendedores(slug, owner_email, estado, motivo, borrador JSON, publicado JSON, borrador_at, publicado_at, creado_at)`
  - `estado`: `aprobado` (visible) | `rechazado` (= **oculto** por el comité con el botón Ocultar) | `pendiente` (heredado, ya no se genera). Publicar siempre deja `aprobado`. `owner_email` y `motivo` quedaron sin uso.
  - `borrador` = lo que se edita en el panel (auto-save). `publicado` = copia al darle "Publicar cambios".
  - **Aparece en la landing** si `estado='aprobado'` AND `publicado` no es null AND `publicado.publicado = true`.
  - Estado visible calculado (`estadoVisible`): publicado · oculto · pendiente · rechazado · borrador.
- La tabla `usuarios` puede existir en D1 (versión con Zero Trust) pero ya no se usa.
- `contenido(coleccion, id, data JSON)` para torres, patrocinadores y fechas.
- `meta(clave, valor)` — `semilla` marca que ya se sembró.

Campos de un emprendimiento (`DatosEmprendimiento` en `constantes.ts`): nombre_emprendimiento, nombre_vecino, apartamento, torre, categoria, descripcion_corta (≤160), descripcion_larga, foto_principal, galeria (≤5 extra), whatsapp (10 dígitos, sin +57), instagram, tiktok, facebook, destacado, publicado, recibir_avisos, emoji_placeholder.

## Cómo se agrupan por torre en la landing

`index.astro` → `listarPublicos()` → `porTorre[t.id] = emprendedores.filter(e => e.torre === t.id)` → un `<TorreSection>` por torre en el orden de `torres.orden`. La torre sale del campo `torre` del emprendimiento. Torre sin emprendedores muestra una card "esperando su primer emprendimiento". La vitrina usa solo `destacado` (si no hay ninguno, todos).

## Editor de emprendimiento (`/admin?slug=<slug>`)

- 5 vistas en el sidebar (hash en la URL): Mi emprendimiento (5 cards), Fotos, Redes sociales, Publicación, Configuración.
- Al elegir torre, `aplicarTorre()` pone `body[data-torre]` y las variables `--torre/--torre-claro/--torre-medio` (con los colores editables de D1): botón primario, focus rings, sidebar activo, avatar, pasos, preview, fotos… todo cambia.
- Vista previa en vivo, chip de usuario con iniciales, contador de fotos, pasos con ✓ cuando están completos.
- Fotos: hasta 6 (principal + 5), JPG/PNG/WEBP ≤5 MB; el navegador las reduce a 1600 px y re-codifica a WEBP antes de subir; reorden con drag & drop o botones ← → ★ (táctil/teclado); soltar archivos sobre la grilla sube.
- **Auto-save cada 30 s** solo como borrador. "Publicar cambios" valida (cliente y servidor) y publica.
- `/admin` sin `?slug=` redirige a `/admin/comite`. "+ Nuevo emprendimiento" crea uno vacío (ya aprobado) y abre su editor.

## Autenticación

- Un solo usuario: el comité. Credenciales en las variables `ADMIN_USER` y `ADMIN_PASSWORD` (secrets de Cloudflare Pages; nunca en `wrangler.jsonc`). Opcional `SESSION_SECRET`.
- `/api/login` compara en tiempo constante y deja la cookie `f4v_sesion` = `exp.firmaHMAC` (7 días, HttpOnly, Secure en https, SameSite=Lax). La llave HMAC se deriva de usuario+contraseña+SESSION_SECRET: cambiar la contraseña invalida todas las sesiones.
- El middleware protege `/admin/*` (menos `/admin/login`), `/api/panel/*` y `/api/comite/*`: páginas → redirect a `/admin/login?next=`, APIs → 401. `next` solo acepta rutas `/admin…`.
- Sin variables en producción, el login muestra "Falta configurar el acceso" y nadie entra.
- En `npm run dev` sin `.dev.vars`: usuario `comite`, contraseña `feria4vientos`.
- No hay rate limiting real: solo 800 ms de espera por intento fallido. Usar una contraseña larga.

## Tareas frecuentes

**Agregar un vecino**: el vecino manda datos y fotos por WhatsApp → `/admin/comite` → "+ Nuevo emprendimiento" (torre, apto) → llenar los 5 pasos → "Publicar cambios" → sale al instante en su torre. "Ocultar" lo saca de la landing sin borrarlo.

**Cambiar usuario/contraseña**: Cloudflare Pages → Settings → Variables and Secrets → `ADMIN_USER`/`ADMIN_PASSWORD` → redeploy.

**Agregar un emprendedor de semilla (en código)**: crear `src/content/emprendedores/<slug>.md` con el frontmatter del esquema. Ojo: la semilla solo se copia a D1 cuando la base está vacía; en una base ya sembrada, créalo desde el comité ("+ Nuevo emprendimiento").

**Agregar/editar una torre**: los textos y colores de las 4 torres se editan en `/admin/comite#torres`. Agregar una QUINTA torre requiere código: añadir el id a `TORRE_IDS` y `TORRES_BASE` en `src/lib/constantes.ts`, el `.md` en `src/content/torres/`, los tokens `--<torre>`, `-claro`, `-medio` en `global.css`, el modificador `body.panel[data-torre='<id>']` en `panel.css`, el color en `tailwind.config.mjs`, e insertar la fila en `contenido` (o re-sembrar en local).

**Cambiar WhatsApp/Instagram del comité o link de JuanCode**: `src/lib/sitio.ts`.

**Reiniciar la base local**: parar el dev server y borrar `.wrangler/`.

## Convenciones

- Código, nombres y textos en español. Comentarios cortos, solo el "por qué".
- Todo input del navegador pasa por `sanearDatos`/`texto`/`urlFoto`. Las fotos solo pueden ser `/media/...` o `/logos/...`.
- En scripts del navegador, nunca `innerHTML` con datos de usuario (usar `textContent` o el helper `h()` de `comite.ts`).
- En `.astro`: nunca auto-cerrar `<select />` ni `<textarea />` (rompe el parser HTML).
- Los tipos de Cloudflare se importan como módulo en `src/env.d.ts` (no en `tsconfig.types`) para no chocar con los del DOM.
- Verificar con `npx astro check` (0 errores) y `npm run build` antes de entregar.
