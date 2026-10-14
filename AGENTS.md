# ATLAS EFB — agent notes

Expo SDK 57 / React Native 0.86 (New Architecture) / TypeScript strict / expo-router.
Read `docs/ARCHITECTURE.md` before changing structure.

## Rules

- Install packages with `npx expo install <pkg>` so versions match the SDK
  (`EXPO_OFFLINE=1` if the Expo API is unreachable).
- `android/` and `ios/` are generated (`npx expo prebuild`). Never edit them; configure via `app.json` / config plugins.
- MapLibre needs a development build; Expo Go does not work.
- `src/domain` must stay free of React/Expo/MapLibre/database imports.
- Never invent provider endpoints, field names or aviation data. Unknown values stay `null`.
  Synthetic data must be labelled and use the fictitious `XX` location prefix.
- No secrets in the repo or the bundle.

## Before declaring work done

```bash
npm run verify                                   # typecheck + lint + tests
npx expo export --platform android --platform ios --output-dir /tmp/atlas-dist   # bundles resolve
```

Update the verification matrix in `docs/TESTING.md` with actual results.
