# Security and privacy

## Secrets

- The app currently needs **no secrets**. OurAirports and OpenFreeMap are anonymous.
- No API keys are in source control or the bundle. `.env*.local`, keystores
  (`*.jks`, `*.p12`, `*.key`, `*.p8`, `*.mobileprovision`) and `*.pem` are git-ignored.
- Providers that need confidential credentials (FAA NMS-API) need a backend. Those
  credentials must never go into the mobile app.
- User-owned keys (e.g. a future OpenAIP key) should be entered on-device and kept in
  `expo-secure-store`, not SQLite.

## Permissions (verified in the prebuild-generated AndroidManifest)

| Permission | Why |
|---|---|
| `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | "Konum" button. Requested at runtime only when pressed. |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Tiles and user-started downloads; offline detection. |
| `VIBRATE` | Added by Expo modules. |

Explicitly blocked: `ACCESS_BACKGROUND_LOCATION`, `RECORD_AUDIO`,
`SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE`, `DOWNLOAD_WITHOUT_NOTIFICATION`.
iOS: `NSLocationWhenInUseUsageDescription` only. Background location is disabled in the
`expo-location` plugin.

## Local files (imported PDFs = untrusted input)

- Files are picked with the system picker (SAF / UIDocumentPicker). No broad storage permission is needed.
- Validation: size > 0 and ≤ 300 MB, plus the `%PDF-` signature (first 1 KB) before anything is stored.
- The stored name is `<uuid>.pdf`. The original filename is metadata only and never used
  in a path. `isSafeRelativePath` rejects `..`, absolute paths and backslashes (tested).
- Duplicates are detected by MD5 of the content. That's an integrity convenience, not a security control.
- The PDF reader turns annotation rendering off and ignores links. No JavaScript is
  executed (native PDF renderers).
- Temporary picker copies in the cache directory are deleted after import.

## Network

- `fetchText` allows only `https://` URLs, enforces timeouts, and classifies errors.
- Leaving the device: basemap tile/style/glyph requests (OpenFreeMap) and, when the user
  starts it, the OurAirports CSV download. Nothing else.
- **Never** leaving the device: PDFs, NOTAM text, routes, location, settings. There's no
  analytics or telemetry.

## SQL

All queries use bound parameters. LIKE wildcards in user search input are escaped
(tested with `%`). Dynamic identifiers in `insertRows` are checked against `^[a-z_]+$`.

## Dependency audit (2026-10-14)

`npm audit` reports 67 advisories (15 moderate, 52 high, 0 critical), **all transitive**
and almost all in build/test tooling (Metro, Jest, Expo CLI, `node-forge` in code
signing, `braces`, `decode-uri-component`, `sprintf-js`, `uuid`). `npm audit fix --force`
would downgrade or break the Expo SDK pinning, so it was not applied. Re-check after
each Expo SDK patch update (`npx expo install --fix`).
