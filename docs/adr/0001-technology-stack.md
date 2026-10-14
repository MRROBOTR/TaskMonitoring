# ADR 0001: Technology stack and version selection

- Status: Accepted (2026-10-14)
- Context: empty repository (only a README). The target is an offline-first Android/iOS
  EFB with a native map.

## Decision

| Concern | Choice | Version | Why |
|---|---|---|---|
| Framework | Expo (CNG / prebuild, dev builds) | SDK 57 (`expo ~57.0.28`) | Current `latest` dist-tag. SDK 57 pins RN 0.86.3 and React 19.2.3 (`bundledNativeModules.json`). |
| React Native | 0.86.3 | pinned by SDK | New Architecture enabled by default (`newArchEnabled=true` in the generated `gradle.properties`). |
| Map | `@maplibre/maplibre-react-native` | ^11.5.0 | Peer deps `expo>=54`, `react-native>=0.80`, `react>=19.1` are all satisfied. The same major runs in OpenVFR on Expo 57. |
| Navigation | `expo-router` (file-based) | ~57.0.26 | Matches the SDK; the template AGENTS.md recommends it. React Navigation is bundled inside it. |
| Database | `expo-sqlite` (async API) | ~57.0.4 | Native SQLite on both platforms; WAL mode; migrations via `PRAGMA user_version`. Requires `expo-asset` (found by a failing test, now installed). |
| Files | `expo-file-system` (new `File`/`Directory`/`Paths` API) | ~57.0.7 | App-private storage and MD5 for duplicate detection. |
| Picker | `expo-document-picker` | ~57.0.3 | Native SAF / UIDocumentPicker. |
| PDF | `react-native-pdf` + `react-native-blob-util` + `@config-plugins/*` | 7.0.5 / 0.25.1 / 14.0.2 | MIT. Native PdfRenderer (Android) / PDFKit (iOS). No text search API, which is documented as a limitation. |
| Network state | `@react-native-community/netinfo` | 12.0.1 | SDK-pinned. |
| Location | `expo-location` | ~57.0.21 | Foreground only; background explicitly blocked. |
| Tests | `jest-expo` + Jest 29 + `@testing-library/react-native` 14 + `test-renderer` 1.2 | — | jest-expo 57 depends on Jest 29. `test-renderer` 1.3 needs React 19.3, so it's pinned to 1.2 (react-reconciler 0.33). |
| Test DB | Node built-in `node:sqlite` | Node ≥ 22.13 | Repositories and migrations run against a real SQLite engine in tests, not mocks. |
| Basemap | OpenFreeMap public instance | — | Free, no key, OSM data. See DATA_SOURCES.md for offline caveats. |
| Aviation data | OurAirports CSV | — | Public Domain; the only source whose schema and license I could verify. |

## Rejected / deferred

- **Expo Go**: MapLibre needs native code, so a dev build (`expo run:*` or EAS) is required.
- **Backend / PostgreSQL / PostGIS / Docker**: not needed for single-device offline use.
  The provider interfaces leave room for a later backend (needed for FAA NMS credentials).
- **AirTrail code**: GPL-3.0. Reference only.
- **OpenAIP adapter**: schema not verifiable from here. Blocked, not guessed.
- **Google Maps tiles in MapLibre**: against Google's terms. Not used.

## Consequences

- iOS builds need macOS + Xcode, or EAS Build. Neither was available here.
- Android builds need the Android SDK. Downloading it (`dl.google.com`) was blocked
  here, so the Gradle build is unverified. `expo prebuild` and the Metro bundles for both
  platforms were verified.
