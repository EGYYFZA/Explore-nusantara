# Nusantara Explorer

## Product contract

Turn the existing dependent region filters into a visual atlas. The primary action is selecting a province, city/regency, or district. Keep the URL as the selection source of truth, including browser back/forward. Show the map, selected place, and photography together; no marketing gate.

Target viewports: **1440x900** and **390x844**, with additional checks at **375x812** and **844x390**. Center the filters above the full-width map at every viewport. Stack the three filters on mobile. Use visible labels, searchable comboboxes as the keyboard alternative to map points, and a native photo dialog with Escape and focus restoration. Map points cluster at national zoom levels to avoid overlapping labels.

Each region filter supports typing a partial name and choosing from a scrollable list. Match case-insensitively within the selected parent area; unmatched text does not become a selection. Arrow keys navigate, Enter commits, Escape or blur restores the selected name, and Tab moves to the next control. The empty-query list includes the all-regions option. Reset and parent changes clear dependent selections; URL changes update displayed values. Preserve input focus after choosing an option and keep active choices visible while navigating.

Visual direction (revised at the user's request): minimal and inspired by [Apple's website](https://www.apple.com/). White and light gray surfaces, near-black system sans-serif typography, restrained blue accents, generous spacing, and consistent rounded controls. No navbar, promotional headlines, region stories, suggestion chips, or promotional footer. Keep only useful control labels, location names, status/error feedback, photo captions, credits, and dataset scope. The map remains the central object. Reuse React Router and Lucide from this project.

Applied the ui-ux-pro-max Quick Reference and directly inspected its verified `Minimalism & Swiss Style` style entry and React guidance for deriving filtered data during render. The optional Python CLI was unavailable; no Python installation or additional application dependency was needed.

## Research and decisions — 24 October 2026

Research questions: which renderer provides geographical 3D; where to obtain terrain and basemap data without a secret; how to source photographs honestly; how to preserve orientation and accessibility during transitions.

Firecrawl and Exa are unavailable in this session, so research used built-in web search and direct reads of primary documentation.

- [MapLibre 3D terrain](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/) supports elevation sources and terrain rendering. Choose MapLibre rather than building geographical navigation and tile management in Three.js. This is an implementation judgement, not a claim that Three.js cannot support maps.
- [OpenFreeMap quick start](https://openfreemap.org/quick_start/) documents MapLibre integration and Vite worker setup. Use its vector basemap and retain provider attribution.
- [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) provides global bare-earth elevation. Use Terrarium encoding with attribution to [Mapzen and its underlying data sources](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). Terrain height is visually exaggerated for exploration; this is not a survey tool.
- [Motion accessibility](https://motion.dev/docs/react-accessibility) documents reduced-motion handling. Camera flights and UI transforms stop under reduced motion; selection remains usable. No endless decorative animation or automatic camera orbit.
- [Wikimedia Commons reuse](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) requires respecting each file's license. Download curated photographs locally and retain author, source, license links, and crop notice in the photo viewer and `photo-credits.md`.

Confidence: high in documented renderer capabilities and license metadata; representative coordinates are approximate place centers, not administrative boundaries. Public tile services need network access and do not provide an application-specific uptime guarantee.

## Scope and states

The expanded local dataset contains **38 provinces, 514 regencies/cities and 7,285 districts**, imported from [nekoding/wilayah-indonesia](https://github.com/nekoding/wilayah-indonesia) at the commit recorded in `public/data/regions-source.json`. The source uses 2025 administrative data; the application is not a live government registry. Retain its MIT license. Use province/city capital coordinates and district polygon centroids; derive map framing from source geometry bounds. Keep legacy assessment URLs working.

The local gallery contains **126 credited photos**, with at least three per province. [Commons geosearch](https://www.mediawiki.org/wiki/API:Geosearch) and [imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo) supply additional nearby images within 10 km for city/district selections, with a 15-second timeout and cancellation on selection changes. The radius can cross administrative boundaries: label these images “Sekitar”, retain source/author/license, and never call them verified district photographs. Keep the local city/province collection visible while loading or on failure; no API key is required. Accept only landscape JPEGs with supported free licenses and trusted Commons image/source URLs. Commons descriptions are rendered as plain text. Offline filters and local photos remain independent of this service.

The collection script follows [MediaWiki API etiquette](https://www.mediawiki.org/wiki/API:Etiquette) with serial requests, delay, and rate-limit backoff. Inspect candidates for ambiguous place names and unsuitable subjects; automated filtering cannot replace location review.

| State | Trigger, feedback, next action |
| --- | --- |
| Loading | Data or map is pending; stable labelled loading region. |
| Empty | No selection; Indonesia overview, disabled child filters, and a representative gallery. |
| Error | Region fetch, WebGL, or map service fails; readable explanation and retry. Region filters and local photos work independently of tile services. |
| Partial | Local photos are unavailable for a district; name the parent gallery. Elevation fails; retain usable flat basemap and explain the limitation. |
| Success | Selection updates the URL, filter values, map location label, camera/marker and gallery; reset returns to Indonesia. |
| Permission | Not applicable: no login, user location, upload or device permission is requested. |

## Validation

Run a small Node test suite against selection validation, coordinate coverage, parent-gallery fallback and loader error handling. Run lint and production build. Inspect desktop/mobile renders, keyboard controls, reduced motion, invalid URL parents, image dialog, and map fallback. Record actual observations and screenshots in `docs/evidence/`; do not mark untested states as passing.
