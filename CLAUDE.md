# CLAUDE.md — Feria 4 Vientos

Sitio + panel de la feria de emprendimientos de los **Conjuntos Residenciales 4 Vientos** (Bogotá).
Landing pública: arriba los emprendimientos que están **en la feria** (vitrina + sección por conjunto) y abajo un **directorio** con todos (buscador + categorías). Registro de vecinos en `/registro`, panel del vecino en `/admin` y cola de moderación del comité en `/admin/comite`. Solo lo aprobado (`approved`) sale en la landing, al instante (sin caché).
Todo en español (es-CO). Sitio web patrocinado por **JuanCode** (solo el sitio, no el evento).

---

## Contexto del negocio

- **4 conjuntos = 4 vientos**: Mistral, Gregal, Austro y Cierzo NO son torres, son cuatro conjuntos residenciales; juntos forman "4 Vientos". En el código el campo/colección se sigue llamando `torre`/`torres` (no se renombró para no migrar datos), pero TODO texto visible dice "conjunto".
  | Conjunto | Rumbo | Color | Claro | Emoji | Tagline |
  |---|---|---|---|---|---|
  | Mistral | Norte | `#1E9C8C` | `#BFF0E6` | ❄️ | Manos que crean con calma… |
  | Gregal | Nororiente | `#E8641B` | `#FFE1C7` | 🌅 | El primer aire de la mañana… |
  | Austro | Sur | `#E3287A` | `#FFD3E6` | 🌸 | Sabor que se comparte… |
  | Cierzo | Noroccidente | `#7B3FE4` | `#E1D4FF` | ⚡ | Oficios que resuelven… |
- **El terminalito**: kiosco/portería auxiliar cerrado por años; la asamblea lo recuperó y ahí se hace la feria. Es el corazón narrativo (sección Historia).
- **Patrocinadores**: Alcaldía Local de Fontibón (oficial: espacio y logística, logo real en `public/logos/`), Consejo del Conjunto / Junta directiva (gestión interna), Casa de Cultura Local (aliado cultural). **JuanCode** solo patrocina el sitio web → sección propia + footer "Sitio web hecho con amor por JuanCode".
- Única fecha cargada: sábado 26 de septiembre de 2026, 9 a.m. a 1 p.m. (vacunación de mascotas y niños, deporte). Debajo de las fechas siempre sale "Pronto vendrán más ferias". Nuevas fechas se agregan en `/admin/comite#fechas`.

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
2. **Cada conjunto (viento) es su propia sección** con su color pleno y solo muestra los que están en la feria. Los emprendedores NO se mezclan salvo en la vitrina y en el directorio (ahí se busca, no se recorre por viento).
3. **Vitrina = "Feria · <fecha>"** (carrusel): título con la fecha de la próxima feria; TODOS los que están en la feria, **uno a uno** (una diapositiva grande por emprendimiento con foto, descripción corta + larga, redes y "Ver fotos y contacto"), 4 conjuntos intercalados; autoplay 7 s, pausa al hover/foco, botones circulares, dot activo del color de la torre.
4. **Itálica serif** solo en palabras clave de títulos: *viento(s)*, *cada viento*, *el terminalito*, *próxima feria*, *todos*… (clase `.serif`).
5. **JuanCode** es la ÚNICA sección con degradado eléctrico fuerte.
6. "Con el respaldo de": 3 cards; la destacada (Alcaldía) más grande con acento Cierzo; comunitario → Mistral; cultural → Austro.
7. Botón flotante WhatsApp `#25D366` en todas las páginas públicas (en el panel se oculta para no tapar la barra de acciones).
8. Footer: izq. "© 2026 Feria 4 Vientos · Con el respaldo de la Alcaldía Local", der. "Sitio web hecho con amor por JuanCode" con gradiente JuanCode en el texto.
9. Logo = molinete de 4 aspas (`src/components/Molinete.astro`, `public/favicon.svg`).
10. **Directorio** (`Directorio.astro`, `#directorio`): todos los aprobados, orden alfabético, buscador sin tildes, chips por categoría con conteo y chip "🎪 Solo en la feria". Las cards de quienes están en la feria llevan la etiqueta 🎪.
11. **Logo** = molinete + "4 Vientos" (sin "Feria") en menú, footer, hero y panel. El nombre del evento en textos sigue siendo "Feria 4 Vientos".

