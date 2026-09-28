---
version: 1
slug: "src-components-landing-astro"
primary_target: "src/components/Landing.astro"
related_targets: ["src/pages/index.astro"]
---

## Scope
Public landing (`/` and `/e/<slug>`), rendered by `src/components/Landing.astro` and its components. Mode: persuade (the visitor decides which neighbor to contact and acts). Panels (`/admin`, `/registro`) are out of scope and must keep working unchanged.

## Audience and job
Vecinos on their phones, often arriving from a WhatsApp link, looking for a neighbor who sells or does something; action = message them on WhatsApp in one tap. Secondary: see if a fair is on; register a business. Proof: real business photos, committee approval, star ratings. Constraints: molinete logo stays; no invented photos, counts or testimonials; older neighbors need legible type and big targets.

## Direction contract
THESIS: The directory is the neighborhood's flyer wall. Every business is a photocopied flyer stapled to it, with tear-off tabs that open WhatsApp. Refuses the pastel community-market page (cream, serif italics, rounded cards) and the dark tech app.
OWN-WORLD: Photocopy black #111 on fluorescent stock: poster green #D6FF3B (brand and the one contact action), fluro pink #FF3CA7 (Austro), rave orange #FF5A1F (Gregal), faded lilac #D2C4FF (Cierzo), sunfade mint #B7E8D6 (Mistral), worn paper #F2EEDC as wall. Torn SVG-masked edges, staples, perforation holes, photocopy grain. Archivo at condensed width 900 in caps for display, Archivo for reading text, Courier Prime for stamped labels, numbers and tabs. Conjuntos always carry their name, never color alone.
STORY: I see a wall of real neighbors, I search or pull a category strip, I tear a tab and I am on WhatsApp with them.
FIRST VIEWPORT: Left-anchored torn poster-green sheet with the headline ENCUENTRA A TU VECINO in huge condensed caps and the search field stapled into it; molinete + 4 Vientos top left; on the right a black photocopy sheet with the giant molinete and the count of neighbors; below, overlapping torn category strips (name + count) that filter the wall. Primary action: the search field.
FORM: Club wall where flyers are stapled over flyers (challenger adopted by the user, catalog posters-covers-sleeves-torn-flyer-photocopy-wall), seed 432659ec.
SIGNATURE: tearing a tab off a flyer (rotates and drops, catching on the staple) opens WhatsApp; category strips peel back when chosen. New businesses are the freshest sheet pasted crooked on top.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions
- Fair sections (index, carousel, per-conjunto) only render while a fair is active; restyle them in the same world.
