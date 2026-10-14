# Testing and verification

## Commands (run in the repository root)

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint (eslint-config-expo flat config, React Compiler rules), zero warnings allowed |
| `npm test` | Jest (jest-expo preset) |
| `npm run test:ci` | Jest with coverage |
| `npm run verify` | typecheck + lint + test:ci |
| `npx expo prebuild --clean` | Generates `android/` and `ios/` and applies all config plugins |
| `npx expo export --platform android --platform ios` | Builds Hermes bundles with Metro (catches unresolved modules) |
| `npx expo run:android` / `npx expo run:ios` | Native dev build (needs Android SDK / macOS + Xcode) |

Node ≥ 22.13 is required for the tests, which use the built-in `node:sqlite`.

## Test suites (94 tests, all passing on 2026-10-14)

| Suite | Type | Covers |
|---|---|---|
| `domain/notam/parser.test.ts` | unit | header/items/Q line, UTC dates (strict), PERM/EST, polygon/circle/Q-line geometry, `[lon,lat]` order, ring orientation, FIR-wide, invalid dates → needs-review, garbage → failed with raw kept, bulletin splitting |
| `domain/notam/lifecycle.test.ts` | unit | future/active/expired, NOTAMR replacement (only from the replacement's own B time), NOTAMC cancellation (cancel beats replace), PERM, EST-passed → unknown, DAILY schedules incl. midnight wrap, timezone-independent UTC |
| `domain/services/services.test.ts` | unit | haversine/bearing/destination, circle polygons, polygon validation, coordinate formatting, freshness states, navaid classification (source type only), frequency formatting, vertical limit references/conversions/conservative band filter, PDF signature/size/path traversal, route legs/ETE/magnetic course |
| `providers/providers.test.ts` | unit | RFC 4180 CSV (quotes, newlines, BOM, CRLF), schema errors, manual import counts, backend payload validation, registry invariants (blocked providers never "verified"), tile estimate |
| `features/map/layers.test.ts` | unit | GeoJSON builders, runway geometry rules, NOTAM layer selection by lifecycle, unmapped count, unavailable layers off by default |
| `infrastructure/database/database.test.ts` | integration (real SQLite) | migrations: fresh/idempotent/user data kept/failed migration rolled back/newer DB refused; OurAirports recorded fixture normalisation; bounds queries, search with LIKE escaping, runways; failed replacement keeps data; NOTAM round-trip incl. geometry; revision detection; purge rules; documents/tags/checksum; routes; sources; interrupted-run recovery |
| `infrastructure/synchronization/sync.test.ts` | integration | successful sync, **network failure keeps data and yields `update-failed`**, truncated download rejected, schema change → `schema` error, manual NOTAM import labelled manual, HTTP status → error kind, offline, timeout, HTTPS-only |
| `components/ui.test.tsx` | component | stale warning banner with source/time, manual data never "Güncel" |
| `features/screens.test.tsx` | screen (real SQLite) | NOTAM list empty state, synthetic labelling, superseded/expired hidden by default and revealed by filter, EST unknown visible; layer panel toggle + unavailable layers disabled with reason |

Coverage (2026-10-14): statements 78.6 %, branches 74.0 %, functions 76.5 %, lines 81.8 %
over `src/domain`, `src/providers`, `src/infrastructure`. Uncovered by design:
`infrastructure/database/client.ts` and `infrastructure/filesystem/documentStorage.ts`
are native-only.

Fixtures:
- `src/test/fixtures/ourairports/`: **recorded** excerpt of real OurAirports CSVs (Public Domain), dated 2026-10-14.
- `src/test/fixtures/notams.synthetic.ts`: **synthetic** NOTAMs using fictitious `XX` location indicators.

## Verification matrix

| Requirement | Implementation | Test | Result | Remaining issue |
|---|---|---|---|---|
| TypeScript strict compile | whole repo | `npm run typecheck` | **PASS** | — |
| Lint | eslint-config-expo | `npm run lint` | **PASS** (0 warnings) | — |
| Unit / integration / component tests | 9 suites | `npm test` | **PASS** (94/94) | — |
| JS bundles for Android & iOS | Metro / Hermes | `expo export` | **PASS** (android 3.9 MB, ios 3.6 MB .hbc) | — |
| Native config (plugins, permissions, MapLibre Podfile hook) | app.json | `expo prebuild --clean` + manifest/Podfile inspection | **PASS** | — |
| Android APK build | Gradle | `expo run:android` | **BLOCKED** | Android SDK download (`dl.google.com`) denied by container network policy. Run locally. |
| iOS build | Xcode | `expo run:ios` | **BLOCKED** | Needs macOS + Xcode (not available). Use a Mac or EAS Build. |
| Real map renders (MapLibre + OpenFreeMap) | `MapScreen` | — | **NOT VERIFIED** | Needs a device; tile host was blocked here. |
| Layer toggling | `LayerPanel`, settings | `screens.test.tsx` | **PASS** (UI logic) | Visual check on device |
| Selecting a VOR/DME on the map | `GeoJSONSource.onPress` → `SelectionCard` | — | **NOT VERIFIED** | Native press events; device test |
| Airport/navaid dataset integrated w/ provenance | OurAirports adapter + repos | `database.test.ts`, `sync.test.ts` | **PASS (fixture)** | Live download on device not verified |
| Search & filtering | repositories, NOTAM filters | `database.test.ts`, `screens.test.tsx` | **PASS** | — |
| NOTAM model, parsing, lifecycle, geometry validation | `domain/notam/*` | parser/lifecycle tests | **PASS (synthetic fixtures)** | No real feed available |
| Live NOTAM integration | backend client only | validator test | **BLOCKED** | No authorised provider / backend |
| Stale-data marking | `evaluateFreshness`, banners | services, ui, screens tests | **PASS** | — |
| Failed sync keeps local data | `syncOurAirports`, `replaceSourceDataset` | `sync.test.ts`, `database.test.ts` | **PASS** | — |
| PDF import into app-private storage | `documentStorage.ts` | validation unit tests only | **NOT VERIFIED** | Native picker/filesystem; device test |
| PDF opens offline | `DocumentReaderScreen` | — | **NOT VERIFIED** | Device test (airplane mode) |
| Document metadata persists | `documentRepository` | `database.test.ts` | **PASS** (repository) | Restart persistence on device not verified |
| Offline map packs | `OfflineMapsScreen` | tile estimate unit test | **NOT VERIFIED** | Device test |
| Migrations safe for user data | `migrations.ts` | `database.test.ts` | **PASS** | — |
| Route planning (distance/bearing/ETE) | `route.ts`, planner | services test | **PASS** (calc) | UI not tested |
| Airspace altitude filter | `mayIntersectBand` | services test | **PASS** (logic) | No airspace data source, so not exposed in UI |
| Airways / waypoints / airspaces layers | models + schema; layers marked unavailable | layers test | **NOT IMPLEMENTED** (no authorised data) | Needs a data source |
| GPS track recording, weather, terrain | — | — | **NOT IMPLEMENTED** | Roadmap |
| No credentials committed | — | manual review | **PASS** | — |
