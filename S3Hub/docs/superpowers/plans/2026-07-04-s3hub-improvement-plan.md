# S3Hub Improvement Plan

> **STATUS: COMPLETED** — every task below is implemented and merged into `main` (commits `7d0a5a1` … `d63d68b`). Kept for history; do not re-implement.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn S3Hub into a professional, bug-free S3-compatible file manager with a distinctive, accessible visual identity, correct data operations at any scale, and real test coverage across all layers.

**Architecture:** Preserve the existing Clean Architecture (`domain` → `data` → `services` → `context`/`hooks` → `screens`). All S3 protocol knowledge (pagination, delimiters, batching) moves into `services/s3Service`; all provider knowledge stays in `domain/providers`; all error interpretation stays in `domain/errors`. Presentation only orchestrates. A new `theme` design system drives every color and font through `useTheme()`.

**Tech Stack:** Expo SDK 53, React Native 0.79, React 19, React Native Paper v5 (MD3), React Navigation v6, `@aws-sdk/*` **pinned 3.121.0**, Jest + `jest-expo` + `@testing-library/react-native`, i18n-js.

## Global Constraints

Copied verbatim from `CLAUDE.md` — every task's requirements implicitly include these:

1. **Google Play 16KB page size compatibility is mandatory.** Do NOT modify `app.json` native build config keys, `eas.json`, `plugin/with16KPageSize.js`, `plugin/withAndroidPageSize.js`, or `expo-build-properties`. Do not add native modules. (Note: `app.json` non-native metadata like `version`/`userInterfaceStyle` may be edited; the 16KB `plugins`, `android`, and `expo-build-properties` blocks may NOT.)
2. **Do NOT bump `@aws-sdk/*`.** Pinned at `3.121.0` on purpose. New behavior uses existing SDK commands only.
3. **All code, identifiers, and comments in English.** UI strings always go through i18n (`src/locales/translations.js`), never hardcoded.
4. **No new bugs.** Backward compatible with already-stored connections (SecureStore).
5. **TDD:** write the failing test first for every `domain/` and `data/` module, and for new `services/`/`hooks/` logic. Jest + `jest-expo`, tests in `__tests__/` next to the module.
6. **Clean Code / SOLID:** small single-responsibility functions, descriptive English names, no dead code, no stray `console.log`, reuse the provider registry and error mapper, drive all colors from the Paper theme.

**Verification gate for every phase:** `npm test` green, `npm run lint` clean (0 warnings on files touched), and no hardcoded colors/strings introduced.

---

## Phase & Task Overview

- **Phase 0 — Safety & hygiene** (fast, low-risk): remove bogus package, fix upload-cancel crash, missing i18n keys, phantom dependency, config metadata, lint/prettier.
- **Phase 1 — S3 data integrity** (CRITICAL): pagination + delimiter, service-owned folder ops, show all file types, legacy-connection id migration, split secret/metadata connection storage (SecureStore 2KB limit).
- **Phase 2 — Cache & resource correctness**: namespaced media cache, scoped cache clearing, recursive eviction, temp cleanup, presign/TTL mismatch.
- **Phase 3 — State, hooks & error handling**: consolidate effects, cancellation tokens, immutable updates, centralized error mapping, unmount guards.
- **Phase 4 — Design system & theming** (frontend-design led): new light+dark token system, typography, themed navigation chrome, remove hardcoded colors, signature component.
- **Phase 5 — UX & navigation**: keyboard avoidance, SafeArea, navigation/logout flows, list performance, empty states, accessibility.
- **Phase 6 — Test & tooling hardening**: service/hook/screen tests, dependency cleanup, CI/pre-commit.

Phases 1–3 are logic and must land before or alongside 5. Phase 4 (theme) touches mostly different files and can run in parallel after Phase 0. Each task ends with a commit.

---

# Phase 0 — Safety & Hygiene

Low-risk, high-value fixes. No behavior change except removing a crash.

### Task 0.1: Remove the bogus `StatusBar` Cordova package

**Files:**
- Modify: `package.json` (dependency list)

Audit verdict: `StatusBar@^1.0.0` is a Cordova/PhoneGap plugin (`com.tangide.statusbar`, description `"marry plugin description"`), never imported, ignored by Expo, and a supply-chain risk. All real usage is `import { StatusBar } from 'expo-status-bar'`.

- [x] **Step 1:** Grep to confirm zero imports: `grep -rn "from 'StatusBar'" src App.js` → expect no results; `grep -rn "from 'expo-status-bar'" src App.js` → expect the App.js import only.
- [x] **Step 2:** Remove the `"StatusBar": "^1.0.0"` line from `package.json`.
- [x] **Step 3:** `npm install` to update the lockfile.
- [x] **Step 4:** `npm test` and `npx expo start --no-dev --minify` (or `npm run lint`) to confirm nothing broke.
- [x] **Step 5:** Commit: `chore: remove bogus StatusBar cordova package (supply-chain risk)`.

### Task 0.2: Fix upload-cancel crash (DocumentPicker result shape)

**Files:**
- Modify: `src/screens/FileListScreen.js:125`

`expo-document-picker` ~13.1 returns `{ canceled: boolean, assets: DocumentPickerAsset[] | null }`. Current code checks non-existent `result.type` and reads `result.assets.length` when `assets` is `null` on cancel → `TypeError`, shown to the user as "upload error".

- [x] **Step 1:** Change the guard from `if (result.type !== 'cancel' && result.assets.length > 0)` to `if (!result.canceled && result.assets?.length > 0)`.
- [x] **Step 2:** Manually verify (or add a screen test in Phase 6) that cancelling the picker shows no error.
- [x] **Step 3:** Commit: `fix: correct DocumentPicker result handling to prevent cancel crash`.

### Task 0.3: Add missing i18n keys and fix untranslated label

**Files:**
- Modify: `src/locales/translations.js` (both `en` and `es`)
- Modify: `src/screens/FileListScreen.js:496`, `src/screens/ConnectionSelectScreen.js:66`, `src/components/UploadProgressPopup.js:9`

Missing keys used by `t()`: `selectAll`, `close`, `share`. Untranslated literal `'gridView'`. Hardcoded `"Access Key:"` and Spanish default `'Procesando'`.