## Stack y arquitectura

- **Astro 5** (`output: 'server'`) + **@astrojs/cloudflare 12** sobre **Cloudflare Pages**.
- **Tailwind v4** vía `@tailwindcss/vite`; la config JS se carga con `@config` en `global.css`. La mayoría del estilo es CSS con scope en cada componente (portado de los mockups).
- **D1** (binding `DB`) guarda emprendedores, torres, patrocinadores y fechas. **R2** (binding `MEDIA`) guarda fotos y logos, servidos por `/media/...`.
- **Content collections** (`src/content/**`, esquema en `src/content.config.ts`) = **contenido semilla** versionado. En el primer request, `asegurarDb()` crea el esquema y, si la tabla `meta` no tiene `semilla`, copia las collections a D1. Después, la verdad vive en D1.
- En `npm run dev`, `platformProxy` de wrangler crea D1/R2 locales en `.wrangler/state/`. Borrar esa carpeta = reiniciar la base local desde la semilla.
- **Por qué no Decap CMS**: Decap escribe en git y exige rebuild por cada guardado; no permite auto-save, tinte por torre ni preview en vivo. Se hizo un panel custom que replica `panel-registro.html` 1:1. Por eso no existe `public/admin/`.
- **Por qué no Zero Trust**: decisión del cliente (2026-09-23). Se usa usuario/contraseña propios.
- **Moderación con cuentas de vecino** (2026-09-25, rama `feat/moderacion`): revierte el "vecinos sin login" del 23-sep. El vecino se registra en `/registro`, el comité activa la cuenta, el vecino llena UNA vez su formulario y lo manda a revisión; solo lo aprobado sale en la landing. El usuario del comité (`ADMIN_USER`/`ADMIN_PASSWORD`) sigue existiendo como llave maestra.

```
src/
├── content.config.ts          esquemas de las 4 colecciones (emprendedores tiene `estado`, default approved)
├── content/{emprendedores,torres,patrocinadores,fechas}/   semilla
├── lib/
│   ├── constantes.ts          torres base, categorías, límites, iconos, ESTADOS, tipos (se usa también en el navegador)
│   ├── db.ts                  esquema D1, migrar() v1→v2, siembra, consultas, cuentas, notificaciones, vistas
│   ├── validacion.ts          saneo de TODO input (sanearDatos, sanearDatosPara, validarPublicacion)
│   ├── auth.ts                comité por env + cuentas (PBKDF2) + ADMIN_EMAILS + cookie de sesión firmada (HMAC)
│   ├── avisos.ts              textos de notificaciones; punto único para automatizar WhatsApp (`avisar()`)
│   ├── api.ts                 json/error, registroPermitido (propiedad), puedeEditar (estado)
│   ├── imagenes.ts            subida a R2 con verificación de bytes mágicos
│   ├── fechas.ts · sitio.ts
├── middleware.ts              init D1, sesión, rol: /admin y /api/panel = con sesión; /admin/comite y /api/comite = solo admin
├── pages/
│   ├── index.astro            landing (SSR, solo `approved`): feria arriba + Directorio.astro abajo
│   ├── registro/{index,gracias}.astro   registro público de vecinos
│   ├── admin/login.astro      login (correo o usuario del comité)
│   ├── admin/index.astro      editor: vecino → el suyo; admin → ?slug=  (+ src/scripts/panel.ts)
│   ├── admin/comite/index.astro   cola de revisión, emprendedores, cuentas, notificaciones, contenido (+ src/scripts/comite.ts)
│   ├── admin/comite/{cuentas,notificaciones}.astro   atajos → #cuentas / #notificaciones
│   ├── api/login.ts · api/logout.ts · api/registro.ts
│   ├── api/panel/{borrador,enviar,publicar,fotos}.ts
│   ├── api/comite/{emprendedores,cuentas,notificaciones,contenido,logo,export.csv}.ts
│   └── media/[...key].ts      sirve R2
├── components/                landing + PanelTopbar/PanelSinAcceso/DetalleModal/Molinete
└── styles/{global,panel}.css
```

