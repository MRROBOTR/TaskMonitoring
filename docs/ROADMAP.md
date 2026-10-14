# Roadmap

## Status (2026-10-14)

| Phase | Status |
|---|---|
| 0 Repository inspection & feasibility | **Done**: OPEN_SOURCE_REVIEW.md, DATA_SOURCES.md, adr/0001 |
| 1 Mobile foundation | **Done in code**; Metro bundles + prebuild verified; **native builds blocked here** |
| 2 Real map | Implemented (MapLibre, OpenFreeMap, layers, selection, offline packs); **device rendering not verified** |
| 3 Aviation reference data | OurAirports airports/runways/frequencies/navaids **done** (fixture-verified). Airspaces, waypoints, airways **blocked** (no authorised source) |
| 4 NOTAM subsystem | Pipeline, persistence, map, list, detail, freshness **done** (synthetic fixtures). Live provider **blocked** |
| 5 Documents | Import, reader, categories, favourites, bookmarks, rename, delete, emergency access **implemented**; device verification pending. Text search **not available** in the PDF library |
| 6 Offline & sync | Failure-safe sync, run history, stale handling **done**; airplane-mode device test pending |
| 7 Advanced | Route planner (great-circle legs, TC/MC, ETE) **done**. Altitude filter logic done (no airspace data yet). GPS track recording, interactive checklists **not started** |
| 8 Release readiness | Permission audit and dependency audit done; license audit in DATA_SOURCES / OPEN_SOURCE_REVIEW. Device testing, backup/restore **pending** |

## Blockers and what unblocks them

| Blocker | Needed from you |
|---|---|
| Android build not run | Run `npx expo run:android` on your machine (Android Studio / SDK 36, JDK 17+) |
| iOS build not run | A Mac with Xcode 16+, or an Expo account for `eas build -p ios --profile development` |
| Live NOTAMs | One of: FAA NMS-API credentials (by email to the FAA) **plus** a backend to hold them; or a documented, authorised DHMİ / EAD access method |
| Airspaces / reporting points | An OpenAIP account + API key and confirmation that its license (reported CC BY-NC 4.0) fits your use; or an authorised AIXM / OpenAIR source |
| Airways / IFR waypoints | An authoritative dataset with redistribution rights (e.g. national AIP data under licence) |
| Heavy offline basemap use | Decide on self-hosting PMTiles or a paid tile provider with offline terms |

## Next actions (in order)

1. On-device verification pass (checklist in OFFLINE_MODE.md, plus map selection and PDF import).
2. OpenAIP adapter once the schema and license are confirmed (airspaces with vertical
   limits, which unlocks the altitude filter UI and airspace layers).
3. OpenAIR import (`@openaip/openair-parser`) for user-supplied airspace files.
4. ICAO-style SDF icons for navaid/airport symbology (currently styled circles + type labels).
5. Interactive checklists (structured, not just PDFs) and GPS track recording.
6. Backup/restore of the SQLite database + documents folder (export to a user-chosen location).
7. Optional backend (Node/TS) for credentialed NOTAM providers, following the contract in NOTAM_PIPELINE.md.
