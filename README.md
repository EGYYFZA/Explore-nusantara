# Explore Nusantara

Explore Indonesian provinces, regencies, and districts through searchable filters, a 3D map, and local photography.

[Live demo](https://frontend-assesment-kledo.vercel.app/)

## Features

- 38 provinces, 514 regencies/cities and 7,285 districts, served from a local dataset
- Searchable region filters: type part of a name or choose from the list; use arrow keys and Enter to select, Escape to cancel
- Selection state stored in URL search parameters
- Responsive interface and location breadcrumbs
- Interactive MapLibre map with real elevation terrain, 2D/3D modes and location flights
- 126 local Wikimedia Commons photos covering every province, with author/license/source credits
- Additional nearby Commons photos for selected cities/districts, with a keyboard-accessible photo viewer
- Reduced-motion support and independent map failure recovery

## Stack

React, TypeScript, React Router, Tailwind CSS, Vite, MapLibre GL JS, and Motion.

## Development

```sh
npm ci
npm run dev
```

## Checks

```sh
npm run build
npm run lint
npm test
```

The region data is stored in `public/data/indonesia_regions.json`.

Use Node.js 24 (also used in CI). The national dataset comes from [nekoding/wilayah-indonesia](https://github.com/nekoding/wilayah-indonesia) under the [MIT license](public/data/licenses/wilayah-indonesia-MIT.txt), pinned to commit `02bdc8fd3b06dcb6a393731509f6865b9bb4d8d3`. See [import provenance](public/data/regions-source.json). Province/city points represent capitals; district points are polygon centroids. Bounding boxes frame the map; the app does not draw administrative boundaries. Old assessment URLs remain supported alongside the new official-code IDs.

Every province has at least three local photographs. City/district selections additionally query Wikimedia Commons within **10 km of the representative point**; this is not an administrative-boundary search. Nearby photos are labelled “Sekitar”, while local photos retain their actual collection area. Empty, unavailable or slow photo services retain the local city/province collection. Available images vary by location.

To reproduce the pinned data import or resume collecting photos (network required):

```sh
node scripts/import-regions.mjs
node scripts/collect-photos.mjs
```

The importer reads SQL COPY records as data without executing SQL. The photo collector requests Commons sequentially, validates image/license metadata, skips existing files and resumes incomplete collections. Review downloaded photos for ambiguous place names before adding them to the collection; search metadata alone cannot verify location. Topic queries are in `scripts/photo-topics.json`.

The basemap uses OpenFreeMap/OpenStreetMap and terrain uses Mapzen Terrain Tiles on AWS; an internet connection and WebGL are needed. No API key or geolocation permission is required. Terrain is exaggerated 1.5× for visual exploration. Local filters and photos remain usable when map services fail. MapLibre is loaded as a separate chunk; its renderer and worker are larger than the main application.

See [design research and scope](docs/explorer-design.md) and [photograph credits](docs/photo-credits.md). Each photo viewer includes author, license, and original source links. Gallery previews use CSS cropping; the viewer preserves the full photograph.

See [SECURITY.md](SECURITY.md).