## Ciclo de vida de un emprendimiento

```
            (vecino llena)            (vecino: "Enviar a revisión")
  draft ────────────────────────────► pending_review ───────────┬──► approved ──► (landing)
    ▲                                        ▲                  │
    │                                        │ "Reenviar"       ├──► rejected  (bloqueado, con motivo_rechazo)
    │                                        │                  │
    └─ "+ Nuevo" del comité     changes_requested ◄──────────────┘   (editable, con nota_cambios)
                                  (vecino corrige)
  El comité puede, desde cualquier estado: aprobar ("Publicar cambios" en el editor = aprobar),
  rechazar, pedir cambios, ocultar/mostrar (toggle `publicado`, sigue approved), marcar
  "en la feria" (toggle `en_feria`) o eliminar.
```

| Estado | Formulario del vecino | Botón principal | Banner | Auto-save | Landing |
|---|---|---|---|---|---|
| `draft` | Editable | "Enviar a revisión" | — | Sí | No |
| `pending_review` | Solo lectura | "En revisión · No editable" (gris) | Amarillo + "Avisar al comité" | No | No |
| `approved` | Solo lectura | "Aprobado y publicado" (verde) | Verde + WhatsApp del comité | No | **Sí** (si `publicado.publicado`) |
| `rejected` | Solo lectura | "Rechazado" (rojo) | Rojo con `motivo_rechazo` + WhatsApp | No | No |
| `changes_requested` | Editable | "Reenviar a revisión" | Naranja con `nota_cambios` | Sí | No |

El bloqueo se hace en el servidor (`puedeEditar` → 409 en borrador/fotos, `enviarARevision` con `WHERE estado IN (...)`), no solo en la UI. El vecino nunca ve "Eliminar" ni puede tocar `destacado`/`publicado`/`en_feria` (`sanearDatosPara`).

## Roles y permisos

| Acción | Vecino | Admin |
|---|---|---|
| Registrarse en `/registro` | ✓ (queda `pending_activation`) | — |
| Ver/editar su emprendimiento | Solo el suyo, solo en draft / changes_requested | Cualquiera, en cualquier estado |
| Enviar a revisión (`/api/panel/enviar`) | ✓ | — |
| Publicar directo (`/api/panel/publicar`) | ✗ 403 | ✓ (= aprobar) |
| Aprobar / rechazar / pedir cambios | ✗ | ✓ |
| Destacar, ocultar, marcar "en la feria", eliminar | ✗ | ✓ |
| Activar/rechazar cuentas, notificaciones, torres, patrocinadores, fechas, CSV | ✗ | ✓ |

**Quién es admin**: el usuario del comité (`ADMIN_USER`) y cualquier cuenta activa cuyo correo esté en `ADMIN_EMAILS`. El rol se calcula en cada request (`rolDeEmail`), así que quitar un correo de la variable le quita el acceso tras el redeploy. Una cuenta con correo de `ADMIN_EMAILS` igual nace `pending_activation` y solo otro admin puede activarla (el comité ve una etiqueta ADMIN y confirma): nadie se vuelve admin solo por registrarse con ese correo.

## Modelo de datos (D1)

- `emprendedores(slug, owner_email, estado, motivo_rechazo, nota_cambios, borrador JSON, publicado JSON, borrador_at, publicado_at, enviado_at, revisado_at, revisado_por, creado_at)`
  - `estado`: `draft | pending_review | approved | rejected | changes_requested` (ver ciclo de vida).
  - `owner_email` = correo de la cuenta del vecino (null si lo creó el comité o es semilla).
  - `borrador` = lo que se edita (auto-save). `publicado` = copia al aprobar.
  - `revisado_por` = correo del admin, o el `ADMIN_USER` si fue el usuario del comité.
  - **Aparece en la landing** (`listarPublicos`) si `estado='approved'` AND `publicado` no es null AND `publicado.publicado = true`. No hay sitemap, RSS ni JSON-LD: la única salida pública es esa función.
  - Estado visible (`estadoVisible`): el estado, o `oculto` si está approved con `publicado.publicado=false`.
  - En producción la tabla puede conservar la columna vieja `motivo` (sin uso).
