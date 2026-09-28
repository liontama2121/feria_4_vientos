# Design: "La plaza de mercado"

Visual system of the public landing (`/` and `/e/<slug>`), option three (branch `feat/rediseno-3`; option one, flyer wall, on `feat/rediseno`; option two, intercom, on `feat/rediseno-2`). The committee panel and `/registro` keep the older tokens in `src/styles/global.css`; everything here is scoped under `body.plaza` (`src/styles/plaza.css`, enabled with `<Layout plaza>`).

## Idea
The directory is the neighborhood's market plaza: every business is a stall under its own striped awning, with its real photo big and in full color, and you order by WhatsApp. Photos are never filtered or shrunk.

## Color (Full palette of fruit-stand colors)
| Token | Hex | Role |
|---|---|---|
| `--papel` | #FFFDF8 | page and stall paper |
| `--tinta` | #20183A | text, nav, footer, dark buttons |
| `--mango` / `--mango-claro` | #FFC93C / #FFE7A3 | brand: hero field, focus halo, highlights |
| `--hierbabuena` | #1E9C8C | Mistral, Historia section |
| `--lulo` | #FF8A1F | Gregal, convocatoria awning |
| `--pitahaya` | #FF3F80 | Austro, main awning, fair notice |
| `--mora` | #7B3FE4 | Cierzo, JuanCode sign |
| `--pedir` / `--pedir-oscuro` | #22B45A / #178A43 | "Pídalo por WhatsApp" only |

`[data-conjunto]` sets `--c`; the conjunto name is always printed next to its color.

## Type
- Signs and headings: Lilita One (mixed case).
- Reading: Figtree 400 to 800.
- Handwritten tags: Caveat Brush (category tags, counts, small notes).
- Voice: "usted", like a plaza vendor ("¿Qué se le ofrece, vecino?", "Pídalo por WhatsApp").

## Shape and material
- Stalls and signs 18px (`--r-puesto`), tags 10px, buttons and chips pill.
- `.toldo`: striped awning (`--t1`, `--t2`, `--ancho`) with a scalloped edge (radial-gradient mask, `--feston`).
- `.letrero`: painted sign, 4px ink border. `.etiqueta`: card tag with a punched hole. `.estallido`: starburst sticker (`public/plaza/estallido.svg` mask).
- Buttons press down 3px (bottom bevel), soft tinted shadows elsewhere.

## Components
- Hero: pink awning over a mango field, the sign "¿Qué se le ofrece, vecino?", pill search `#dirBuscar`, handwritten category tags (`button[data-filtro-cat]`), and up to 4 real business photos as tilted framed produce (`vitrina` prop from `Landing.astro`).
- Stall (`EmprendedorCard`): awning in the conjunto color, "¡Recién llegado!" starburst for new ones, big 4:3 full-color photo with its category tag, name, neighbor and conjunto, description, stars, full-width green "Pídalo por WhatsApp", "Ver fotos y más", socials.
- Detail (`DetalleModal`): big photo left, sign right, ratings on a warm card below.

## Motion
- `.abrir`: stalls open once at load (staggered).
- Hover: the stall lifts and its awning stretches; photos zoom slightly; tags straighten.
- All motion off under `prefers-reduced-motion`.

## Browser surfaces
Selection mango on ink, caret and accent pitahaya, focus = 3px ink outline plus mango halo.