- [x] **Step 1:** Add to `en`: `selectAll: 'Select all'`, `close: 'Close'`, `share: 'Share'`. Add to `es`: `selectAll: 'Seleccionar todo'`, `close: 'Cerrar'`, `share: 'Compartir'`. Confirm both locales keep identical key sets.
- [x] **Step 2:** `FileListScreen.js:496` — replace the raw `'gridView'` false-branch with `i18n.t('gridView')`.
- [x] **Step 3:** `ConnectionSelectScreen.js:66` — replace `` `Access Key: ${item.accessKey}` `` with `` `${i18n.t('accessKey')}: ${item.accessKey}` ``.
- [x] **Step 4:** `UploadProgressPopup.js:9` — remove the hardcoded `operation = 'Procesando'` default (make callers always pass a translated `operation`; they already do).
- [x] **Step 5:** Remove orphan keys `loading` and `selectService` from both locales (confirmed unused).
- [x] **Step 6:** `npm run lint`, `npm test`. Commit: `fix: complete i18n coverage, remove hardcoded/orphan strings`.

### Task 0.4: Declare phantom dependency `expo-constants`

**Files:**
- Modify: `package.json`

Used at `src/screens/SettingsScreen.js:8` but only resolved transitively today.

- [x] **Step 1:** Add `"expo-constants": "~17.1.6"` to `dependencies` (SDK 53 expected range).
- [x] **Step 2:** `npm install`; run `npx expo-doctor` and confirm no version warnings for it.
- [x] **Step 3:** Commit: `fix: declare expo-constants as a direct dependency`.

### Task 0.5: Reconcile app metadata and enable system dark mode

**Files:**
- Modify: `package.json:3` (`version`), `app.json:5` (`version`), `app.json:7` (`userInterfaceStyle`)

`package.json` says `1.0.0`, `app.json` says `1.2.0`. `userInterfaceStyle: "light"` prevents `useColorScheme()` from ever returning `'dark'`, breaking the "System" theme option that Phase 4 depends on. (This is `app.json` metadata, NOT the protected 16KB native block.)

- [x] **Step 1:** Set both versions to `1.2.0`.
- [x] **Step 2:** Change `app.json` `userInterfaceStyle` from `"light"` to `"automatic"`. Do NOT touch `plugins`, `android`, or `expo-build-properties`.
- [x] **Step 3:** Add missing hygiene fields to `package.json`: `description`, `license`, `repository`; tighten `engines.node` to `">=20"` to match `eas.json`.
- [x] **Step 4:** Commit: `chore: align app version and enable automatic color scheme`.

### Task 0.6: Wire up Prettier and clean lint warnings

**Files:**
- Create: `.prettierrc`
- Modify: `package.json` (scripts), `src/navigation/AppNavigator.js:53`, `src/screens/ConnectionSelectScreen.js:16`, `App.js` (eslint-disable for intentional `import/first`)

- [x] **Step 1:** Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."` scripts.
- [x] **Step 2:** Create `.prettierrc` matching existing style (`{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 100 }`).
- [x] **Step 3:** Remove the unused `language` destructure in `AppNavigator.js:53` (`MainTabs`).
- [x] **Step 4:** `ConnectionSelectScreen.js:16` — fix `!=` → `!==` (fully rewritten in Task 5.6; if Phase 5 runs first, skip here).
- [x] **Step 5:** Add a targeted `/* eslint-disable import/first */` with a comment in `App.js` explaining the polyfills must load first.
- [x] **Step 6:** `npm run lint` → 0 warnings. Commit: `chore: add prettier, resolve lint warnings`.

---

# Phase 1 — S3 Data Integrity (CRITICAL)

These fix silent data loss and truncation. All S3 protocol logic centralizes in `s3Service`. **TDD mandatory** — tests mock `S3Client.send`.

### Task 1.1: Paginating, delimiter-aware listing in `s3Service`

**Files:**
- Modify: `src/services/s3Service.js`
- Create: `src/services/__tests__/s3Service.test.js`
- Modify: `jest.setup.js` if a `send` mock helper is useful

**Interfaces:**
- Produces: `listObjectsPage(connection, bucket, { prefix, delimiter, continuationToken })` → `{ contents: Array, commonPrefixes: Array<string>, nextContinuationToken: string | null, isTruncated: boolean }`
- Produces: `listAllObjects(connection, bucket, { prefix, delimiter })` → `{ contents: Array, commonPrefixes: Array<string> }` (loops until `isTruncated` is false, aggregating all pages)

Root causes fixed: single un-paginated `ListObjectsV2Command` truncates at 1000 objects (data loss on folder delete/download); no `Delimiter` means the whole subtree is pulled instead of the current level.

- [x] **Step 1: Write failing tests.** Mock the S3 client so `send` returns two pages then stops:

```js
// src/services/__tests__/s3Service.test.js
import { listAllObjects, listObjectsPage } from '../s3Service';

jest.mock('../s3Client', () => ({
  getS3Client: jest.fn(),
}));
import { getS3Client } from '../s3Client';

const makeClient = (pages) => {
  let call = 0;
  return { send: jest.fn(async () => pages[call++]) };
};

const connection = { service: 'aws', accessKey: 'A', secretKey: 'S', region: 'us-east-1' };

test('listObjectsPage passes Delimiter and returns commonPrefixes', async () => {
  const client = makeClient([
    { Contents: [{ Key: 'a.txt' }], CommonPrefixes: [{ Prefix: 'sub/' }], IsTruncated: false },
  ]);
  getS3Client.mockReturnValue(client);
  const res = await listObjectsPage(connection, 'bucket', { prefix: '', delimiter: '/' });
  const sentInput = client.send.mock.calls[0][0].input;
  expect(sentInput.Delimiter).toBe('/');
  expect(res.commonPrefixes).toEqual(['sub/']);
  expect(res.contents).toHaveLength(1);
});

test('listAllObjects loops until IsTruncated is false', async () => {
  const client = makeClient([
    { Contents: [{ Key: '1' }], IsTruncated: true, NextContinuationToken: 'T1' },
    { Contents: [{ Key: '2' }], IsTruncated: true, NextContinuationToken: 'T2' },
    { Contents: [{ Key: '3' }], IsTruncated: false },
  ]);
  getS3Client.mockReturnValue(client);
  const res = await listAllObjects(connection, 'bucket', { prefix: 'p/' });
  expect(res.contents.map((c) => c.Key)).toEqual(['1', '2', '3']);
  // second/third calls must forward the ContinuationToken
  expect(client.send.mock.calls[1][0].input.ContinuationToken).toBe('T1');
  expect(client.send.mock.calls[2][0].input.ContinuationToken).toBe('T2');
});
```

- [x] **Step 2:** Run `npm test src/services/__tests__/s3Service.test.js` → FAIL (functions not exported). *(If `getS3Client` is not the current factory name, adjust the mock to the real `s3Client` export first.)*
- [x] **Step 3: Implement.** Add to `s3Service.js`:

```js
export async function listObjectsPage(connection, bucket, { prefix = '', delimiter, continuationToken } = {}) {
  const client = getS3Client(connection);
  const input = { Bucket: bucket, Prefix: prefix };
  if (delimiter) input.Delimiter = delimiter;
  if (continuationToken) input.ContinuationToken = continuationToken;
  const response = await client.send(new ListObjectsV2Command(input));
  return {
    contents: response.Contents ?? [],
    commonPrefixes: (response.CommonPrefixes ?? []).map((p) => p.Prefix),
    nextContinuationToken: response.NextContinuationToken ?? null,
    isTruncated: Boolean(response.IsTruncated),
  };
}

export async function listAllObjects(connection, bucket, { prefix = '', delimiter } = {}) {
  const contents = [];
  const commonPrefixes = [];
  let continuationToken;
  do {
    const page = await listObjectsPage(connection, bucket, { prefix, delimiter, continuationToken });
    contents.push(...page.contents);
    commonPrefixes.push(...page.commonPrefixes);
    continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (continuationToken);
  return { contents, commonPrefixes };
}
```

- [x] **Step 4:** Run tests → PASS.
- [x] **Step 5:** Commit: `feat(s3): add paginating, delimiter-aware object listing`.

### Task 1.2: Folder-level listing for the current level (delimiter) + all-objects for recursion

**Files:**
- Modify: `src/domain/fileListMapper.js`, `src/domain/__tests__/fileListMapper.test.js`
- Modify: `src/hooks/useFileList.js` (call the delimiter listing for the visible level)

Folders should come from `commonPrefixes`, not be inferred from a recursive `Contents` scan. Files at the current level come from `contents`.