- **Migración** (`migrar()` en `db.ts`, idempotente, corre al arrancar cada isolate): agrega columnas faltantes y traduce estados v1: `aprobado`→`approved` (sin publicado → `draft`), `rechazado` (= Ocultar) → `approved` con `publicado=false`, `pendiente`→`pending_review`. Además pone `en_feria=true` a los registros que no tenían el campo (antes todo era de la feria).
- `cuentas(email, nombre, torre, apartamento, whatsapp, clave PBKDF2, estado pending_activation|active|rejected, motivo, creado_at, revisado_at, revisado_por)`. Se llama `cuentas` porque en producción puede quedar la tabla `usuarios` de la versión Zero Trust (sin uso).
- `notificaciones(id, creado_at, para admin|vecino, tipo, titulo, mensaje, whatsapp, email, slug, enviada)`.
- `contenido(coleccion, id, data JSON)` para torres, patrocinadores y fechas.
- `meta(clave, valor)` — `semilla` marca que ya se sembró.

Campos de un emprendimiento (`DatosEmprendimiento` en `constantes.ts`): nombre_emprendimiento, nombre_vecino, apartamento ("Torre y apto", **opcional**: hay vecinos que solo quieren decir el conjunto; si está vacío no se muestra "Apto"), torre (= conjunto, obligatorio), categoria, descripcion_corta (≤160), descripcion_larga, foto_principal, galeria (≤2 extra: 3 fotos en total), whatsapp (10 dígitos, sin +57), instagram, tiktok, facebook, pagina_web (URL https, opcional: si existe, la card y el modal muestran un botón grande "Entra aquí"), destacado, publicado, en_feria (participa en la feria; default false, semilla true; solo comité), recibir_avisos, emoji_placeholder.

## Cómo se agrupan por torre en la landing

`index.astro` → `listarPublicos()` (solo approved) → `enFeria = emprendedores.filter(e => e.en_feria)` → `porTorre[t.id] = enFeria.filter(e => e.torre === t.id)` → un `<TorreSection>` por torre en el orden de `torres.orden` (el conteo del índice también es "en la feria"). Conjunto sin nadie en la feria muestra una card con link a `/registro` y al directorio. La vitrina ("Feria · <fecha>") muestra a todos los de la feria uno a uno, destacados primero (si nadie está en la feria, a todos). Después, `<Directorio>` recibe TODOS los aprobados.

## Editor de emprendimiento (`/admin`)

- Vecino: `/admin` abre SU emprendimiento (la primera vez se crea vacío en `draft` con los datos de su cuenta); `?slug=` se ignora. Admin: `/admin?slug=<slug>`; sin slug → `/admin/comite`.
- 5 vistas en el sidebar (hash en la URL): Mi emprendimiento (5 cards), Fotos, Redes sociales, Publicación, Configuración. Los toggles "Publicar en la landing", "Está en la feria 🎪" y "Destacar" solo los ve el admin.
- Al elegir torre, `aplicarTorre()` pone `body[data-torre]` y las variables `--torre/--torre-claro/--torre-medio`.
- Solo lectura: `body.solo-lectura` + `disabled` en inputs/chips/toggles/fotos (opacity .6, cursor not-allowed).
- Fotos: hasta 3 (principal + 2, `LIMITES.galeria`), JPG/PNG/WEBP. Registros viejos con más fotos: la landing y el editor solo usan las 3 primeras. El navegador acepta originales de hasta 25 MB, los reduce a 1200 px y re-codifica a WEBP (calidad 0.8; si aún pesa, baja calidad y tamaño hasta 800 px). El servidor rechaza todo lo que pase de **800 KB** (`LIMITES.fotoBytes`); logos de patrocinadores hasta 1 MB (`LIMITES.logoBytes`). Reorden con drag & drop o ← → ★.
- **Auto-save cada 30 s** solo como borrador y solo en draft / changes_requested.

## Cola de moderación (`/admin/comite`)

