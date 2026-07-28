# Uncropped Media Preview and Privacy Policy Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the full-screen image preview from cropping, and bring the privacy policy in line with the eight supported providers and the app's real storage model.

**Architecture:** Task 1 is a two-line prop-forwarding fix in `src/components/CachedImage.js`, guarded by a new component test — `MediaViewerModal` already passes `resizeMode="contain"` and is not touched. Task 2 is a content-only edit to two byte-identical static HTML files, with no code path involved. The two tasks share nothing and can land in either order.

**Tech Stack:** Expo SDK 53, React Native 0.79, React 19, React Native Paper v5 (MD3), Jest + `jest-expo` + `@testing-library/react-native`, static HTML served by GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-07-28-preview-fit-and-privacy-policy-design.md`

## Global Constraints

Copied verbatim from `CLAUDE.md` and the spec — every task's requirements implicitly include these:

1. **Google Play 16KB page size compatibility is mandatory.** Do NOT modify `app.json`, `eas.json`, `plugin/with16KPageSize.js`, `plugin/withAndroidPageSize.js`, or the `expo-build-properties` block. Do not add native modules. Neither task in this plan touches any of them.
2. **Do NOT bump `@aws-sdk/*`.** Pinned at `3.121.0`. Neither task touches the SDK or `package.json`.
3. **All code, identifiers, and comments in English.** UI strings go through `src/locales/translations.js`. The privacy policy is a static web page, not app UI — it stays **English-only** by explicit decision. Do not add a Spanish translation.
4. **No new bugs.** No change to stored connections, cache keys, storage layout, or network calls.
5. **TDD:** failing test first for the Task 1 code change.
6. **Clean Code:** small single-responsibility functions, no hardcoded colors, all color from `useTheme()`.

**Also do NOT do:** `git push`. Commit locally only. The working branch is `fix/preview-fit-and-privacy-policy`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/components/__tests__/CachedImage.test.js` | Create | Pins that `CachedImage` forwards extra props to the underlying `Image`, and that its four cache branches still behave. Does not exist today. |
| `src/components/CachedImage.js` | Modify (`:7`, `:54`) | Add `...props` to the signature and spread it onto `RNImage`. Nothing else changes. |
| `docs/privacy.html` | Modify | The copy GitHub Pages serves at `https://berrujaime.github.io/S3Hub/privacy.html`. |
| `S3Hub/docs/privacy.html` | Modify | In-app-repo duplicate. Must stay byte-identical to the root copy. |

Paths in the two table rows above are **relative to the git repository root**, which is one level above the Expo app. From the app directory (`S3Hub/`, where `npm test` runs) they are `../docs/privacy.html` and `docs/privacy.html` respectively.

---

### Task 1: Forward extra props in CachedImage

**Files:**
- Create: `src/components/__tests__/CachedImage.test.js`
- Modify: `src/components/CachedImage.js:7,54`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `CachedImage` keeps its existing named props `{ source, style, cacheKey }` and additionally forwards every other prop to the underlying React Native `Image`. Signature after the change: `({ source, style, cacheKey, ...props })`. No export shape change — still a single default export.

**Background the implementer needs:** `MediaViewerModal.js:159-164` renders `<CachedImage ... resizeMode="contain" />` inside a fixed `{ width: width * 0.9, height: height * 0.6 }` box (`:92`). `CachedImage` currently destructures only three props, so `resizeMode` is discarded and React Native's `Image` falls back to its default of `cover`, which scales to fill and crops the overflow. `CachedVideo.js:8,55` already does `({ source, style, cacheKey, ...props })` + `{...props}`, which is why video previews are already correct. This task makes the image component match. **Do not** change the box size in `MediaViewerModal`, and **do not** hardcode `resizeMode` inside `CachedImage`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/CachedImage.test.js`:

```js
// src/components/__tests__/CachedImage.test.js
//
// CachedImage used to destructure only { source, style, cacheKey } and drop
// every other prop, so MediaViewerModal's resizeMode="contain" never reached
// the Image and React Native's default "cover" cropped every preview. The
// first test below is the regression guard for that. The rest pin the four
// cache branches so the prop-forwarding change cannot quietly alter them.
import React from 'react';
import { Image } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system';
import CachedImage from '../CachedImage';

jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn(),
  downloadAsync: jest.fn(),
}));

// Mocked so the test exercises CachedImage alone: the real module computes
// CACHE_DIR from FileSystem.cacheDirectory and pulls in AsyncStorage.
jest.mock('../../services/mediaCache', () => ({
  CACHE_DIR: 'file:///cache/S3HubCache/',
  ensureDirectoryExists: jest.fn().mockResolvedValue(undefined),
}));

const REMOTE_URI = 'https://example.com/photo.jpg?X-Amz-Signature=abc';
const CACHE_KEY = 'conn__bucket__photo.jpg';
const CACHED_PATH = 'file:///cache/S3HubCache/conn__bucket__photo.jpg';

const renderImage = (props = {}) =>
  render(
    <CachedImage
      source={{ uri: REMOTE_URI }}
      style={{ width: 90, height: 60 }}
      cacheKey={CACHE_KEY}
      {...props}
    />,
  );

const renderedImage = () => screen.UNSAFE_getByType(Image);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CachedImage', () => {
  it('forwards resizeMode to the underlying Image so previews are not cropped', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    renderImage({ resizeMode: 'contain' });

    await waitFor(() => expect(renderedImage()).toBeTruthy());
    expect(renderedImage().props.resizeMode).toBe('contain');
  });

  it('forwards arbitrary extra props, not just resizeMode', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    renderImage({ accessibilityLabel: 'photo.jpg' });

    await waitFor(() => expect(renderedImage()).toBeTruthy());
    expect(renderedImage().props.accessibilityLabel).toBe('photo.jpg');
  });

  it('renders the cached file when it already exists on disk', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    renderImage();

    await waitFor(() => expect(renderedImage().props.source).toEqual({ uri: CACHED_PATH }));
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it('downloads into the cache when the file is not cached yet', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    FileSystem.downloadAsync.mockResolvedValue({ uri: CACHED_PATH });

    renderImage();

    await waitFor(() => expect(renderedImage().props.source).toEqual({ uri: CACHED_PATH }));
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(REMOTE_URI, CACHED_PATH);
  });

  it('falls back to the remote URI when caching fails', async () => {
    FileSystem.getInfoAsync.mockRejectedValue(new Error('disk full'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderImage();

    await waitFor(() => expect(renderedImage().props.source).toEqual({ uri: REMOTE_URI }));
    consoleError.mockRestore();
  });

  it('skips the disk cache entirely when there is no cache key', async () => {
    renderImage({ cacheKey: null });

    await waitFor(() => expect(renderedImage().props.source).toEqual({ uri: REMOTE_URI }));
    expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run from the `S3Hub/` app directory:

```bash
npm test -- src/components/__tests__/CachedImage.test.js
```

Expected: **2 failed, 4 passed.**

- `forwards resizeMode to the underlying Image so previews are not cropped` FAILS with `expect(received).toBe(expected)` — received `undefined`, expected `"contain"`.
- `forwards arbitrary extra props, not just resizeMode` FAILS the same way on `accessibilityLabel`.
- The four cache-branch tests PASS already — they do not depend on prop forwarding. That is correct and expected; they exist to prove the fix changes nothing else.

If the four cache tests fail too, stop: the mocks are wrong, not the component.

- [ ] **Step 3: Write the minimal implementation**

In `src/components/CachedImage.js`, change the signature on line 7:

```js
const CachedImage = ({ source, style, cacheKey, ...props }) => {
```

and the render on line 54:

```js
    return <RNImage style={style} source={{ uri: imgUri }} {...props} />;
```

Nothing else in the file changes. Do not touch the `useEffect`, the cache logic, or the `ActivityIndicator` branch.

Also update the component's header comment (line 6) so it explains the forwarding, matching the codebase's habit of documenting non-obvious choices:

```js
// CachedImage component to handle image caching.
//
// Extra props are forwarded to the underlying Image (same signature as
// CachedVideo). This matters for `resizeMode`: MediaViewerModal asks for
// "contain" so a preview fits inside its box whole, and dropping the prop
// silently reverted to React Native's "cover" default, which cropped every
// image to the box's aspect ratio.
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/components/__tests__/CachedImage.test.js
```

Expected: **6 passed.**

- [ ] **Step 5: Run the full suite and the linter**

```bash
npm test
npm run lint
```

Expected: the whole suite passes with no new failures, and lint is clean. `MediaViewerModal` has no test file of its own, so nothing else should move.

- [ ] **Step 6: Commit**

```bash
git add src/components/CachedImage.js src/components/__tests__/CachedImage.test.js
git commit -m "fix: show image previews uncropped by forwarding resizeMode

CachedImage destructured only { source, style, cacheKey } and dropped
every other prop, so MediaViewerModal's resizeMode=\"contain\" never
reached the Image and React Native's \"cover\" default cropped each
preview to the 0.9x0.6 box. Forward the remaining props, matching
CachedVideo, which already did and was therefore already correct.

Adds the component's first test file: two regression guards for the
dropped props plus the four cache branches, to prove the change alters
nothing else."
```

- [ ] **Step 7: Verify on device (manual)**

Run `npx expo start`, open a bucket with both a landscape and a portrait image, and tap each.

Expected: a landscape image is as wide as before but proportionally shorter, fully visible; a portrait image is fully visible, bounded by 60% of the screen height with black scrim above and below. Nothing is cut off in either case. Also open a video to confirm it is unchanged.

---

### Task 2: Refresh the privacy policy content

**Files:**
- Modify: `docs/privacy.html` (repo root — the copy GitHub Pages serves)
- Modify: `S3Hub/docs/privacy.html` (duplicate — must end byte-identical)
- Test: none. Static document; verification is the manual checklist in Step 5.

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing consumed by later tasks. No code, no exports, no app behavior change.

**Background the implementer needs:** `SettingsScreen.js:35,49-51` opens `Constants.expoConfig?.extra?.privacyPolicyUrl`, which is `https://berrujaime.github.io/S3Hub/privacy.html` (`app.json:45`), served from the repo-root `docs/` directory. The document currently names only Amazon S3 and Storj, while `src/domain/providers.js` registers eight providers; and it says credentials are stored in SecureStore without noting that only the `accessKey`/`secretKey` pair goes there while connection metadata goes to AsyncStorage (`connectionRepository.js:33-34`). Every other factual claim in the document was already audited against the code and is correct — see the spec's audit table. **Change content only**: do not touch the `<style>` block, the heading structure, or the section order. **Do not** edit `app.json` (Global Constraint 1), including to add `allowBackup`.

- [ ] **Step 1: Confirm the two copies are identical before editing**

```bash
cd /home/jaime/Documents/Git/S3Hub
diff docs/privacy.html S3Hub/docs/privacy.html && echo "IDENTICAL - safe to proceed"
```

Expected: `IDENTICAL - safe to proceed`. If they already differ, stop and report — the plan assumes a single shared starting point.

- [ ] **Step 2: Apply the six content edits to `docs/privacy.html`**

**Edit A — the date line** (replaces line 26):

```html
    <p class="date">Last updated: July 28, 2026</p>
```

**Edit B — the "Data Collection and Storage" section** (replaces the section's paragraph and `<ul>`, lines 31-39):

```html
    <p>S3Hub is a client for S3-compatible object storage. It connects to Amazon S3, Storj, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces, Google Cloud Storage (via its S3 interoperability API), and any other S3-compatible endpoint you configure yourself. The App does <strong>not</strong> collect, transmit, or store any personal data on external servers controlled by the developer.</p>

    <p>All data is stored <strong>exclusively on your device</strong>:</p>
    <ul>
        <li><strong>Credentials</strong> (Access Key and Secret Key): Stored in the platform's encrypted storage (iOS Keychain / Android EncryptedSharedPreferences, via <code>expo-secure-store</code>). They leave your device only to authenticate against the storage endpoint you configure.</li>
        <li><strong>Connection Metadata</strong> (provider, region, endpoint, account ID, bucket, label): Stored in the App's private local storage. This storage carries no additional encryption applied by the App; it is protected by the operating system's app sandbox and by your device's own encryption. It contains no credentials.</li>
        <li><strong>Preferences</strong> (selected bucket, language, theme, sort order, preview setting): Stored locally on your device.</li>
        <li><strong>File Cache</strong>: Images and videos you browse or preview are cached locally in the app's cache directory, as thumbnails and at full size, to improve browsing performance. This cache is cleared automatically after 7 days or when the app goes to the background.</li>
        <li><strong>File Listings Cache</strong>: Directory listings are cached locally to reduce API calls. Expires after 7 days.</li>
    </ul>
```

**Edit C — the "Data Sharing" section** (replaces its single paragraph, line 42, with two paragraphs):

```html
    <p>S3Hub does <strong>not</strong> share any data with third parties on its own initiative. All network communication occurs directly between your device and the storage endpoint you configure — including a self-hosted or otherwise custom endpoint. No data passes through intermediary servers controlled by the developer.</p>

    <p>When you use the App's share action on a file, that file is handed to whichever app you select (for example a messaging or email client). What that app does with the file is governed by its own privacy policy, not by this one.</p>
```

**Edit D — the "Permissions" list** (add as a new `<li>` after the existing "File Access" entry, line 49):

```html
        <li><strong>Sharing</strong>: To hand a file to another app you choose, when you use the share action.</li>
```

**Edit E — the "Data Security" section** (replaces its paragraph, line 53):

```html
    <p>Credentials (Access Key and Secret Key) are stored using the platform's encrypted storage (iOS Keychain / Android EncryptedSharedPreferences, via <code>expo-secure-store</code>). Connection metadata and preferences are stored in the App's private local storage, protected by the operating system's app sandbox and your device's encryption rather than by encryption applied by the App. API communications use HTTPS/TLS encryption.</p>
```

**Edit F — the "Third-Party Services" section** (replaces its paragraph and `<ul>`, lines 63-67):

```html
    <p>The App connects to the following services at your direction. Each is governed by its own privacy policy:</p>
    <ul>
        <li><strong>Amazon Web Services S3</strong> (<a href="https://aws.amazon.com/privacy/">Privacy Policy</a>)</li>
        <li><strong>Storj DCS</strong> (<a href="https://www.storj.io/privacy-policy">Privacy Policy</a>)</li>
        <li><strong>Cloudflare R2</strong> (<a href="https://www.cloudflare.com/privacypolicy/">Privacy Policy</a>)</li>
        <li><strong>Backblaze B2</strong> (<a href="https://www.backblaze.com/company/privacy.html">Privacy Policy</a>)</li>
        <li><strong>Wasabi</strong> (<a href="https://wasabi.com/privacy-policy/">Privacy Policy</a>)</li>
        <li><strong>DigitalOcean Spaces</strong> (<a href="https://www.digitalocean.com/legal/privacy-policy">Privacy Policy</a>)</li>
        <li><strong>Google Cloud Storage</strong> (<a href="https://cloud.google.com/terms/cloud-privacy-notice">Privacy Policy</a>)</li>
        <li><strong>Custom / S3-compatible endpoints</strong>: If you configure your own endpoint (for example a self-hosted MinIO server), the third party is whoever operates that endpoint. No policy can be listed here on their behalf.</li>
    </ul>
```

**Edit G — the "Data Retention and Deletion" list** (replaces the second `<li>`, line 58):

```html
        <li>Individual connections can be deleted from within the App's interface. Deleting a connection also removes its stored credentials from the device's encrypted storage.</li>
```

This last one is accurate per `connectionRepository.js:258-264` (`deleteConnection` deletes the `conn_secret_<id>` SecureStore key) and `:243-253` (`saveConnections` removes orphaned secrets).

- [ ] **Step 3: Verify every provider link resolves**

```bash
for url in \
  https://aws.amazon.com/privacy/ \
  https://www.storj.io/privacy-policy \
  https://www.cloudflare.com/privacypolicy/ \
  https://www.backblaze.com/company/privacy.html \
  https://wasabi.com/privacy-policy/ \
  https://www.digitalocean.com/legal/privacy-policy \
  https://cloud.google.com/terms/cloud-privacy-notice ; do
  printf '%s -> ' "$url"
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -L --max-time 15 "$url"
done
```

Expected: `200` for all seven. A `3xx` that lands on `200` after `-L` is fine — the redirect target is the provider's current canonical policy URL. **A `404` is not acceptable**: find the provider's current policy URL, use that instead, and note the substitution in the commit message. If a host blocks the request (`403` to an automated client), open it in a browser to confirm before accepting it.

- [ ] **Step 4: Mirror the file to the second copy**

Copy rather than re-edit, so the two cannot drift:

```bash
cd /home/jaime/Documents/Git/S3Hub
cp docs/privacy.html S3Hub/docs/privacy.html
diff docs/privacy.html S3Hub/docs/privacy.html && echo "IDENTICAL - good"
```

Expected: `IDENTICAL - good`.

- [ ] **Step 5: Manual verification checklist**

Confirm each, and report any that fail rather than fixing silently:

1. Every provider `name` in `src/domain/providers.js` appears in the document. Cross-check against: `AWS S3`, `Storj`, `Cloudflare R2`, `Backblaze B2`, `Wasabi`, `DigitalOcean Spaces`, `Google Cloud Storage`, `Custom / S3-compatible`. (The document may use fuller brand forms such as "Amazon Web Services S3" and "Storj DCS" — that is intended, not a mismatch.)
2. The document no longer implies that connection metadata is encrypted by the App.
3. The document no longer says the App connects only to Amazon S3 and Storj.
4. `<style>`, heading text, and section order are unchanged from the original — `git diff` shows content changes only.
5. Open `docs/privacy.html` in a browser at a narrow (mobile) viewport width: it renders readably, no horizontal scroll.

```bash
git diff --stat docs/privacy.html S3Hub/docs/privacy.html
```

Expected: both files changed, with equal insertion and deletion counts.

- [ ] **Step 6: Commit**

```bash
cd /home/jaime/Documents/Git/S3Hub
git add docs/privacy.html S3Hub/docs/privacy.html
git commit -m "docs: update privacy policy for all eight providers and real storage model

The policy named only Amazon S3 and Storj; domain/providers.js registers
eight. It also said credentials live in SecureStore without noting that
only the accessKey/secretKey pair does, while connection metadata
(provider, region, endpoint, account ID, bucket, label) lives in the
app's private local storage with no app-level encryption. Both claims
are now accurate, without overstating or understating the protection.

Also documents file sharing to other apps (expo-sharing, previously
undocumented) and that deleting a connection deletes its stored
credential. Every other claim in the document was audited against the
code and left as-is. Both copies of the file updated identically."
```

- [ ] **Step 7: Do NOT push**

Leave the commits local on `fix/preview-fit-and-privacy-policy`. The user will decide when to push and whether to merge into `main`.

Note that the GitHub Pages copy only goes live once these commits reach the default branch on GitHub, so the in-app link keeps serving the old policy until then. Mention this when reporting completion.

---

## Self-Review

**1. Spec coverage**

| Spec section | Covered by |
|---|---|
| 1.2 Decision — forward props | Task 1, Step 3 |
| 1.3 Box size unchanged | Task 1 — `MediaViewerModal` is explicitly excluded from Files, and the Background note forbids changing it |
| 1.4 Testing — regression + cache path | Task 1, Step 1 (6 tests: 2 forwarding, 4 cache branches) |
| 1.5 Backward compatibility | Task 1, Steps 5 and 7 (full suite + on-device check) |
| 2.4 Edits 1-7 | Task 2, Step 2, Edits A-G (edit 7 = date = Edit A) |
| 2.5 Provider links | Task 2, Step 2 Edit F + Step 3 verification loop |
| 2.6 `allowBackup` out of scope | Task 2 Background — explicit "do not edit `app.json`" |
| 2.7 English-only | Global Constraint 3 |
| 2.8 Testing — identical copies, names match, links resolve, mobile render | Task 2, Steps 1, 3, 4, 5 |
| 2.9 Backward compatibility | Task 2 Interfaces — no code touched |

No gaps. One addition beyond the spec's seven edits: Edit G, on credential deletion. It falls inside the spec's stated accuracy-pass scope and is verified against `connectionRepository.js:258-264`.

**2. Placeholder scan**

No `TBD`, `TODO`, "implement later", "similar to Task N", or "add appropriate error handling". Every code step contains the literal content to write. Every verification step names the command and the expected output.

**3. Type consistency**

`CachedImage`'s signature is written identically in the Interfaces block and in Step 3: `({ source, style, cacheKey, ...props })`. The test's helper names (`renderImage`, `renderedImage`) are defined once and used consistently. `CACHED_PATH` is the concatenation of the mocked `CACHE_DIR` (`file:///cache/S3HubCache/`) and `CACHE_KEY` (`conn__bucket__photo.jpg`), matching what `CachedImage.js:21` builds — so the `downloadAsync` assertion in the fourth test uses the same value the component will actually pass.
