# Architecture

## Layers and module boundaries

```
src/
  app/                  expo-router routes (thin wrappers only)
  app-state/            AppProvider: DB handle, settings, data revision, network state
  components/           presentational UI primitives (FreshnessBanner, Card, …)
  features/             screens + feature logic
    map/                MapScreen (renderer), LayerPanel, SelectionCard, layers.ts (pure GeoJSON builders)
    notams/             list/detail/import screens, notamData.ts (filtering, dataset freshness)
    airports/           search, airport & navaid detail
    route-planning/     route planner
    documents/          library, PDF reader, emergency access
    data-management/    sources, sync, storage, offline map packs
    settings/           "Diğer" screen (settings, privacy, about)
  domain/               pure TypeScript, no React / Expo imports
    models/             Airport, Runway, Navaid, Waypoint, Airspace, Airway, Notam, Document, Provenance
    notam/              ICAO parser, Q-codes, coordinates, geometry, lifecycle
    services/           geodesy, freshness, navaid classification, vertical limits, routes, document validation
  infrastructure/
    database/           SqlDatabase interface, migrations, repositories, expo-sqlite client
    filesystem/         app-private PDF storage
    networking/         fetchText with timeouts + error classification
    synchronization/    sync orchestration (runs, failure safety)
  providers/            adapters that turn external data into domain models
    aviation/           OurAirports (CSV)
    notams/             manual import; ATLAS backend client (blocked)
    basemap/            style catalogue, offline limits
    registry.ts         every known source, including blocked ones
  test/                 fixtures (recorded + synthetic) and the node:sqlite adapter
```

Rules enforced by structure (and checked in review):

- `domain/` imports nothing from React, Expo, MapLibre or the database.
- The NOTAM parser has no React Native dependency, and is tested in plain Node.
- The map renderer (`MapScreen`) only consumes GeoJSON from `features/map/layers.ts`.
  It has no provider-specific logic.
- The document system (`infrastructure/filesystem`, `features/documents`) doesn't
  depend on the map.
- Repositories depend on the `SqlDatabase` interface. On device this is expo-sqlite; in
  tests it is `node:sqlite`.

## Data flow

```
Provider (HTTPS / user paste)
  → adapter (schema check, normalisation, provenance)   providers/*
  → sync orchestration (run record, atomic replace)      infrastructure/synchronization
  → SQLite (indexed tables)                              infrastructure/database
  → viewport / search queries (no network per map move)
  → domain evaluation (lifecycle, freshness) at read time
  → GeoJSON builders → MapLibre vector layers / lists / detail screens
```

## Database (schema v1)

Tables: `data_sources`, `synchronization_runs`, `airports`, `runways`, `navaids`,
`waypoints`, `airspaces`, `airways`, `notams`, `notam_geometries`, `documents`,
`document_tags`, `document_bookmarks`, `saved_routes`, `route_waypoints`,
`map_packages`, `app_settings`.

- Every reference/NOTAM row carries `source_id`, `source_record_id`, `origin` and
  `retrieved_at`.
- Ids are stable and namespaced: `ourairports:apt:<id>`, or for NOTAMs
  `<source>:<FIR>:<series+number/year>`.
- Spatial filtering uses lat/lon B-tree indexes plus bounding-box columns (airspaces).
  That's enough for country-scale datasets. PostGIS or R*Tree is a future option if
  volumes grow.
- PDFs live in the filesystem. Only metadata goes into SQLite.
- Migrations: forward-only, one transaction each, versioned by `PRAGMA user_version`.
  A database newer than the app is refused (no destructive downgrade). Tests cover
  rollback of a failing migration and preservation of user data.

## Synchronisation

- `syncOurAirports`: start a run → download → normalise → sanity check (non-empty) →
  `replaceSourceDataset` in a single transaction → finish the run. On any error the run
  is marked failed, `last_attempt_failed=1`, and the previous data stays in place.
- `importManualNotams`: parse → upsert (insert / revise / unchanged by raw text) →
  record the run.
- Runs still marked `running` at startup (app killed mid-sync) are marked
  `failed/interrupted`.

## Offline design

See OFFLINE_MODE.md. In short: aviation data, NOTAMs, documents, routes and settings are
all local. The basemap needs network access unless an offline pack covers the area.

## Future backend

A backend can be added behind the existing provider interface
(`providers/notams/backend.ts` already defines the contract). Its jobs would be holding
provider credentials (FAA NMS), scheduled ingestion, and optional multi-device sync with
authentication. Restricted providers must not be proxied in ways their terms prohibit.
