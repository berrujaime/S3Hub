# Uncropped Media Preview and Privacy Policy Refresh — Design

**Date:** 2026-07-28

**Goal:** Two independent fixes found during full-device testing of v1.2.0.

1. The full-screen image preview crops the image to fill a fixed box. It must show the whole image, scaled to fit within the existing width and height as maximums.
2. The privacy policy linked from Settings names only Amazon S3 and Storj, and describes a credential-storage model that no longer matches the code. Bring it in line with the eight supported providers and with what the app actually persists.

**Scope note:** these two parts share no code. They are specified together because they were reported together; they can be implemented and shipped independently.

## Global Constraints

Inherited verbatim from `CLAUDE.md`. Restated because they materially shape the decisions below:

1. **Google Play 16KB page size compatibility is mandatory.** No changes to `app.json` native build config, `eas.json`, `plugin/with16KPageSize.js`, `plugin/withAndroidPageSize.js`, or `expo-build-properties`. **No new native modules** — everything here is pure JS over existing dependencies, plus one static HTML file.
2. **Do NOT bump `@aws-sdk/*`.** Pinned at `3.121.0`. Neither part touches the SDK.
3. **All code, identifiers, and comments in English.** UI strings go through `src/locales/translations.js`. The privacy policy is a static web page, not app UI — it stays **English-only** by decision (see [2.7](#27-language)).
4. **No new bugs.** No change to stored connections, caches, or the storage layout. Part 2 changes documentation only — no code path that reads or writes credentials is touched.
5. **TDD:** failing test first. Part 1 gets a regression test; Part 2 has no testable logic.
6. **Clean Code:** small single-responsibility functions, no hardcoded colors, all color from `useTheme()`.

---

# Part 1 — Uncropped media preview

## 1.1 Problem

`MediaViewerModal` renders each page of the full-screen pager at a fixed size and asks for letterboxing (`MediaViewerModal.js:92, 159-164`):

```js
const fullMediaStyle = { width: width * 0.9, height: height * 0.6 };
...
<CachedImage source={{ uri: item.url }} style={fullMediaStyle} resizeMode="contain" cacheKey={...} />
```

`CachedImage` destructures only three props and drops the rest on the floor (`CachedImage.js:7, 54`):

```js
const CachedImage = ({ source, style, cacheKey }) => {
  ...
  return <RNImage style={style} source={{ uri: imgUri }} />;
```

`resizeMode` never reaches the `Image`, so React Native applies its default of `cover` — scale to fill the box, crop the overflow. Every preview is cropped to a 0.9 × 0.6 aspect ratio regardless of the source image's shape.

`CachedVideo` spreads the remaining props through to `Video` (`CachedVideo.js:8, 55`), so `resizeMode="contain"` does arrive and **video previews are already correct**. The defect is images only. This asymmetry between two otherwise-parallel cache components is the root cause.

## 1.2 Decision

Give `CachedImage` the same prop-forwarding signature `CachedVideo` already has:

```js
const CachedImage = ({ source, style, cacheKey, ...props }) => {
  ...
  return <RNImage style={style} source={{ uri: imgUri }} {...props} />;
```

Two lines in one file. `MediaViewerModal` is not modified — it was already asking for the right thing.

**Rejected alternative:** hardcoding `resizeMode="contain"` inside `CachedImage`. It would fix this call site but leave the component silently lossy for every other prop (`accessibilityLabel`, `onLoad`, `blurRadius`), and would make the two cache components diverge further rather than converge.

## 1.3 Box size — unchanged

The `90% width × 60% height` box stays as it is. With `contain` applied, that box acts as the maximum bounds the report asked for:

- A landscape image keeps its current width (90% of screen) and becomes proportionally **shorter**. This is the exact behavior described in the report.
- A portrait image is bounded by the 60% height and shows complete, leaving black scrim above and below.

Enlarging the box to use more of the screen was considered and explicitly declined: it is a separate visual-design change, not part of fixing the crop.

## 1.4 Testing

`src/components/__tests__/CachedImage.test.js` does not exist today. Add it, mocking `expo-file-system` in the style of the existing component tests, with two assertions:

1. **Regression guard:** a `resizeMode` passed to `CachedImage` is present on the rendered `Image`. This is the specific defect — a prop lost in silence — so it needs a test that fails before the fix.
2. **Cache path intact:** the existing behavior still holds — a cached path is used when present, and a read failure falls back to the remote URI.

Full `npm test` and `npm run lint` before and after.

## 1.5 Backward compatibility

None at risk. No storage format, cache key, or network call changes. The only observable difference is that previously-cropped images now render whole.

---

# Part 2 — Privacy policy refresh

## 2.1 Problem

`SettingsScreen` links to `Constants.expoConfig?.extra?.privacyPolicyUrl` (`SettingsScreen.js:35, 49-51`), which resolves to `https://berrujaime.github.io/S3Hub/privacy.html` (`app.json:45`). That page is served by GitHub Pages from the repo-root `docs/` directory.

Two problems with its content:

1. **Provider list is two releases stale.** It names only Amazon S3 and Storj. `domain/providers.js` now registers eight: AWS S3, Storj, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces, Google Cloud Storage, and Custom / S3-compatible.
2. **The credential-storage description no longer matches the code**, and over-claims. See [2.3](#23-what-the-app-actually-stores).

There are two byte-identical copies of the file: `docs/privacy.html` (repo root, the one GitHub Pages serves) and `S3Hub/docs/privacy.html`. **Both must be updated** so they do not silently diverge.

## 2.2 Accuracy audit

Every factual claim in the current document was checked against the code:

| Claim | Verdict | Evidence |
|---|---|---|
| Cache expires after 7 days | Correct | `cacheConfig.js:5` — `7 * 24 * 60 * 60 * 1000` |
| Cache cleared when app backgrounds | Correct | `useFileList.js:238-243` — `AppState` listener |
| Notification when an upload completes | Correct | `FileListScreen.js:460` — `scheduleNotificationAsync` |
| Media Library used to save to gallery | Correct | `FileListScreen.js:596, 840` — `saveToLibraryAsync` |
| File Access to pick files for upload | Correct | `FileListScreen.js:366` — `DocumentPicker` |
| No data sent to developer-controlled servers | Correct | No analytics/telemetry dependency; all S3 calls go to the configured endpoint |
| Connects to "Amazon S3 and Storj" | **Stale** | Eight providers in `domain/providers.js` |
| Credentials stored in SecureStore | **Imprecise** | Only the secret pair is; metadata is not — see 2.3 |
| Sharing a file to another app | **Missing** | `expo-sharing` used at `FileListScreen.js:812`, `fileOpener.js:105` — undocumented |

## 2.3 What the app actually stores

`connectionRepository.js` splits each connection across two stores (`:33-34`):

- **`conn_secret_<id>` in SecureStore** — `{ accessKey, secretKey }` only, one key per connection. Encrypted by the platform: iOS Keychain / Android EncryptedSharedPreferences via `expo-secure-store`.
- **`connections_meta` in AsyncStorage** — an array of the `META_FIELDS` allowlist (`connectionStorage.js:15-24`): `id`, `service`, `provider`, `region`, `endpoint`, `bucket`, `label`, `accountId`, plus a normalized `preview` boolean.

**This split is sound, and the reason is the allowlist.** `toStorageEntry` iterates a list of nine named fields and copies only those (`connectionStorage.js:33-34`); `accessKey`/`secretKey` are absent from it, so credentials cannot structurally reach AsyncStorage. A future sensitive field defaults to *not* being persisted in the clear unless someone opts it in. The split exists to fix a real bug — SecureStore warns or fails past ~2048 bytes per value, so the previous single-blob format silently stopped persisting at roughly 8–12 connections (`connectionRepository.js:6-12`).

The `id` stored in AsyncStorage is a two-pass FNV-1a hash of `[service, accessKey, region, endpoint]` (`cacheKeys.js:66-75`), so it is derived from the access key. This was examined as a possible leak and **is not one**: 64 bits of a non-cryptographic hash yields collisions, not the original key, and a collision cannot authenticate against S3. Its only residual value is confirming a candidate key an attacker already holds — who would simply try that key against S3 instead.

What is therefore readable without decryption, given sufficient device access: `endpoint`, `accountId`, `bucket`, `label`, `region`, `service`. None authenticates anything on its own. For the **Custom** provider the endpoint may be a private internal URL, which is infrastructure disclosure worth being honest about.

**Precision on "unencrypted".** AsyncStorage is not *unprotected* — it carries no app-level encryption. On Android it is a SQLite file under `/data/data/com.BerruApps.S3Hub/`, guarded by the app sandbox and by OS file-based encryption (mandatory since Android 10); on iOS it is a sandboxed container file under Data Protection. Reading it requires root/jailbreak, physical extraction, or a device backup. The policy must therefore say credentials use *encrypted* storage and metadata uses the app's *private local* storage — without promising app-level encryption for metadata, and without implying it is casually readable.

## 2.4 Edits

Content only. No change to the HTML structure or the `<style>` block.

1. **Data Collection and Storage**, opening paragraph — replace "connects to **Amazon S3** and **Storj** services" with an S3-compatible storage client that connects to the eight registered providers, naming them. Keep the existing "does **not** collect, transmit, or store any personal data on external servers controlled by the developer" sentence verbatim.
2. **Data Collection and Storage**, credentials bullet — split into two bullets:
   - *Credentials* (`accessKey` / `secretKey`): platform-encrypted storage (iOS Keychain / Android EncryptedSharedPreferences via `expo-secure-store`); leave the device only to authenticate against the endpoint the user configures.
   - *Connection metadata* (provider, region, endpoint, account ID, bucket, label): the app's private local storage, with no additional app-level encryption, protected by the OS sandbox and device encryption. Contains no credentials.
3. **Data Sharing** — generalize "your configured S3/Storj endpoints" to the endpoint the user configures, including a self-hosted or custom one. Add that using the app's share action hands the file to whichever app the user picks, outside S3Hub's control.
4. **Third-Party Services** — list all eight with a link to each provider's own privacy policy, plus a note that under Custom / S3-compatible (e.g. self-hosted MinIO) the third party is whoever operates the endpoint the user entered.
5. **Permissions** — add the share permission/interaction. The three existing entries are accurate and stay.
6. **Data Security** — restate to match edit 2: credentials in platform-encrypted storage, metadata in private local storage. Keep the existing HTTPS/TLS sentence.
7. **Date** — `Last updated: July 28, 2026`.

Apply identically to `docs/privacy.html` and `S3Hub/docs/privacy.html`.

## 2.5 Provider policy links

| Provider | Privacy policy |
|---|---|
| Amazon Web Services S3 | https://aws.amazon.com/privacy/ |
| Storj DCS | https://www.storj.io/privacy-policy |
| Cloudflare R2 | https://www.cloudflare.com/privacypolicy/ |
| Backblaze B2 | https://www.backblaze.com/company/privacy.html |
| Wasabi | https://wasabi.com/privacy-policy/ |
| DigitalOcean Spaces | https://www.digitalocean.com/legal/privacy-policy |
| Google Cloud Storage | https://cloud.google.com/terms/cloud-privacy-notice |
| Custom / S3-compatible | Determined by the endpoint operator — no fixed link |

Each URL is verified reachable during implementation; a redirect to a provider's current canonical policy URL is acceptable, a 404 is not.

## 2.6 Out of scope — Android `allowBackup`

`app.json` declares no `allowBackup`, so Android applies its default of `true`. Connection **metadata** could therefore be included in Google cloud backups. Secrets are not meaningfully recoverable that way — the wrapping key lives in the Android Keystore and is non-exportable, so restored ciphertext is undecryptable — and the code already degrades that case gracefully: a metadata entry whose secret is missing hydrates to `{}` rather than throwing (`connectionRepository.js:98-111`), and `writeSplit` refuses to overwrite a healthy stored secret with an empty one (`:130-133`).

**Not changed here.** The fix would live in `app.json`'s `android` block, which Global Constraint 1 puts off-limits. Recorded so a future `dataExtractionRules` / `allowBackup` decision can be made deliberately rather than discovered.

## 2.7 Language

The policy stays **English-only**, by explicit decision, even though the app ships English and Spanish UI. Constraint 3 governs in-app strings routed through i18n; this is a static web page outside that system.

## 2.8 Testing

No automated test — the deliverable is a static document. Verification is manual:

- Both HTML files remain byte-identical to each other (`diff docs/privacy.html S3Hub/docs/privacy.html` is empty).
- Every provider name in the document matches a `name` field in `domain/providers.js`.
- Every link resolves.
- Page renders correctly at mobile width.

## 2.9 Backward compatibility

Not applicable — documentation only. No code path is modified in Part 2.
