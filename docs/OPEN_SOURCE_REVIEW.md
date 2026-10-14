# Open-source review

Reviewed 2026-10-14 from the dev container. **Research constraint:** the container's
network policy only let me reach the npm registry and `raw.githubusercontent.com`
(plus a web-search tool). `github.com`, `maplibre.org`, `openaip.net`,
`docs.expo.dev`, `faa.gov`, `ais.dhmi.gov.tr` and tile hosts were blocked. So
everything below comes from repository files read through `raw.githubusercontent.com`
(README, LICENSE, package.json, docs) and from npm metadata. GitHub UI-level signals
(open issues, contributor counts) were **not** checked.

## Summary

| Project | License | Maintenance signal | Decision |
|---|---|---|---|
| MapLibre React Native | MIT | npm 11.5.0 published 2026-10-04; frequent 11.x releases | **Reuse** (dependency) |
| OpenVFR (`OpenVFR/openvfr-app`) | MIT (code) | Says "alpha", Sweden-first; uses Expo 57 + MapLibre RN 11.4 | **Reference** (architecture, compatibility evidence) |
| AirTrail (`johanohly/AirTrail`) | **GPL-3.0** | Active (SvelteKit 2, Svelte 5, maplibre-gl 6) | **Reference only**: no code copied |
| OpenFreeMap (`hyperknot/openfreemap`) | MIT (code); OSM data ODbL | README: free public instance, no keys | **Reuse** as the default basemap service |
| OurAirports data (`davidmegginson/ourairports-data`) | Public Domain (data) | Generated daily | **Reuse** as the first aviation dataset |
| PMTiles (`protomaps/PMTiles`) | BSD-3-Clause | Active | **Reference**: future self-hosted offline basemap |
| `@openaip/openair-parser` (npm) | see package | 2.16.2, 2026-08-17 | **Candidate** for future OpenAIR airspace import |

## MapLibre React Native

- Repo: https://github.com/maplibre/maplibre-react-native, LICENSE.md: MIT (MapLibre contributors, Mapbox).
- `@maplibre/maplibre-react-native@11.5.0` peer deps: `expo >= 54`, `react >= 19.1`,
  `react-native >= 0.80`. Its own dev setup uses RN 0.85.3.
- The Expo setup doc (`docs/content/setup/expo.md`) says it **can't be used in Expo Go**,
  needs the config plugin `@maplibre/maplibre-react-native`, and on iOS the plugin
  adds `$MLRN.post_install(installer)` to the Podfile. I confirmed that hook in the
  generated `ios/Podfile`.
- v11 API, read from the installed type definitions: `Map` (`mapStyle`,
  `onRegionDidChange` with `bounds/zoom/center`, ornaments), `Camera`
  (`initialViewState`, `flyTo`), `GeoJSONSource` (`data`, `onPress`, `hitbox`,
  clustering), `Layer` (`type`, `style`, `filter`), `NativeUserLocation`,
  `OfflineManager` (`createPack`, `getPacks`, `deletePack`, `invalidatePack`,
  `setTileCountLimit`, pause/resume via `OfflinePack`), `NetworkManager.setConnected`.
- Limitations: native build required; offline packs depend on the tile provider's
  terms; there is no built-in ICAO symbol set.

## OpenVFR

- README: "free, open-source EFB for VFR pilots … built entirely on open data", **alpha**,
  Sweden-first, "not certified … situational awareness only".
- Structure: `apps/web` (React PWA), `apps/native` (Expo bare workflow, Expo `~57.0.27`,
  RN 0.86.3, `@maplibre/maplibre-react-native ^11.4.0`, React Navigation 7), `apps/api`
  (Hono), PostgreSQL + PostGIS migrations, Martin tile server.
- Data: aviation data is **not in the repo**. A separate pipeline builds GeoJSON/PMTiles
  from OpenFlightMaps (OFMX, ODbL), OpenAIP obstacles (API key), OSM extracts,
  Copernicus DEM and Protomaps basemaps. For NOTAMs it relies on the FAA NMS-API through a
  server, with credentials issued manually by the FAA.
- What I took: it independently confirms that Expo 57 + RN 0.86 + MapLibre RN 11 is a
  working combination, and it backs up the key architecture call (provider credentials
  belong on a server, never in the mobile bundle). I also borrowed the idea of a
  "situational awareness only" disclaimer.
- Code reuse: allowed (MIT), but I didn't copy any. Our needs (SQLite offline-first,
  no backend) differ. **Data reuse:** each dataset carries its own license; OpenAIP is
  reported as CC BY-NC 4.0 (non-commercial).

## AirTrail

- Flight-history tracker (SvelteKit, Prisma/Kysely, PostgreSQL, deck.gl + maplibre-gl,
  multi-user auth). **GPL-3.0.**
- Useful as a reference for: MapLibre layer composition and its import/export pipelines.
- Not relevant for a mobile EFB: the server-centric multi-user stack and the web UI.
- Decision: **reference only**. Copying code would make ATLAS a GPL derivative, so none
  was copied.

## Additional projects / standards

- **OpenFreeMap**: README says the public instance is free with "no limits on the
  number of map views or requests", no registration and no API keys. Attribution is
  required (MapLibre shows it automatically). Style URLs follow
  `https://tiles.openfreemap.org/styles/{liberty|positron|bright|dark|fiord}`, checked
  against the `openfreemap-styles` repo. Bulk offline prefetch is **not addressed**, so
  ATLAS limits offline packs to small regions (see OFFLINE_MODE.md).
- **OpenStreetMap tile servers**: not used. The OSMF tile policy forbids prefetch/offline use.
- **PMTiles**: the planned route to a fully self-hosted offline basemap. OpenFreeMap
  publishes planet `.pmtiles` builds; regional extraction would need tooling outside the app.
- **GeoJSON (RFC 7946)**: internal geometry format, `[lon, lat]`, CCW exterior rings.
- **AIXM**: not implemented. The model fields (vertical references, effective dates,
  data version) were chosen so AIXM-derived data can map in later.
- **OpenAIP, OpenFlightMaps, EAD, FAA, DHMİ**: see DATA_SOURCES.md.
