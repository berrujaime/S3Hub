# S3Hub — Engineering Conventions

S3Hub is a React Native / Expo (SDK 53) mobile app for browsing and managing S3-compatible object storage.

## Golden rules (do not break)

1. **Google Play 16KB page size compatibility is mandatory.** Do NOT modify the native build config that enables it: `app.json`, `eas.json`, `plugin/with16KPageSize.js`, `plugin/withAndroidPageSize.js`, or `expo-build-properties`. Do not add native modules.
2. **Do NOT bump `@aws-sdk/*`.** It is pinned at `3.121.0` on purpose (fixes a login / 16KB regression — see commit `807915e`). New providers are added via endpoint configuration only, never an SDK upgrade.
3. **All code, identifiers, and comments in English.** UI strings always go through i18n (`src/locales/translations.js`), never hardcoded.
4. **No new bugs.** Keep existing behavior working; changes must be backward compatible with already-stored connections.

## Architecture (Clean Architecture — keep layers honest)

```
src/
  domain/        Pure logic. NO react, NO aws-sdk, NO expo imports. 100% unit-testable.
    providers.js   Provider registry (endpoints, regions, path-style, fields). Single source of truth.
    errors.js      Maps SDK/HTTP errors -> stable app error codes + i18n keys.
  data/          Adapters over platform/SDK. Mockable.
    connectionRepository.js   Wraps expo-secure-store for connection persistence.
  services/      S3 SDK integration (s3Client, s3Service, authService).
  context/       React state (AuthContext) — consumes data/ + domain/.
  screens/       Presentation only.
  components/, navigation/, theme/, locales/
```

- The domain layer must import nothing from React, the AWS SDK, or Expo. This is what makes it testable without a device.
- Screens never build endpoints or interpret raw SDK errors directly — they use `domain/`.

## TDD

- Write the test first for every `domain/` and `data/` module (red → green → refactor).
- Test runner: **Jest** with the `jest-expo` preset. Tests live in `__tests__/` next to the module.
- Pure domain modules must have full coverage of their branches.

## Clean Code

- Small, single-responsibility functions; descriptive names; no dead code or stray `console.log`.
- Reuse the provider registry and error mapper — never re-introduce hardcoded `if (service === 'aws')` branches or generic `Alert.alert(t('error'), t('error'))`.
- Drive all colors from the Paper theme (`useTheme()`), never hardcode `#fff` / `#000` in components (required for dark mode).

## Providers

Supported: AWS, Storj, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces, Google Cloud Storage (S3 interoperability / HMAC keys), and a generic **Custom / S3-compatible** option (user-supplied endpoint; covers MinIO).
Azure Blob Storage is intentionally **not** supported natively (no S3 API); advanced users can point the Custom option at an S3 gateway.

New providers use a `MaterialCommunityIcons` icon (field `icon`) instead of a PNG logo; AWS and Storj keep their existing PNG `logo`.

## i18n keys available (already added to en + es)

Errors: `errorNetwork`, `errorInvalidCredentials`, `errorAccessDenied`, `errorBucketNotFound`, `errorGeneric`.
Login/providers: `selectProvider`, `accountId`, `endpoint`.
Search: `search`, `noResults`.
Theme: `selectTheme`, `themeSystem`, `themeLight`, `themeDark`.

## Commands

- `npm test` — run unit tests.
- `npm run lint` — ESLint.
- `npx expo start` — run the app.
