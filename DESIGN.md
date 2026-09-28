# Design: "El citófono de portería"

Visual system of the public landing (`/` and `/e/<slug>`), option two (branch `feat/rediseno-2`; option one, the flyer wall, lives on `feat/rediseno`). The committee panel and `/registro` keep the older tokens in `src/styles/global.css`; everything here is scoped under `body.citofono` (`src/styles/citofono.css`, enabled with `<Layout citofono>`).

## Idea
The directory is the intercom panel at the conjunto's entrance. The LCD is the search, the rubber keypad is the category filter, every business is a backlit name plate with a round green call button that opens WhatsApp. New businesses are the brightest plates.

## Color (Restrained: steel neutrals + one call color)
| Token | Hex | Role |
|---|---|---|
| `--pared` | #DCE1E3 | painted portería wall (page ground) |
| `--acero-claro` / `--acero` | #DDE2E5 / #BCC3C8 | brushed steel plates |
| `--acero-borde` | #8C949A | plate edge, bezels |
| `--grafito` | #23272B | engraving, text, nav, footer, keys |
| `--caucho` | #2E3338 | rubber keys |
| `--luz` / `--luz-fuerte` | #FFF3D1 / #FFE9A8 | backlit name labels; pressed key; "Nuevo" plates glow |
| `--lcd-fondo` / `--lcd` | #16211A / #B8E986 | LCD search, counters, dates |
| `--llamar` | #1FA35B | the call button (WhatsApp) only |
| `--led-*` | #1E9C8C Mistral, #E8641B Gregal, #E3287A Austro, #7B3FE4 Cierzo | small LED next to the conjunto name, never alone |

## Type
- Plates and headings: Barlow Condensed 700 to 800, uppercase, tracking .015 to .08em, engraved (`.grabado`: 1px light text-shadow).
- Reading: Barlow 400 to 600.
- LCD: VT323 (search, counts with fixed zero-padded digits, dates, "Nuevo").

## Shape
Plates 10px (`--r-placa`), keys and buttons 8px (`--r-tecla`), name labels 4px (`--r-plaquita`), call button and LEDs round. `.tornillos` puts a screw in each corner of a plate.

## Components
- `.placa` brushed steel plate; `.lcd` screen with bezel; `.tecla` rubber key (`aria-pressed` = lit); `.boton` / `.boton-tinta` steel keys; `.llamar` round green call button with steel bezel; `.led`; `.rotulo` small engraved label.
- Business (`EmprendedorCard`): photo in a small screen, backlit name label (name + LED + neighbor + conjunto), category and marks ("Nuevo" in LCD, "En la feria"), 3-line description, stars, socials, "Ficha", and the call button with its "Llamar" label.
- Hero: engraved headline, LCD search (`#dirBuscar`), category keypad (`button[data-filtro-cat]`, "Solo en la feria"), speaker grille, molinete, LCD counter and next fair.
- Detail (`DetalleModal`): video-intercom screen with the photo, steel info plate, ratings and report on a printed card.

## Motion
- `.encender`: the panel powers on once at load.
- Signature: pressing call makes the plate flash like a ringing intercom (`.sonando`) while WhatsApp opens; keys depress 3px.
- LCD prompt blinks. All motion off under `prefers-reduced-motion`.

## Browser surfaces
Selection green LCD on dark, caret and accent graphite, focus = 3px graphite outline plus a warm backlight halo.
