# Design: "El muro de avisos"

Visual system of the public landing (`/` and `/e/<slug>`). The committee panel and `/registro` keep the older tokens in `src/styles/global.css`; everything here is scoped under `body.muro` (`src/styles/muro.css`, enabled with `<Layout muro>`).

## Idea
The directory is the neighborhood's flyer wall. Every business is a photocopied flyer on the fluorescent card stock of its conjunto, stapled to the wall, with tear-off tabs that open WhatsApp. New businesses are the freshest sheets. Nothing is a rounded card.

## Color (Committed: fluorescent stock carries whole regions)
| Token | Hex | Role |
|---|---|---|
| `--pared` | #F2EEDC | the wall (page ground) |
| `--papel` | #FBF9F1 | fresh bond paper: inputs, secondary buttons, sponsor sheets |
| `--xerox` | #111111 | photocopy ink: all text, nav, footer, dark sheets |
| `--verde` | #D6FF3B | brand + contact only (hero sheet, WhatsApp, "Nuevo" ink). Never decoration on other actions |
| `--menta` | #B7E8D6 | Mistral stock |
| `--naranja` | #FF5A1F | Gregal stock, convocatoria |
| `--rosa` | #FF3CA7 | Austro stock, feria notices, reports |
| `--lila` | #D2C4FF | Cierzo stock, official sponsor |

`[data-conjunto="<id>"]` sets `--stock`. A conjunto is never identified by color alone: its name is always printed.

## Type
- Display: Archivo, `font-stretch: 62%`, weight 900, uppercase, line-height .88 (headlines, flyer names, buttons at 70%).
- Reading: Archivo 100% width, 450, 15.5 to 18px.
- Stamp (`.sello`): Courier Prime 700 uppercase, 12.5 to 17px, for labels, meta, numbers, tabs.
- Loaded only on muro pages (Google Fonts, `display=swap`).

## Material and shape
- Corners: always square (0 radius), everywhere, including inputs and dialogs.
- Torn edges: SVG masks `public/muro/borde-abajo.svg` / `borde-arriba.svg` via `.rasgado-abajo`, `.rasgado-arriba`, `.rasgado-ambos` (height `--borde-alto`). Masks clip box-shadow, so masked sheets sit inside `.con-sombra` (drop-shadow filter).
- `.grapa` staples, `.perforado` old staple holes, fixed photocopy grain on `body.muro::after` (pointer-events none).
- Sheets are hand-pasted: small rotations (-1.6deg to 1.6deg) that straighten on hover.
- Photos on flyers: `.fotocopia` (grayscale + contrast, multiply over the stock); full color on hover and in the detail sheet.
- Shadow: `--sombra-papel` / `--sombra-papel-alta` (offset + soft blur, tinted ink). No hard offset shadows.

## Components
- `.boton` stamped rectangle, 2px ink border; `.boton-tinta` (ink), `.boton-contacto` (verde). Min height 44 to 56px.
- Flyer (`EmprendedorCard`): staple, "Nuevo" / "En la feria" stickers, photo, condensed name, stamp meta, stars (authored SVG), "Ver ficha", socials, six tear-off WhatsApp tabs (first one is the accessible link; the rest are aria-hidden duplicates).
- Category strips (`Directorio`): overlapping torn strips as filter buttons (`aria-pressed`); the chosen one turns ink with green type and peels out.
- Detail sheet (`DetalleModal`): dialog on the conjunto stock, black media panel, ratings on bond paper, report form on rosa.

## Motion
- Entrance: `.pegar` (sheet pasted onto the wall), staggered by `--i`, `animation-fill-mode: backwards` so each sheet keeps its own rotation.
- Signature: tearing a tab (`.tirita.arrancada`) rotates and drops it; the link opens WhatsApp as normal.
- All motion is disabled under `prefers-reduced-motion`.

## Browser surfaces
Selection ink on verde, caret and accent in ink, scrollbar ink on wall, focus = 3px ink outline plus a verde halo.
