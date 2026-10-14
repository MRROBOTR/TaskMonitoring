# Data sources

Each source has a descriptor in code (`src/providers/registry.ts`,
`src/providers/aviation/ourairports.ts`, `src/providers/basemap/styles.ts`). The Data
Management screen shows these descriptors, along with each source's sync state.

**Verification environment.** Checks were run on 2026-10-14 from a dev container whose
network policy blocked most hosts (see OPEN_SOURCE_REVIEW.md). "Access verified" means
I actually fetched data from this container.

## Verification matrix

| Provider | Dataset | Access verified | Schema verified | License reviewed | Offline permission reviewed | Status |
|---|---|---|---|---|---|---|
| OurAirports | airports, runways, frequencies, navaids (CSV) | **Yes**, via the `raw.githubusercontent.com` mirror of the same repo. The app's URL (`davidmegginson.github.io`) was blocked here. | **Yes**: live CSV headers; recorded fixture in `src/test/fixtures/ourairports/` | Yes: Public Domain (ourairports.com/data, per search result) | Yes: Public Domain, no restriction | **INTEGRATED** (fixture-tested; on-device download NOT VERIFIED) |
| OpenFreeMap | basemap vector tiles / styles | No (`tiles.openfreemap.org` blocked); style JSON read from the GitHub repo | Style JSON structure checked | Yes: MIT code, OSM ODbL data, attribution required | **Unknown**: bulk/offline not addressed | INTEGRATED as a style URL; rendering NOT VERIFIED |
| Manual NOTAM import | ICAO-format text the user supplies | n/a | ICAO format (tests with synthetic fixtures) | Data stays subject to the originating source's terms | User responsibility | **INTEGRATED** |
| OpenAIP | airports, airspaces, navaids, reporting points | No (`api.core.openaip.net` blocked) | **No**: spec is at `api.core.openaip.net/api/system/specs/v1/schema.json` (found in `openAIP/openaip-api-documentation/index.html`) | Partial: CC BY-NC 4.0 per OpenVFR's README; official page not reachable | Unknown | **BLOCKED** |
| FAA NMS-API | NOTAMs | No (`aa.data.faa.gov` blocked) | No | Partial: access is by FAA-issued credentials (per FAA FAQ, search results) | Unknown | **BLOCKED** (needs credentials and a backend) |
| DHMİ AIS | NOTAM/PIB, AIP, charts | No (`ais.dhmi.gov.tr` blocked) | No documented API found | No | Unknown | **BLOCKED**: manual import is the workaround |
| EUROCONTROL EAD | NOTAM, AIP, AIXM | No | No | Requires a service agreement (OpenVFR README, EUROCONTROL page title) | Unknown | **BLOCKED** |
| ATLAS backend (future) | NOTAMs via authorised providers | n/a (no server exists) | Contract defined by us; client validator tested | n/a | n/a | **BLOCKED / NOT IMPLEMENTED** server-side |

## OurAirports (integrated)

- Docs: https://ourairports.com/data/. Files: https://github.com/davidmegginson/ourairports-data
  (published at `https://davidmegginson.github.io/ourairports-data/*.csv`).
- Categories: airports (incl. heliports, closed), runways (with end coordinates),
  airport frequencies, navaids (VOR, VOR-DME, VORTAC, TACAN, DME, NDB, NDB-DME; values
  checked by profiling the live file).
- Coverage: worldwide, community-maintained. In the 2026-10-14 file, TR had 444 airport
  rows (270 heliports) and 136 navaids.
- Update frequency: files are generated daily.
- Access: anonymous HTTPS. No key, and no rate limit documented.
- License: "All data is released to the Public Domain, and comes with no guarantee of
  accuracy or fitness for use."
- Attribution: not required; ATLAS shows "OurAirports (Public Domain)" anyway.
- Limitations: **not an official AIP source**. No waypoints, airways or airspaces. Runway
  surface is free text and is shown verbatim. Idents are not unique: e.g. `YAA` appears
  as both a VOR-DME and an NDB, and the tests cover this.
- Integration: the full CSVs (~20 MB) are downloaded, parsed with an RFC 4180 parser, and
  checked for required columns (a schema change fails loudly). Records are filtered to
  the user's countries, rows with invalid coordinates are rejected (and counted), and the
  rest goes into SQLite in one transaction. A failed or truncated download never replaces
  existing data.

## OpenFreeMap (basemap)

- Style URLs: `https://tiles.openfreemap.org/styles/liberty` (default), `positron`, `dark`.
- Format: vector tiles (OpenMapTiles schema) plus Natural Earth raster at low zoom; glyphs
  are `Noto Sans Regular/Bold/Italic`.
- Authentication: none. Usage limits: none stated for the public instance.
- Attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (rendered by MapLibre).
- Offline: **not addressed**. Packs are capped at about 4°×4°, max zoom 12 and 20,000 tiles.
- Commercial use: README states free use. OSM data is under ODbL.
- Alternatives: self-hosted PMTiles (OpenFreeMap planet builds), MapTiler or Stadia
  (paid, API key). If one of those is chosen, its key must not ship in the bundle
  without the provider's mobile-key restrictions.

## OpenAIP (blocked)

- Hosts found in the docs repo: `api.core.openaip.net`, `api.tiles.openaip.net`, `api.iam.openaip.net`.
- Third-party guides describe an API client token created in the user's account. I did
  **not** verify the header name, endpoint paths or field names, so no adapter was
  written (per the rule against inventing schemas).
- To unblock: (1) fetch the OpenAPI spec above; (2) confirm the license and whether
  offline storage is allowed; (3) let the user enter their own key (to be stored in
  `expo-secure-store`); (4) generate types from the spec; (5) write the adapter against
  recorded fixtures.

## FAA NMS-API (blocked)

- Per the FAA NMS FAQ and search results: the legacy USNS was retired and cut over to NMS
  in April 2026. NMS-API access is requested by email (no self-service sign-up).
- Coverage is the FAA distribution system. **It is not a universal global feed.**
- Integration path: an ATLAS backend holds the credentials and serves ICAO text to the
  app via the contract in NOTAM_PIPELINE.md. The mobile adapter
  (`src/providers/notams/backend.ts`) and its payload validator are implemented and
  tested. The server is not.

## DHMİ AIS (blocked)

- I found no documented public API. Portal HTML is not treated as an API, and
  authenticated pages are not scraped. **Workaround:** the user copies the PIB/NOTAM
  text from the official portal and pastes it into *NOTAM → içe aktar*. That data is
  labelled "Manuel içe aktarım" and never shown as live.

## EUROCONTROL EAD (blocked)

- Operational access requires an agreement. ATLAS does not claim European, let alone
  global, coverage.
