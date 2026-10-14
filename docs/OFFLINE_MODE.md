# Offline mode

| Data | Stored where | Works offline? | Verified? |
|---|---|---|---|
| Aviation reference data (OurAirports) | SQLite | Yes. All map/search queries are local. | Local queries tested on node:sqlite. **On-device airplane-mode test: NOT VERIFIED.** |
| NOTAMs | SQLite (raw + parsed) | Yes. Shown with source, retrieval time and freshness. | Tested (repository + UI with synthetic data) |
| PDFs | `<documentDirectory>/documents/<uuid>.pdf` | Yes. The reader opens the local file. | **NOT VERIFIED on device** (native PDF view can't run in Jest) |
| Routes, settings, bookmarks | SQLite | Yes | Repository tests |
| Basemap | MapLibre tile cache + offline packs | Only inside downloaded packs (plus the ambient cache) | **NOT VERIFIED** (needs a device) |

## Offline basemap packages

- Screen: *Diğer → Çevrimdışı haritalar* (or Data Management).
- Uses `OfflineManager.createPack({ mapStyle, bounds, minZoom: 0, maxZoom })` with
  progress/error listeners, plus `getPacks`, `pack.status()`, `pause`/`resume` and
  `deletePack`. Pack metadata is mirrored in the `map_packages` table.
- Limits (`OFFLINE_LIMITS`): area ≤ 16 deg², maxZoom ≤ 12, estimated tiles ≤ 20,000. The
  estimate is computed before download (Web Mercator tile math, unit-tested). There is
  no "whole world" option and no background auto-download.
- Incomplete downloads show as "Duraklatıldı / eksik" and can be resumed or deleted.
- **Terms:** OpenFreeMap doesn't document offline/bulk use. Downloads are small and
  user-initiated. For heavy offline needs, self-host PMTiles (see ROADMAP).

## Synchronisation and failures

- A sync runs only when the user starts it (no background jobs).
- Network errors are classified as offline, timeout, auth, rate-limited, server, http or
  cancelled, and shown to the user in Turkish.
- **A failed or partial sync never deletes local data.** Dataset replacement is a single
  transaction, and empty or truncated downloads are rejected. Tests cover both cases.
- Freshness labels: `live`, `cached`, `stale`, `update-failed`, `unavailable`,
  `not-configured`, `manual-import`, `synthetic`. Warning states get an orange/red
  banner with a ⚠ sign. Manual and synthetic data is never shown as live.

## How to verify on a device (remaining step)

1. Install the dev build, open Data Management → *Şimdi güncelle* (TR).
2. Download an offline pack for "Marmara" at max z10 and wait for it to finish.
3. Import a PDF.
4. Enable airplane mode and force-quit the app.
5. Reopen. Check that the map renders inside Marmara, airports and navaids show, the PDF
   opens, NOTAMs list with their original timestamps, and *Şimdi güncelle* fails with
   "Bağlantı yok" while the data stays in place.