- Arriba "Pendientes de revisión" con contador: card por solicitud con todos los datos, TODAS las fotos, conjunto/apto, fecha de envío y ✓ Aprobar · ✕ Rechazar (modal con motivo) · ✎ Pedir cambios (modal con nota).
- Debajo "Todos los emprendedores" con filtros por estado, conjunto, categoría y feria; botón "🎪 En la feria / ＋ Feria" (cambia al instante, sin revisión), estrella (vitrina), Ocultar/Mostrar, Editar, Eliminar.
- Pestañas Cuentas (activar / rechazar / desactivar) y Notificaciones.

## Notificaciones

Todavía **no hay envío automático**. Cada evento (envío a revisión, aprobación, rechazo, cambios, cuenta nueva/activada/rechazada) crea una fila en `notificaciones` (textos en `src/lib/avisos.ts`). El comité ve un toast con "Avisar por WhatsApp" y la bandeja `/admin/comite#notificaciones` con "Abrir WhatsApp" (wa.me con el texto listo), "Correo" (mailto), "Copiar" y "Marcar enviada". Para automatizar (Twilio, Meta Cloud API o webhook a n8n), hacerlo dentro de `avisar()`.

## Autenticación

- Comité: `ADMIN_USER` / `ADMIN_PASSWORD` (secrets de Cloudflare Pages; nunca en `wrangler.jsonc`). Opcional `SESSION_SECRET`.
- Vecinos: correo + contraseña (≥8) creados en `/registro`, guardados con PBKDF2-SHA256 100k + sal. Solo entran con la cuenta `active`.
- `ADMIN_EMAILS`: correos (separados por coma) con rol admin.
- Cookie `f4v_sesion` = `exp.sujeto.firmaHMAC` (7 días, HttpOnly, Secure en https, SameSite=Lax); sujeto = `comite` o `c:<correo>`. La llave HMAC sale de ADMIN_USER+ADMIN_PASSWORD+SESSION_SECRET: cambiar la contraseña del comité cierra TODAS las sesiones (también las de vecinos). El middleware relee la cuenta en cada request: desactivarla la saca al instante.
- Middleware: `/admin/*` (menos login), `/api/panel/*` → requiere sesión; `/admin/comite*`, `/api/comite/*` → solo admin (vecino: redirect a `/admin` o 403). `next` solo acepta rutas `/admin…` (y nunca `/admin/comite` para vecinos).
- Sin variables en producción, el login muestra "Falta configurar el acceso" y nadie entra (tampoco vecinos: la firma de sesión depende de esas variables).
- En `npm run dev` sin `.dev.vars`: usuario `comite`, contraseña `feria4vientos`.
- No hay rate limiting real: 800 ms por intento fallido y un campo trampa en `/registro`. Usar contraseñas largas.
- Olvido de contraseña de vecino: no hay flujo; el comité rechaza la cuenta y el vecino se registra con otro correo, o se borra la fila en D1.

## Tareas frecuentes

**Flujo normal de un vecino**: se registra en `/registro` → `/admin/comite#cuentas` → "✓ Activar" → "Abrir WhatsApp" en Notificaciones → el vecino entra con su correo, llena los 5 pasos y "Enviar a revisión" → aparece en "Pendientes de revisión" → Aprobar / Rechazar / Pedir cambios → mandar el aviso desde el toast o Notificaciones.

**Meter o sacar a alguien de la feria**: `/admin/comite` → botón "🎪 En la feria" de su fila (o el toggle en su editor). Sale / deja de salir arriba al instante; siempre sigue en el directorio mientras esté aprobado.

**Cargar un vecino a mano (sin cuenta)**: `/admin/comite` → "+ Nuevo emprendimiento" → llenar → "Publicar cambios" (queda approved). "Ocultar" lo saca de la landing sin borrarlo.

**Agregar un correo a ADMIN_EMAILS**:
- Producción: `npx wrangler pages secret put ADMIN_EMAILS --project-name feria-4-vientos` → pegar `correo1@x.com,correo2@y.com` (la lista completa: reemplaza el valor) → redeploy. Luego esa persona se registra en `/registro` y el comité activa la cuenta (sale con etiqueta ADMIN).
- Local: `.dev.vars` con `ADMIN_EMAILS=correo@x.com` y reiniciar `npm run dev`.

**Cambiar usuario/contraseña del comité**: Cloudflare Pages → Settings → Variables and Secrets → `ADMIN_USER`/`ADMIN_PASSWORD` → redeploy.

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