- [x] **Step 1: Update mapper tests.** `parseObjects` should accept `{ contents, commonPrefixes, prefix }` and return folder items from `commonPrefixes` and file items from `contents` (all types, see Task 1.3). Write failing tests for: folders derived from `commonPrefixes`; files at current level only; keys with spaces/unicode/`+`.
- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:** Refactor `parseObjects(listing, currentPath)` to build folder rows from `commonPrefixes` (strip the current prefix, mark `isFolder: true`) and file rows from `contents` (strip prefix for display name, keep full `Key`). Keep `dedupeById`.
- [x] **Step 4:** In `useFileList.fetchFiles`, call `listAllObjects(connection, bucket, { prefix, delimiter: '/' })` for the current level (delimiter caps the result to this level's files + immediate folders, and pagination guarantees completeness).
- [x] **Step 5:** Run → PASS. Commit: `feat(files): list current folder level via CommonPrefixes with full pagination`.

### Task 1.3: Show all object types (general file manager)

**Files:**
- Modify: `src/domain/fileListMapper.js`, `src/domain/__tests__/fileListMapper.test.js`
- Modify: `src/components/FileItem.js` (generic icon + type detection), `src/domain/fileListMapper.js` (add `fileType`/`mediaType`)

Product decision: S3Hub is a full file manager. Today `parseObjects` drops non-media keys entirely — invisible, undeletable individually, but silently deleted as folder contents.

- [x] **Step 1:** Add a pure helper `classifyKey(key)` → `'image' | 'video' | 'audio' | 'document' | 'archive' | 'other'` (extension-based) with tests, replacing the boolean-returning `isMediaKey`/leaky `isVideoKey`. Use `/regex/.test(key)` and guard non-string input.
- [x] **Step 2:** `parseObjects` includes every object with `mediaType` from `classifyKey`; only `image`/`video` get on-demand preview URLs later.
- [x] **Step 3:** `FileItem.js` renders a `MaterialCommunityIcons` glyph per `mediaType` (`file-image`, `movie`, `music`, `file-document`, `folder-zip`, `file`) for non-preview types; preview thumbnails only for image/video.
- [x] **Step 4:** Run tests → PASS. Commit: `feat(files): display and manage all object types, not just media`.

### Task 1.4: Move recursive folder download/delete into `s3Service` (with batching)

**Files:**
- Modify: `src/services/s3Service.js`, `src/services/__tests__/s3Service.test.js`
- Modify: `src/screens/FileListScreen.js` (call service, keep only progress/UI)

**Interfaces:**
- Produces: `deleteObjects(connection, bucket, keys)` — chunks keys into batches of `S3_DELETE_BATCH_SIZE` (1000) and issues `DeleteObjectsCommand` per batch; returns `{ deleted: number, errors: Array }`.
- Produces: `deleteFolderRecursive(connection, bucket, prefix)` — `listAllObjects` (no delimiter) then `deleteObjects`.
- Produces: `listAllUnderPrefix(connection, bucket, prefix)` — thin wrapper over `listAllObjects` for folder download.
- Add constant `S3_DELETE_BATCH_SIZE = 1000` in `src/config/cacheConfig.js` (or a new `src/config/s3Config.js`).

Fixes the CRITICAL silent partial delete (>1000 objects) and removes S3 protocol details from the screen.

- [x] **Step 1:** Failing tests: `deleteObjects` splits 2500 keys into 3 `DeleteObjectsCommand` calls (1000/1000/500) and aggregates; `deleteFolderRecursive` lists all pages then deletes all.
- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:** Implement `deleteObjects`, `deleteFolderRecursive`, `listAllUnderPrefix` using `listAllObjects` + `DeleteObjectsCommand`. Collect per-object `Errors` from the response.
- [x] **Step 4:** Refactor `FileListScreen` `downloadFolder` (`:231-257`) and folder-delete (`:292-309`, `:422-431`) to call these; the screen only maps progress and reports partial failures.
- [x] **Step 5:** Run → PASS. Commit: `refactor(s3): own recursive folder delete/download and batching in service`.

### Task 1.5: Backfill missing `id` on legacy connections (migration)

**Files:**
- Modify: `src/data/connectionRepository.js`, `src/data/__tests__/connectionRepository.test.js`
- Modify: `src/domain/cacheKeys.js` (stable id derivation helper), `src/domain/__tests__/cacheKeys.test.js`
- Modify: `src/context/AuthContext.js` (run migration on load)

Golden-rule backward compat: connections stored by the pre-refactor version have `id === undefined`, causing cache-namespace collisions (cross-account data bleed) and broken delete/active-highlight.

- [x] **Step 1:** Add pure `deriveConnectionId(connection)` in `domain` → stable id from `service + accessKey + region + endpoint` (deterministic, no `Date.now()`); test collisions and stability.
- [x] **Step 2:** In `connectionRepository.getConnections`, backfill any missing/duplicate `id` via `deriveConnectionId` (in memory) and wrap `JSON.parse` in try/catch that salvages instead of nuking. Test with legacy fixtures (no `id`) and corrupt JSON. (Persisting the backfilled ids happens as part of the storage-format migration in Task 1.6.)
- [x] **Step 3:** Ensure `AuthContext` uses the backfilled list; `deleteConnection`/active-highlight now compare stable ids.
- [x] **Step 4:** Run → PASS. Commit: `fix(data): backfill stable ids for legacy connections, guard corrupt store`.

### Task 1.6: Split connection storage — secrets in SecureStore, metadata in AsyncStorage

**Files:**
- Create: `src/domain/connectionStorage.js`, `src/domain/__tests__/connectionStorage.test.js`
- Modify: `src/data/connectionRepository.js`, `src/data/__tests__/connectionRepository.test.js`
- Modify: `src/context/AuthContext.js` (store only `currentConnectionId`; hydrate on load)

**Interfaces:**
- Produces (pure domain): `toStorageEntry(connection)` → `{ meta, secret }` where `meta` = non-secret fields (`id, service, provider, region, endpoint, bucket, label, preview:boolean`) and `secret` = `{ accessKey, secretKey }`.
- Produces (pure domain): `fromStorageEntry(meta, secret)` → full connection object.
- Repository keeps its existing public API unchanged: `getConnections()`, `saveConnections(connections)`, `deleteConnection(id)`, `getCurrentConnection()`/`setCurrentConnection(...)` — only the internal storage layout and a one-time migration change, so `AuthContext`/screens need minimal edits.

Root cause: `saveConnections` serializes the **entire** connections array (including all secrets) into a single SecureStore value. SecureStore warns/fails above ~2048 bytes, so ~8–12 connections silently fail to persist. Fix: store each connection's secret under its own SecureStore key (`conn_secret_<id>`, ~150–250 bytes each — always under the limit) and the non-secret metadata array in AsyncStorage. Backward compatibility (golden rule) is preserved by a transparent one-time migration from the legacy single-blob format. Also normalizes the `preview` string-vs-boolean bug during migration.

- [x] **Step 1: Write failing tests for the pure helper.**

```js
// src/domain/__tests__/connectionStorage.test.js
import { toStorageEntry, fromStorageEntry } from '../connectionStorage';

const conn = {
  id: 'abc', service: 'aws', region: 'us-east-1', bucket: 'b',
  accessKey: 'AKIA', secretKey: 'SECRET', preview: 'true',
};

test('toStorageEntry separates secrets from metadata and normalizes preview', () => {
  const { meta, secret } = toStorageEntry(conn);
  expect(secret).toEqual({ accessKey: 'AKIA', secretKey: 'SECRET' });
  expect(meta.accessKey).toBeUndefined();
  expect(meta.secretKey).toBeUndefined();
  expect(meta.preview).toBe(true); // string 'true' -> boolean
  expect(meta.id).toBe('abc');
});

test('fromStorageEntry reassembles a full connection', () => {
  const { meta, secret } = toStorageEntry(conn);
  const round = fromStorageEntry(meta, secret);
  expect(round.accessKey).toBe('AKIA');
  expect(round.secretKey).toBe('SECRET');
  expect(round.region).toBe('us-east-1');
});
```

- [x] **Step 2:** Run `npm test src/domain/__tests__/connectionStorage.test.js` → FAIL (module missing).
- [x] **Step 3: Implement the pure helper.**

```js
// src/domain/connectionStorage.js
const META_FIELDS = ['id', 'service', 'provider', 'region', 'endpoint', 'bucket', 'label'];

export function toStorageEntry(connection) {
  const meta = {};
  for (const field of META_FIELDS) {
    if (connection[field] !== undefined) meta[field] = connection[field];
  }
  meta.preview = connection.preview === true || connection.preview === 'true';
  return {
    meta,
    secret: { accessKey: connection.accessKey, secretKey: connection.secretKey },
  };
}

export function fromStorageEntry(meta, secret) {
  return { ...meta, accessKey: secret.accessKey, secretKey: secret.secretKey };
}
```

- [x] **Step 4:** Run → PASS.
- [x] **Step 5: Write failing repository tests** (mock `expo-secure-store` and `@react-native-async-storage/async-storage`): (a) a legacy single-blob SecureStore value under key `connections` is migrated — secrets land under `conn_secret_<id>`, metadata under AsyncStorage `connections_meta`, and the legacy key is deleted; (b) `getConnections()` after migration hydrates full connections; (c) a corrupt legacy blob is dropped without throwing; (d) `saveConnections` of 20 connections writes 20 separate secret keys (none exceeds 2048 bytes); (e) `deleteConnection(id)` removes both the metadata entry and the secret key.

- [x] **Step 6:** Run → FAIL.
- [x] **Step 7: Implement the split repository + one-time migration.** Reuse `deriveConnectionId` (Task 1.5) for any legacy connection missing an `id`:

```js
// src/data/connectionRepository.js (core of the refactor)
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deriveConnectionId } from '../domain/cacheKeys';
import { toStorageEntry, fromStorageEntry } from '../domain/connectionStorage';

const LEGACY_KEY = 'connections';        // old: full array (with secrets) in SecureStore
const META_KEY = 'connections_meta';     // new: metadata array in AsyncStorage
const SECRET_PREFIX = 'conn_secret_';    // new: per-connection secret in SecureStore

async function writeSplit(connections) {
  const metas = [];
  for (const conn of connections) {
    const { meta, secret } = toStorageEntry(conn);
    metas.push(meta);
    await SecureStore.setItemAsync(SECRET_PREFIX + meta.id, JSON.stringify(secret));
  }
  await AsyncStorage.setItem(META_KEY, JSON.stringify(metas));
}

async function migrateIfNeeded() {
  const legacy = await SecureStore.getItemAsync(LEGACY_KEY);
  if (!legacy) return; // already migrated or fresh install
  let parsed;
  try {
    parsed = JSON.parse(legacy);
  } catch {
    await SecureStore.deleteItemAsync(LEGACY_KEY); // corrupt: drop, don't crash
    return;
  }
  const list = (Array.isArray(parsed) ? parsed : []).map((c) => ({
    ...c,
    id: c.id || deriveConnectionId(c),
  }));
  await writeSplit(list);
  await SecureStore.deleteItemAsync(LEGACY_KEY);
}

export async function getConnections() {
  await migrateIfNeeded();
  let metas = [];
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    metas = raw ? JSON.parse(raw) : [];
  } catch {
    metas = [];
  }
  const result = [];
  for (const meta of metas) {
    let secret = {};
    try {
      const raw = await SecureStore.getItemAsync(SECRET_PREFIX + meta.id);
      secret = raw ? JSON.parse(raw) : {};
    } catch {
      secret = {};
    }
    result.push(fromStorageEntry(meta, secret));
  }
  return result;
}

export async function saveConnections(connections) {
  await writeSplit(connections);
}

export async function deleteConnection(id) {
  const next = (await getConnections()).filter((c) => c.id !== id);
  await AsyncStorage.setItem(
    META_KEY,
    JSON.stringify(next.map((c) => toStorageEntry(c).meta)),
  );
  await SecureStore.deleteItemAsync(SECRET_PREFIX + id);
}
```

- [x] **Step 8:** Update the "current connection" persistence to store only `currentConnectionId` (AsyncStorage) and hydrate from `getConnections()` — the full secret is no longer duplicated in a second SecureStore value. Adjust `AuthContext.getCurrentConnection`/`setActiveConnection` accordingly.
- [x] **Step 9:** Run all tests → PASS. Verify migration is idempotent (second `getConnections()` call performs no migration, legacy key already gone).
- [x] **Step 10:** Commit: `feat(data): split connection storage (per-connection secrets) with transparent migration`.

---

# Phase 2 — Cache & Resource Correctness

### Task 2.1: Namespace the media disk cache by connection + bucket

**Files:**
- Modify: `src/services/mediaCache.js`, `src/components/FileItem.js`, `src/components/MediaViewerModal.js`, `src/components/CachedImage.js`, `src/components/CachedVideo.js`
- Modify: `src/domain/cacheKeys.js` (reuse for media path), tests

Bug: media cache path is `${CACHE_DIR}${item.key}` — two buckets/connections with `photos/1.jpg` collide and serve the wrong bytes.

- [x] **Step 1:** Add `mediaCacheKey(connectionId, bucket, key)` (pure) → a collision-free, filesystem-safe path segment (hash or encode). Test uniqueness across connections/buckets.
- [x] **Step 2:** Thread `connectionId` + `bucket` to `cacheKey` props in `FileItem`/`MediaViewerModal`; `mediaCache.getCachedFileUri` uses the namespaced path.
- [x] **Step 3:** Commit: `fix(cache): namespace media cache by connection and bucket`.

### Task 2.2: Scope cache clearing to `files_` keys (stop wiping all AsyncStorage)

**Files:**
- Modify: `src/services/mediaCache.js:39-50`, `src/data/fileCacheRepository.js:55-61`, tests

Bug: `AsyncStorage.clear()` deletes ALL app data on background and every bucket change.

- [x] **Step 1:** Failing test: clearing removes only `files_`-prefixed keys, leaves others.
- [x] **Step 2:** Replace `AsyncStorage.clear()` with `getAllKeys()` → filter `files_` → `multiRemove`. Keep filesystem-dir clearing for media.
- [x] **Step 3:** Consolidate to one owner (media-cache service); remove the now-redundant `fileCacheRepository.clearAllCache` if unused.
- [x] **Step 4:** Commit: `fix(cache): scope cache clearing to file-list keys only`.

### Task 2.3: Recursive, robust media-cache eviction

**Files:**
- Modify: `src/services/mediaCache.js:61-72`, tests

Bugs: eviction only scans top-level; nested cached media (`album/photo.jpg`) never expires; `modificationTime * 1000` → `NaN` when undefined disables expiry.

- [x] **Step 1:** Recurse into subdirectories; guard `modificationTime` (fall back to deleting on missing timestamp or use `getInfoAsync` size/`md5`). Test with nested fixtures and missing `modificationTime`.
- [x] **Step 2:** Commit: `fix(cache): recursive eviction with safe modification-time handling`.

### Task 2.4: Clean up download temp files; avoid presigned-URL staleness

**Files:**
- Modify: `src/screens/FileListScreen.js` (download flow), `src/services/s3Service.js` (presign), `src/hooks/useFileList.js` (don't persist `url`)

Bugs: downloads to `documentDirectory` are never deleted (unbounded growth, same-name collisions); presigned URLs (1h) are cached 7 days → 403 SignatureExpired on cache hit; persisting signed URLs to unencrypted AsyncStorage is a secret-at-rest concern.

- [x] **Step 1:** After copying a download to the gallery, delete the temp file; write temp files to `cacheDirectory` with a unique suffix.
- [x] **Step 2:** Stop persisting `url` in the file-list cache; regenerate presigned URLs on load/on demand. (Or set list-cache TTL below presign TTL — prefer regeneration.)
- [x] **Step 3:** Commit: `fix(cache): clean download temp files and stop persisting presigned URLs`.

---

# Phase 3 — State, Hooks & Error Handling

### Task 3.1: Consolidate `useFileList` effects; per-fetch cancellation

**Files:**
- Modify: `src/hooks/useFileList.js:169-226`
- Create: `src/hooks/__tests__/useFileList.test.js` (renderHook)

Bugs: two effects both fetch on mount (double network burst + `clearEntireCache` race); shared `isMounted` ref causes stale-response render (wrong folder shown when navigating fast).

- [x] **Step 1:** Failing renderHook tests: a single fetch per bucket/connection/path change; a slow previous fetch does not overwrite the new path's state.
- [x] **Step 2:** Merge into one effect keyed on `[connection, bucket, path]`; use a local `let active = true` cancellation token per run (not a shared ref); clear cache only when connection/bucket actually changed (compare previous via ref). Remove the two `exhaustive-deps` suppressions by including the stable `useCallback` `fetchFiles`.
- [x] **Step 3:** Commit: `fix(hooks): single fetch effect with per-run cancellation`.

### Task 3.2: Immutable `setMediaFileUrl`

**Files:**
- Modify: `src/hooks/useFileList.js:157-165`, test

Bug: mutates `prev[index].url` in place and returns same reference → memoized consumers won't re-render.

- [x] **Step 1:** Failing test: calling `setMediaFileUrl(index, url)` returns a new array with a new element object.
- [x] **Step 2:** Return `prev.map((it, i) => (i === index ? { ...it, url } : it))`.
- [x] **Step 3:** Commit: `fix(hooks): update media URL immutably`.

### Task 3.3: Route all operation errors through `mapS3Error`; report partial failures

**Files:**
- Modify: `src/screens/FileListScreen.js` (upload/download/delete/folder handlers), `src/services/authService.js`, `src/domain/errors.js`, tests

Bugs: screen ignores `mapS3Error` and shows blanket messages; several catches only `console.error` and swallow (partial download reported as full success); `authService` duplicates error-name logic and returns `false` for accounts with zero buckets; `mapS3Error` maps every no-status error to `errorNetwork` (dead `message.includes('Network')` branch).

- [x] **Step 1:** `errors.js` — reserve `errorNetwork` for known network/timeout names + offline; unknown no-status → `errorGeneric`; add `SignatureExpired`/`ExpiredToken`/`RequestTimeTooSkewed` mappings. Update tests.
- [x] **Step 2:** `authService.validateCredentials` — throw and let the caller `mapS3Error`, or reuse `NAME_TO_KEY`; treat a successful non-error response (even empty `Buckets`) as valid.
- [x] **Step 3:** `FileListScreen` handlers — surface `i18n.t(mapS3Error(error))`; track per-file success/failure and report partial results instead of unconditional success.
- [x] **Step 4:** Remove `console.log(response)` (`s3Service.js:85`) and stop logging full error objects containing presigned URLs/credentials.
- [x] **Step 5:** Commit: `fix(errors): centralize error mapping, report partial failures, stop leaking URLs`.

### Task 3.4: Unmount guards + concurrency guards for uploads/deletes

**Files:**
- Modify: `src/screens/FileListScreen.js:129-176,289-322`

Bugs: progress `setState` fires after unmount; single shared progress state interleaves concurrent ops; FAB not disabled during in-flight op.

- [x] **Step 1:** Add an `isMounted` ref guard around progress `setState`; disable the upload FAB / delete action while an operation is in flight.
- [x] **Step 2:** Commit: `fix(files): guard progress state against unmount and concurrent ops`.

### Task 3.5: Remove dead code and residual anti-patterns

**Files:**
- Modify: `src/services/s3Service.js:25-31` (dead `service === 'storj'` branch), `:67-91` (`uploadFile` + `buffer` import if unused), `src/services/authService.js:25` & `src/context/AuthContext.js:111,113` (Spanish comments), `src/domain/fileListMapper.js:84-96` (`dedupeById` `Date.now()` → counter)

- [x] **Step 1:** Confirm `uploadFile` has no callers (live path is presigned upload); remove it and the now-unused `buffer` import. Remove the no-op storj branch (`return response.Buckets;`).
- [x] **Step 2:** Translate Spanish comments/logs to English. Make `dedupeById` deterministic with an incrementing suffix.
- [x] **Step 3:** `npm test`, `npm run lint`. Commit: `refactor: remove dead code and residual anti-patterns`.

### Task 3.6: Memoize `AuthContext` value

**Files:**
- Modify: `src/context/AuthContext.js:121-136`

- [x] **Step 1:** Wrap handlers in `useCallback` and the `value` object in `useMemo` to stop re-rendering every consumer on unrelated changes.
- [x] **Step 2:** Commit: `perf(context): memoize AuthContext value and handlers`.

---

# Phase 4 — Design System & Theming (frontend-design)

> This phase gives S3Hub a distinctive identity. It touches `theme/`, `App.js`, `navigation/`, and the color/font usage in every component. It can run in parallel with Phases 1–3 (different files), but merge after them.

## Design direction (to validate at implementation start)

**Subject & audience:** a multi-cloud object-storage manager for developers, sysadmins, and prosumers. Its world is buckets, object keys, regions, endpoints, byte sizes — a calm, infrastructural, trustworthy tool. The reported failure of the current UI is that it reads as a default Material template (blanket `#6200EE`, background ≈ surface).

**Concept — "Deep storage":** a cool slate foundation (data at rest) with a single warm **amber signal** accent for actions (upload / primary / active). Warm-on-cool is deliberately un-Material and avoids the three AI defaults (cream+serif, near-black+acid-green, broadsheet). Boldness is spent in exactly one place: the amber signal + the provider-spine signature; everything else stays disciplined.

**Color tokens (MD3, consumed only via `useTheme()`):**

Dark (primary experience):
- `background #0E1116` → `surface #161B22` → `surfaceVariant #1E2530` → `elevation.level2 #232B37` (a real, visible ramp — the missing layering)
- `onBackground/onSurface #E7ECF3` (~14:1), `onSurfaceVariant #9AA6B4` (~7:1, replaces `#666`)
- `primary #E8973A` (amber signal), `onPrimary #241800` (dark label, ~9:1 on amber — fixes today's ~2:1 dark-on-purple buttons)
- `secondary #6FA8DC` (info/links on dark), `error #FF6B6B`, `onError #2A0000`, `outline #38414D`

Light:
- `background #F5F7FA` (cool off-white, not cream) → `surface #FFFFFF` → `surfaceVariant #E7ECF2`
- `onBackground/onSurface #10151C`, `onSurfaceVariant #55606E` (~7:1)
- `primary #B4650F` (deepened amber so white or dark labels pass AA), `onPrimary #FFFFFF`
- `secondary #2A6FB0`, `error #BA1A1A`, `outline #C2CAD4`

**Typography (bundled via `expo-font`, no native module):** display **Space Grotesk** (headers/titles — technical character), body **Inter** (legible UI text), mono **JetBrains Mono** (object keys, region codes, byte sizes, endpoints — honors the storage vernacular). Set an explicit type scale via Paper's `configureFonts`.

**Signature element — the provider spine:** each connection/bucket/row carries a thin left spine bar tinted with the provider's brand color (from `domain/providers`), plus a monospace region/endpoint tag. Structure encodes real information (which provider, which region) rather than decoration.

### Task 4.1: Split light/dark token themes

**Files:**
- Modify: `src/theme/theme.js`
- Create: `src/theme/__tests__/theme.test.js`

- [x] **Step 1:** Failing test: `lightTheme.colors.onPrimary` contrasts ≥4.5:1 with `primary`; `darkTheme.colors.surface !== darkTheme.colors.background`; no shared blanket `primary` across schemes. (A small pure `contrastRatio(hex, hex)` helper in `domain` makes this testable.)
- [x] **Step 2:** Define separate `lightTheme`/`darkTheme` from `MD3LightTheme`/`MD3DarkTheme` with the token maps above and an `elevation` ramp. Remove the `accent` legacy token; expose `secondary`/`secondaryContainer`.
- [x] **Step 3:** Commit: `feat(theme): distinct AA-compliant light and dark palettes`.

### Task 4.2: Bundle fonts and configure Paper type scale

**Files:**
- Modify: `App.js` (load fonts via `expo-font`/`useFonts`), `src/theme/theme.js` (`configureFonts`)
- Add font assets under `assets/fonts/`

- [x] **Step 1:** Add Space Grotesk, Inter, JetBrains Mono to `assets/fonts`; load with `useFonts`; render a splash/loader until ready.
- [x] **Step 2:** `configureFonts` mapping display/body/label roles; add a `mono` style used for keys/regions/sizes.
- [x] **Step 3:** Commit: `feat(theme): bundle Space Grotesk/Inter/JetBrains Mono and configure type scale`.

### Task 4.3: Theme the navigation chrome

**Files:**
- Modify: `App.js:34` (`NavigationContainer` theme via `adaptNavigationTheme`), `src/navigation/AppNavigator.js` (tab bar style/tints, status bar)

- [x] **Step 1:** Build a React Navigation theme from the Paper theme (`adaptNavigationTheme` + merge) so background/card/text/border/primary match; no light flash in dark mode.
- [x] **Step 2:** Set `tabBarStyle`, `tabBarActiveTintColor`/`inactiveTintColor` from `useTheme()`; relabel tabs on language change (key navigator on `language` or drive via context).
- [x] **Step 3:** Set `StatusBar` style from the scheme.
- [x] **Step 4:** Commit: `feat(theme): themed navigation container, tab bar, and status bar`.

### Task 4.4: Remove every hardcoded color; consume `useTheme()`

**Files:**
- Modify: `src/components/UploadProgressPopup.js` (drop static light-theme import → `useTheme`), `src/components/FileItem.js` (`#fff`/`#ccc`/`#666`/`rgba` + uncolored `Text`), `src/screens/BucketSelectScreen.js:128` (`#e0f7fa`), `src/screens/FileListScreen.js:656` (`'red'` → `error`), all screen titles (add `onBackground`/`onSurface`), loaders (themed background), `MediaViewerModal.js:132` (`accent` → `secondaryContainer`)

- [x] **Step 1:** Grep for offenders: `grep -rnE "#[0-9a-fA-F]{3,6}|'red'|rgba\(" src/components src/screens` → replace each with a theme token. Give every `Text` an explicit `onSurface`/`onBackground`/`onSurfaceVariant` color.
- [x] **Step 2:** Rewrite `UploadProgressPopup` to use `useTheme()` and `Surface` elevation.
- [x] **Step 3:** Themed loader backgrounds (no white flash in dark).
- [x] **Step 4:** Commit: `fix(theme): drive all colors from the Paper theme (dark-mode legibility)`.

### Task 4.5: Provider-spine signature component

**Files:**
- Create: `src/components/ProviderSpine.js`, `src/components/__tests__/ProviderSpine.test.js`
- Modify: `src/domain/providers.js` (add a `brandColor` field per provider), `ConnectionSelectScreen.js`, `BucketSelectScreen.js`, `FileItem.js`

- [x] **Step 1:** Add `brandColor` to each provider in the registry (AWS `#FF9900`, Storj `#2683FF`, R2 `#F6821F`, B2 `#E21E29`, Wasabi `#00B04F`, DO `#0080FF`, GCS `#4285F4`, custom → theme `primary`). Test the registry has a color for every provider.
- [x] **Step 2:** Build `ProviderSpine` (thin left bar in `brandColor`) + a monospace region/endpoint tag; apply to connection/bucket rows.
- [x] **Step 3:** Commit: `feat(ui): provider-spine signature and monospace region tags`.

---

# Phase 5 — UX & Navigation

### Task 5.1: Keyboard avoidance on LoginScreen (the reported bug)

**Files:**
- Modify: `src/screens/LoginScreen.js:199-264`

- [x] **Step 1:** Wrap the form in `KeyboardAvoidingView` (`behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`) + `ScrollView` with `keyboardShouldPersistTaps="handled"` and `contentContainerStyle={{ flexGrow: 1 }}` so provider/region `Menu` and the Login button stay reachable with the keyboard open.
- [x] **Step 2:** Manually verify on a small device: secret-key field, region control, and Login button remain visible/tappable.
- [x] **Step 3:** Commit: `fix(login): keyboard no longer covers inputs and the login button`.

### Task 5.2: Keyboard avoidance for the create-folder dialog

**Files:**
- Modify: `src/screens/FileListScreen.js:564-580`

- [x] **Step 1:** Wrap the Paper `Dialog` content in `KeyboardAvoidingView`; verify the TextInput stays above the keyboard on small screens.
- [x] **Step 2:** Commit: `fix(files): keep create-folder input above the keyboard`.

### Task 5.3: Replace per-screen `marginTop` with SafeArea

**Files:**
- Modify: `LoginScreen.js:272`, `SettingsScreen.js:117`, `BucketSelectScreen.js:110`, `ConnectionSelectScreen.js:103`, `FileListScreen.js:609`

- [x] **Step 1:** Remove hardcoded `marginTop` (24–40) and rely on the existing `SafeAreaView`/`useSafeAreaInsets()`; use navigation headers where a title bar is wanted.
- [x] **Step 2:** Commit: `fix(ui): use SafeArea insets instead of hardcoded top margins`.

### Task 5.4: Fix login redirect and first-login flow

**Files:**
- Modify: `src/screens/LoginScreen.js:59`, `src/navigation/AppNavigator.js`

Bug: `navigation.navigate('Connections')` targets a route that doesn't exist in the root stack pre-login; it "works" only by the context swap racing the remount.

- [x] **Step 1:** For first login, don't navigate manually — let the conditional root in `AppNavigator` mount `MainTabs` when `currentConnection` is set. For "add connection from tabs", `navigation.goBack()` (or `reset` to `Connections`).
- [x] **Step 2:** Commit: `fix(nav): drive post-login routing from auth state, remove dead navigate`.

### Task 5.5: Add logout and safe active-connection deletion

**Files:**
- Modify: `src/screens/SettingsScreen.js`, `src/context/AuthContext.js:39-53`, `src/navigation/AppNavigator.js`

Bug: no logout anywhere; deleting the active connection while on the Files tab yanks the focused tab.

- [x] **Step 1:** Add a `logout` action (clears `currentConnection`) and a Settings entry (i18n key `logout`).
- [x] **Step 2:** On deleting the active connection, `navigation.reset` to the Connections tab; guard tab removal so the focused route isn't unmounted underneath the user.
- [x] **Step 3:** Commit: `feat(nav): add logout and safe active-connection deletion`.

### Task 5.6: Fix connection selection and single-bucket auto-nav loop

**Files:**
- Modify: `src/screens/ConnectionSelectScreen.js:16-22`, `src/screens/BucketSelectScreen.js:33-39`

Bugs: `!=` loose compare on `accessKey` only, dead conditional, unguarded null `currentConnection`; single-bucket auto-navigate fires on every `currentConnection` change → Buckets tab bounces back to Files.

- [x] **Step 1:** Rewrite selection: `if (currentConnection?.id !== connection.id) await setActiveConnection(connection); navigation.navigate('BucketsTab');`.
- [x] **Step 2:** Guard single-bucket auto-nav with a `useRef` so it runs once, not on every focus/change. Fix the `react-hooks/exhaustive-deps` warning on `fetchBuckets`.
- [x] **Step 3:** Commit: `fix(nav): correct connection selection and single-bucket auto-navigation`.

### Task 5.7: FlatList performance and stable callbacks

**Files:**
- Modify: `src/screens/FileListScreen.js:532-554`, `src/components/FileItem.js`, `src/components/MediaViewerModal.js:32,97-99`

- [x] **Step 1:** `React.memo` `FileItem`; add `getItemLayout` for the fixed-size grid; tune `windowSize`/`removeClippedSubviews`.
- [x] **Step 2:** In `MediaViewerModal`, stabilize `onViewableItemsChanged`/`viewabilityConfig` via `useRef`; replace module-load `Dimensions.get` with `useWindowDimensions`.
- [x] **Step 3:** Wrap `visibleFiles`/`sortFiles` in `useMemo` (`useFileList.js:230-234`).
- [x] **Step 4:** Commit: `perf(files): memoized rows, stable list callbacks, responsive dimensions`.

### Task 5.8: Empty states, pull-to-refresh, secret visibility, accessibility

**Files:**
- Modify: `ConnectionSelectScreen.js` (empty state), `FileListScreen.js` (`onRefresh`), `LoginScreen.js:209-225` (secret show/hide + `autoComplete="off"`), various (accessibility labels/roles)

- [x] **Step 1:** Add a first-run empty state to `ConnectionSelectScreen`; add `RefreshControl` to the file list for network-loss recovery.
- [x] **Step 2:** Add a `TextInput.Icon` eye toggle to the secret-key field; set `autoCorrect={false}`/`autoComplete="off"` on credential fields.
- [x] **Step 3:** Add `accessibilityRole="button"`/labels to `FileItem` touchables, FABs, and provider/region buttons; mark titles `accessibilityRole="header"`.
- [x] **Step 4:** Commit: `feat(ux): empty states, pull-to-refresh, secret visibility, a11y labels`.

---

# Phase 6 — Test & Tooling Hardening

### Task 6.1: Service, hook, and screen test coverage

**Files:**
- Create: `src/services/__tests__/s3Service.test.js` (extend from Phase 1), `src/services/__tests__/authService.test.js`, `src/hooks/__tests__/useFileList.test.js`, `src/hooks/__tests__/useFileSelection.test.js`, `src/screens/__tests__/FileListScreen.test.js`

- [x] **Step 1:** `s3Service`: pagination loop, delimiter, `deleteObjects` batching (already partly in Phase 1) — ensure full branch coverage.
- [x] **Step 2:** `useFileList`: single-fetch, cancellation race, immutable media URL, client-side pagination bound.
- [x] **Step 3:** `FileListScreen`: DocumentPicker cancel (`{canceled:true, assets:null}`) shows no error; partial download reports partial failure.
- [x] **Step 4:** Extend `fileListMapper`/`cacheKeys`/`errors` tests for unicode/space keys, legacy `id`, expired-signature error names.
- [x] **Step 5:** Commit: `test: cover services, hooks, and critical screen flows`.

### Task 6.2: Dependency cleanup and doctor

**Files:**
- Modify: `package.json`

- [x] **Step 1:** Run `npx expo-doctor`. Remove confirmed-unused deps: `uuid`, `expo-intent-launcher`; decide on `expo-localization` (wire device-locale detection or remove dep + plugin) and `expo-image`/`expo-font`/`expo-asset` per doctor output. Do NOT touch `@aws-sdk/*`.
- [x] **Step 2:** Note `expo-av` deprecation for the next SDK bump (migrate to `expo-video`/`expo-audio` later — out of scope here).
- [x] **Step 3:** Commit: `chore(deps): remove unused dependencies, run expo-doctor`.

### Task 6.3: CI / pre-commit (optional but recommended)

**Files:**
- Create: `.github/workflows/ci.yml` (or husky + lint-staged)

- [x] **Step 1:** Add a CI job running `npm ci`, `npm run lint`, `npm test`, `npm run format:check`.
- [x] **Step 2:** Commit: `chore(ci): run lint, tests, and format check on push`.

---

## Consolidated Severity Index (from the 4 audits)

**Critical**
- Folder delete silently deletes only first 1000 objects, reports success → **data loss** (Task 1.4 + 1.1)
- Listings truncate at 1000 objects; infinite scroll can't pass page 1 (Task 1.1)
- Upload cancel crashes (DocumentPicker `result.type`) (Task 0.2)
- Dark-mode `#6200EE` primary → button labels ~2:1, links ~2.3:1 (WCAG fail) (Task 4.1)
- LoginScreen keyboard covers inputs/button (Task 5.1)
- Bogus `StatusBar` Cordova package (supply-chain) (Task 0.1)

**High**
- Missing `Delimiter` → recursive subtree, wrong folder view (Task 1.2)
- Non-media files invisible/unmanageable (Task 1.3)
- Legacy connections lack `id` → cross-account cache bleed, broken delete (Task 1.5)
- Media cache keyed only by S3 key → wrong image across buckets (Task 2.1)
- `AsyncStorage.clear()` wipes all app data (Task 2.2)
- Partial download reported as success; presigned-URL/`console.log` credential leak (Task 3.3, 3.5)
- Stale-response race + double fetch in `useFileList` (Task 3.1)
- Black text invisible on dark surfaces; background≈surface (Tasks 4.1, 4.4)
- `UploadProgressPopup` imports the static light theme (Task 4.4)
- Login redirect to non-existent route; no logout; delete-active strands user (Tasks 5.4, 5.5)
- SecureStore 2048-byte limit → connections silently fail to persist beyond ~8–12 (Task 1.6)
- Phantom `expo-constants` dependency (Task 0.4)

**Medium / Low:** presign/TTL mismatch, recursive eviction, temp-file cleanup, SecureStore 2048-byte limit (documented in Task 1.5 follow-up), version mismatch, `userInterfaceStyle`, prettier, lint warnings, memoization, empty states, a11y, FlatList perf, SafeArea margins, single-bucket loop — all mapped to tasks above.

**SecureStore 2048-byte limit — now scheduled as Task 1.6.** Storing the whole connections array in one SecureStore value risks silent write failure beyond ~8–12 connections. Task 1.6 migrates to per-connection secret storage (secrets in SecureStore keyed by id, non-secret metadata in AsyncStorage) with a transparent one-time migration that preserves already-stored connections. Because it changes the connection-storage subsystem, it is sequenced immediately after the id backfill (Task 1.5) and reuses `deriveConnectionId`.

---

## Self-Review

- **Spec coverage:** every audit finding maps to a task (see Severity Index). All High items — including the SecureStore size limit (Task 1.6) — are now scheduled within this plan; nothing is deferred.
- **Constraints honored:** no `@aws-sdk/*` bump, no native modules, no changes to the 16KB `plugins`/`android`/`expo-build-properties` blocks or `plugin/*` files; only `app.json` metadata (`version`, `userInterfaceStyle`) is edited. English code + i18n throughout. TDD for domain/data/services/hooks.
- **Ordering:** Phase 0 first (safety), then 1→2→3 (logic), 4 in parallel (theme), 5 after logic (UX depends on fixed flows), 6 last (hardening).
