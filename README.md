# ATLAS EFB

An offline-first Electronic Flight Bag for Android and iOS: a native MapLibre map with
aviation layers, an auditable NOTAM pipeline, and local PDF document management.
The UI is Turkish, with standard aviation terms in English.

> ⚠️ **Not certified.** ATLAS EFB does not replace official aeronautical publications
> (AIP, NOTAM, PIB) or required pre-flight briefing. All data may be incomplete, delayed
> or wrong. Use it for planning and situational awareness only.

## What works today

| Feature | Status |
|---|---|
| Native vector map (MapLibre RN 11, OpenFreeMap basemap, attribution, compass, scale, coordinates, location) | Implemented; on-device rendering not yet verified |
| Airports, heliports, runways, frequencies, VOR / VOR-DME / VORTAC / TACAN / DME / NDB from **OurAirports** (Public Domain) | Implemented; fixture-verified |
| Layer panel with legend; layers without a data source shown as unavailable with the reason | Implemented, tested |
| Feature selection → detail card → airport / navaid detail screens | Implemented |
| Search (ICAO / IATA / name / navaid ident) | Implemented, tested |
| NOTAM: ICAO parser, NOTAMR/NOTAMC lifecycle, PERM/EST, schedules, confirmed vs approximate geometry, map layers, list filters, detail with original text, freshness | Implemented, tested with synthetic fixtures |
| NOTAM sources | **Manual import only** (paste/text file). Live providers are blocked, see below |
| PDF import (validated, copied into app-private storage), library, categories, favourites, rename, delete, reader with page navigation, zoom, bookmarks, resume position, full screen; emergency/QRH quick access | Implemented; device verification pending |
| Offline basemap packages (bounded regions) | Implemented; device verification pending |
| Route planner (great-circle legs, TC/MC, distance, ETE), saved routes, route on map | Implemented |
| Data Management: sources, licenses, sync history, failure-safe updates, storage, purge | Implemented, tested |

**Not implemented / blocked:** live NOTAM feed, airspaces, airways, waypoints/reporting
points, terrain, weather, GPS track recording, PDF text search. See
[docs/ROADMAP.md](docs/ROADMAP.md).

## Requirements

- Node.js ≥ 22.13 (tests use `node:sqlite`) and npm 10
- **Android:** Android Studio with SDK Platform 36 and build tools 36, JDK 17+, a device or emulator (minSdk 24)
- **iOS:** macOS with Xcode 16+ and CocoaPods (deployment target 16.4), *or* EAS Build in the cloud
- Expo Go is **not** supported (MapLibre needs native code). Use a development build.

## Install and run

```bash
git clone <repo> && cd TaskMonitoring
npm ci                         # install exact locked versions
npm run verify                 # typecheck + lint + tests
```

**Android** (on your computer, in the repo root):

```bash
npx expo run:android           # runs prebuild, builds, installs a dev build, starts Metro
# later sessions: npm start   (Metro for the installed dev client)
```

**iOS** (on a Mac):

```bash
npx expo run:ios
```

Without a Mac: `npx eas-cli@latest build -p ios --profile development` (needs a free Expo
account and an Apple developer account for device installs).

The `android/` and `ios/` folders are generated (Continuous Native Generation) and
git-ignored. Configure native behaviour in `app.json`, never by editing them.

## First use

1. **Diğer → Data Management → Şimdi güncelle.** Downloads the OurAirports CSVs (~20 MB)
   and stores the countries you enter (default `TR`).
2. **Diğer → Çevrimdışı haritalar.** Optionally download a basemap region for offline use.
3. **NOTAM → NOTAM içe aktar.** Paste ICAO-format NOTAM text from your official briefing
   source. (A clearly labelled *synthetic* demo set is available for trying out the UI.)
4. **Dokümanlar → PDF içe aktar.** Import AIP pages, charts, POH, QRH, checklists.

## Configuration and credentials

Nothing needs to be configured: all current sources are anonymous. No API keys are used
or committed. What would unblock more features is in
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) and [docs/ROADMAP.md](docs/ROADMAP.md):

- live NOTAMs: FAA NMS-API credentials (issued by the FAA) **and** a backend to hold them, or authorised DHMİ / EAD access;
- airspaces / reporting points: an OpenAIP account and API key, with a license check (reported CC BY-NC 4.0).

## Offline behaviour

Aviation data, NOTAMs, PDFs, routes and settings are stored on the device and work
without a network. The basemap works offline only inside downloaded packs. Failed
updates never delete local data, and stale or manual data is always labelled. Details:
[docs/OFFLINE_MODE.md](docs/OFFLINE_MODE.md).

## Architecture

Expo SDK 57 · React Native 0.86 (New Architecture) · TypeScript strict · expo-router ·
MapLibre React Native 11 · expo-sqlite · expo-file-system · react-native-pdf.
Pure domain logic (`src/domain`) is separate from providers, infrastructure and UI.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/adr/0001-technology-stack.md](docs/adr/0001-technology-stack.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Data sources & verification matrix](docs/DATA_SOURCES.md)
- [Open-source review](docs/OPEN_SOURCE_REVIEW.md)
- [NOTAM pipeline](docs/NOTAM_PIPELINE.md)
- [Offline mode](docs/OFFLINE_MODE.md)
- [Security & privacy](docs/SECURITY.md)
- [Testing & verification matrix](docs/TESTING.md)
- [Roadmap & blockers](docs/ROADMAP.md)

## Data attribution

Basemap: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors (ODbL).
Airport and navaid data: OurAirports (Public Domain).
