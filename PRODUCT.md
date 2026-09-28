# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: residents (vecinos) of the Conjuntos Residenciales 4 Vientos in Bogotá (Fontibón) who need something a neighbor sells or does: food, pastries, nails, plumbing, crochet, pet care. They usually arrive from a link shared in a WhatsApp chat (the per-business link `/e/<slug>`) or open the site to search the directory, and their job is to find the right neighbor fast and contact them on WhatsApp. Mostly on phones.

Secondary: vecinos checking when and where the next feria is; neighbors who want to list their own business (register, get approved by the committee); the committee (comité) that moderates everything from the panel.

## Product Purpose

A neighborhood directory and fair site for four residential complexes. It makes every approved neighbor business findable (search, categories, best rated, new ones) and reachable in one tap, and it promotes the physical fair held in "el terminalito" when the committee activates one. Success: a neighbor finds and messages another neighbor within seconds; businesses get traffic from their shared link.

## Positioning

It is not a marketplace or a city directory: every listing is a verified neighbor from one of the four conjuntos (Mistral, Gregal, Austro, Cierzo), approved by the neighbors' own committee, reachable directly on WhatsApp, with no intermediaries or payments.

## Operating Context

- Four conjuntos = four "vientos" (winds): Mistral (norte), Gregal (nororiente), Austro (sur), Cierzo (noroccidente). Code calls them `torre`; all visible text says "conjunto".
- "El terminalito": an old auxiliary gatehouse the assembly recovered; the fair happens there.
- Fair visibility is time-boxed: only shows when the committee activates a date window.
- Traffic comes largely from WhatsApp chats; link previews (Open Graph) matter.
- Spanish (es-CO) everywhere.

## Capabilities and Constraints

- Astro 5 SSR on Cloudflare Pages, D1 + R2. Public landing is `src/components/Landing.astro` (used by `/` and `/e/<slug>`).
- Directory: search without accents, category chips (committee-managed categories), "solo en la feria" filter, best-rated strip (min 2 ratings), "Recién llegados" strip and "Nuevo" badge for 5 days.
- Each business: name, neighbor, conjunto (+ optional apto), category, short and long description, up to 3 photos, WhatsApp, Instagram/TikTok/Facebook, optional website.
- Detail modal: photos, description, social links, share link, star ratings (anyone, one per browser) with comments, private report with photo evidence.
- Fair sections (index, carousel, per-conjunto sections) render only while a fair is active.
- Sponsors: Alcaldía Local de Fontibón (official), Consejo/Junta (community), Casa de Cultura Local (cultural). JuanCode sponsors only the website.
- Floating WhatsApp button to the committee on public pages.
- The committee/vecino panels are out of scope for the landing redesign.

## Brand Commitments

- The molinete (4-blade pinwheel) logo with the name "4 Vientos" is binding (`src/components/Molinete.astro`, `public/favicon.svg`).
- Name of the event: "Feria 4 Vientos". Footer credits the Alcaldía and "Sitio web hecho con amor por JuanCode".
- Everything else visual (per-conjunto colors, fonts, cream base, JuanCode gradient) is open for redesign (decision 2026-09-28).

## Evidence on Hand

- Real photos uploaded by businesses (R2, `/media/emprendedores/...`); currently 7 published businesses.
- Alcaldía Local de Fontibón logo: `public/logos/alcaldia-fontibon.png`.
- No photos of the terminalito, the conjuntos, or past fairs. Do not fabricate them, nor testimonials, counts, or claims.

## Product Principles

1. Find a neighbor in seconds: the directory search is the first job of the page.
2. One tap to WhatsApp: contact is direct, never behind forms.
3. Neighbors, verified: everything shown is approved by the neighbors' committee.
4. Give newcomers a chance: new businesses get visibility.
5. The fair is an event, not the permanent frame: it appears only when active.

## Accessibility & Inclusion

Mixed-age residents on phones, often older neighbors: legible sizes, strong contrast, large tap targets, no reliance on hover.
