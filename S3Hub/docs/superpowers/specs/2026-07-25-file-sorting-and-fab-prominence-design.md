# File Sorting and FAB Prominence — Design

**Date:** 2026-07-25

**Goal:** Two independent changes to the Files experience.

1. Make the floating action buttons speak the same color language as the rest of the app, and give the two stacked FABs in Files a legible hierarchy.
2. Let the user sort a bucket listing by file type, name, or modification date, in either direction, with the choice remembered across launches.

**Scope note:** these two parts share no code. They are specified together because they were raised together and both land in `FileListScreen`; they can be implemented and shipped independently.

## Global Constraints

Inherited verbatim from `CLAUDE.md`. Restated because they materially shape the decisions below:

1. **Google Play 16KB page size compatibility is mandatory.** No changes to `app.json` native build config, `eas.json`, `plugin/with16KPageSize.js`, `plugin/withAndroidPageSize.js`, or `expo-build-properties`. **No new native modules** — everything here is pure JS over existing dependencies.
2. **Do NOT bump `@aws-sdk/*`.** Pinned at `3.121.0`. `LastModified` is already present in the existing `ListObjectsV2` response; nothing new is requested from the SDK.
3. **All code, identifiers, and comments in English.** UI strings go through `src/locales/translations.js`.
4. **No new bugs.** Backward compatible with connections and caches already stored on device — see [Backward compatibility](#25-backward-compatibility).
5. **TDD:** failing test first for every `domain/` and `data/` module and for new hook logic.
6. **Clean Code:** small single-responsibility functions, no hardcoded colors, all color from `useTheme()`.

---

# Part 1 — FAB prominence and color

## 1.1 Problem

The app's accent is a single warm amber on a cool slate foundation (`theme.js`). Amber already marks:

- the active tab (`AppNavigator.js:68`, `tabBarActiveTintColor: theme.colors.primary`), and
- every contained button (`Button mode="contained"` resolves to `colors.primary` — Download selected, Login).

But the three FABs pass no color, so Paper applies its MD3 default of `secondaryContainer` / `onSecondaryContainer`. In this theme those tokens are `#D4E2EF` (light) and `#32465B` (dark) — pale blue, because `secondary` is blue.

The result: **the most prominent action affordance on each screen is the only one that does not use the action color.**

There is also a hierarchy problem independent of color. `FileListScreen` renders two FABs of identical size and color, stacked (`fab` at `bottom: 64`, `createFolderFab` at `bottom: 140`). Nothing indicates which is the primary action.

## 1.2 Decision

Amber marks the primary action of each screen. The secondary action stays in the amber family but at visibly lower emphasis.

| FAB | Screen | Background | Icon | Size |
| --- | --- | --- | --- | --- |
| Upload | Files | `colors.primary` (explicit) | `colors.onPrimary` | 56dp (`medium`) |
| Add connection | Connections | `colors.primary` (explicit) | `colors.onPrimary` | 56dp (`medium`) |
| Create folder | Files | `variant="surface"` → `elevation.level3` | → `colors.primary` | 40dp (`small`) |

### Do not use `variant="primary"`

The obvious implementation — `<FAB variant="primary">` — is wrong here. Paper resolves that variant to `theme.colors.primaryContainer` / `onPrimaryContainer` (`react-native-paper/src/components/FAB/utils.ts:183,226`), and **this theme overrides neither**. They fall back to MD3's defaults, where `primaryContainer` is `palette.primary90` = `rgba(234,221,255,1)` = `#EADDFF` — a light purple.

This is the same class of bug `theme.js:50-58` already documents: Paper's un-overridden MD3 tokens are tints of *its own* purple primary, not this theme's amber, which is how react-navigation's `card` ended up purple before the elevation ramp was defined explicitly.

So the filled amber comes from explicit `style` + `color` props, not from a variant.

`variant="surface"` **is** safe and is exactly the intended treatment: Paper maps it to `elevation.level3` for the background (`utils.ts:195`) and `colors.primary` for the icon (`utils.ts:238`). Both tokens are explicitly defined by this theme, in light and dark.

### Contrast, measured

Verified with `src/domain/colorContrast.js` (WCAG 2.x relative luminance), not judged by eye:

| Ratio | Mode | Pair | Verdict |
| --- | --- | --- | --- |
| 4.67:1 | light | `onPrimary` icon on amber FAB | AA text ✓ |
| 7.40:1 | dark | `onPrimary` icon on amber FAB | AA text ✓ |
| 3.93:1 | light | amber icon on `elevation.level3` (small FAB) | ✓ (≥3:1 non-text) |
| 5.66:1 | dark | amber icon on `elevation.level3` (small FAB) | ✓ |

Measuring surfaced a defect that would not have been visible in review. The small FAB's **silhouette** against the page background:

| Ratio | Mode | Pair | Verdict |
| --- | --- | --- | --- |
| 1.11:1 | light | `elevation.level3` `#E7ECF2` vs `background` `#F5F7FA` | ✗ |
| 1.42:1 | dark | `elevation.level3` `#27303D` vs `background` `#0E1116` | ✗ |

The button is effectively invisible *as a button* — only its floating icon reads. On device the shape is carried by the elevation shadow alone, which over a near-white background is very faint. WCAG 1.4.11 requires 3:1 for a control's boundary when that boundary is what identifies it.

**Fix:** a 1dp border in `colors.primary` on the small FAB — same amber as its icon. Measured **4.35:1 light / 8.03:1 dark** against the background. It fixes the boundary and reinforces "amber means action."

A border in `colors.outline` was measured and rejected: 1.54:1 light / 1.83:1 dark, still failing.

### Geometry

Both FABs currently use `right: 0, margin: 16`. At 40dp the small FAB's centre sits 36dp from the screen edge while the 56dp FAB's sits 44dp: **their vertical axes do not line up.**

- Small FAB: `marginRight: 24` (16 + 8) so both centres land at 44dp.
- Small FAB: `bottom: 136`. Upload occupies 64→120, so this leaves a clean 16dp gap (currently 140, i.e. 20dp).

## 1.3 Components

New `src/components/ActionFab.js`, with a `prominence: 'primary' | 'secondary'` prop.

The two amber FABs are identical treatments on two different screens, so a shared component gives the "amber is this" decision a single owner — the same reasoning that produced `ScreenTitle` and `StorageListRow`. It also means the `primaryContainer`-is-purple warning is written once, where it prevents the mistake, rather than as three inline style blocks that can drift.

- `prominence="primary"` → 56dp, `style={{ backgroundColor: colors.primary }}`, `color={colors.onPrimary}`.
- `prominence="secondary"` → 40dp (`size="small"`), `variant="surface"`, 1dp `colors.primary` border.

Positioning stays with the caller (it is screen layout, not button identity), so `style` must merge over the component's own background style.

## 1.4 Testing

`src/components/__tests__/ActionFab.test.js`:

- `prominence="primary"` renders with `colors.primary` background and `colors.onPrimary` icon.
- `prominence="secondary"` renders `size="small"`, `variant="surface"`, and a `colors.primary` border.
- **Neither prominence ever sets `variant="primary"`** — a regression guard on the purple-token trap.
- A caller-supplied `style` merges rather than replacing the background.
- `onPress` and `accessibilityLabel` pass through.

Existing `FileListScreen` and `ConnectionSelectScreen` tests are updated for the new component; their FAB-behavior assertions (upload disabled while an operation is in flight, etc.) must keep passing unchanged.

---

# Part 2 — Sorting in Files

## 2.1 Current behavior

`domain/fileListMapper.sortFiles(filesArray)` implements exactly one hardcoded order: folders first (A-Z), then all non-video files (A-Z), then videos (A-Z). It is not a type order — it is alphabetical with videos pushed to the end.

It is called from three places in `hooks/useFileList.js`: the cache-hit path (`:96`), the fresh-fetch path (`:143`), and the `visibleFiles` search memo (`:293`).

## 2.2 Domain

New pure module `src/domain/fileSorting.js`. This follows the precedent set by `fileTypes.js`, which was extracted out of `fileListMapper.js` and is re-exported from it: `fileListMapper`'s job is mapping S3 listings to items, while three criteria, a category order, a direction, and preference validation are a separate responsibility.

`sortFiles` is **re-exported from `fileListMapper`** so existing imports and tests keep working.

```
SORT_CRITERIA            = ['type', 'name', 'modified']
SORT_DIRECTIONS          = ['asc', 'desc']
DEFAULT_SORT_CRITERION   = 'type'

sortFiles(items, criterion, direction)
defaultDirectionFor(criterion)      // 'desc' for 'modified', otherwise 'asc'
resolveSortCriterion(stored)             // unknown/corrupt -> 'type'
resolveSortDirection(stored, criterion)  // unknown/corrupt -> defaultDirectionFor(criterion)
toEpochMs(value)                         // Date | number | ISO string -> ms; invalid -> null
```

Both resolvers always return a usable value, so no caller ever has to apply a fallback of its own.

`resolveSortCriterion` / `resolveSortDirection` mirror `domain/localeResolver.resolveLocale`, which already handles a stored-but-unsupported language: a corrupt preference must never break the listing.

### Order rules

**Folders always come first**, in every criterion and both directions, ordered among themselves by name. They are `CommonPrefixes` — pure prefixes with no date, no size, and no `mediaType`. Under `desc` only their internal name order reverses. This matches Finder and Windows Explorer with "folders first" enabled.

Among files, ascending:

| Criterion | Order |
| --- | --- |
| `type` | `classifyKey` category rank: `image` → `video` → `audio` → `document` → `archive` → `other`, then name A-Z |
| `name` | name A-Z (`localeCompare`) |
| `modified` | `lastModified` oldest first, then name A-Z |

Every comparator **ends in a name tiebreak**, so the order is total and deterministic. Tests can assert exact sequences without depending on `Array.prototype.sort` stability.

### Direction

`asc` and `desc` are **literal** — ascending or descending by the criterion's own value. `desc` reverses the **complete** visible order, tiebreak included: reversed categories with names still in A-Z reads as a bug.

What is per-criterion is the **default**: `defaultDirectionFor('modified')` is `'desc'`, everything else `'asc'`. Without this, choosing "modification date" would default to oldest-first, the opposite of the common case.

**Changing the criterion resets the direction to that criterion's default.** The toggle then overrides it explicitly. This is the Finder/Explorer column-header convention: clicking a new column starts in that column's natural direction.

Items with `lastModified === null` sort **last** under `modified`, in both directions — an unknown date is not a date to order by, so it does not participate in the reversal.

## 2.3 Capturing the modification date

`LastModified` is currently **discarded**. `parseObjects` builds items with `id/key/name/size/isFolder/isVideo/mediaType/url`; the raw SDK object reaching it does carry `LastModified` (`s3Service.js:152`, `contents: response.Contents ?? []`).

`parseObjects` gains one field, normalized **in the domain, at parse time**:

```js
lastModified: toEpochMs(object.LastModified)
```

Epoch milliseconds, not a `Date`, because the file-list cache round-trips through `JSON.stringify`: a number survives intact, a `Date` would come back as a string. `stripVolatileFields` only strips `url`, so the field persists as-is and is already comparable on hydration — no ISO-string path is needed on the cache branch, though `toEpochMs` accepts one defensively, since the code already documents that non-AWS providers return less well-formed responses than AWS.

`null` is the sentinel — not `undefined`, not `NaN` — so the comparator has a single case to check and the field survives JSON explicitly.

Folder items get `lastModified: null`. Since folders always sort first by name, it never affects output.

## 2.4 Applying a sort without refetching

Changing the sort is a **client-side reorder, not a new request**. `listAllObjects` paginates until the current level is exhausted, so `fullFiles` always holds the complete current-level listing. (Sorting by date over a partially loaded list would be wrong; that is not the situation here.)

Two traps, both easy to implement incorrectly:

### Trap 1 — the pagination window

`displayedFiles` is `fullFiles.slice(0, page * PAGE_SIZE)` with `page` in internal state. Reordering without resetting `page` to 1 leaves a window that is a slice of the *previous* order. And `mediaFiles` drives the media viewer's paging (`handleModalReachEnd` compares against `displayedFiles.length`), so all three arrays must be rebuilt together.

`useFileList.js:105-111` and `:147-151` already duplicate that "set `fullFiles` / `displayedFiles` / `mediaFiles` / `loading` / `page`" block. Extract it to a single local helper used by the cache branch, the fetch branch, and the new criterion-change effect. This removes pre-existing duplication and gives the effect a correct implementation for free.

### Trap 2 — `sortCriterion` must NOT be a dependency of `fetchFiles`

`fetchFiles` is memoized on `[currentConnection, currentBucket, currentPath]`, and its identity is a dependency of the main fetch effect (`:278`). Adding the criterion to its deps would change its identity and **refetch on every sort change**, re-signing every preview URL for what is a pure reorder.

The criterion and direction are read from refs (`sortCriterionRef`, `sortDirectionRef`) inside `fetchFiles`, updated by the criterion-change effect. `fetchFiles`'s identity stays stable and the fetch effect does not re-run.

### Rejected alternative

Deriving `fullFiles` / `displayedFiles` / `mediaFiles` with `useMemo` from a raw item list would be architecturally cleaner and would remove the re-sync problem by construction. It is rejected because `mediaFiles` is deliberately real state: `setMediaFileUrl` patches an on-demand signed URL into it when preview is off. Making it derived requires reworking that mechanism (e.g. a per-id override map) — the exact code path just validated on device for PDF/audio/text opening. Not worth the regression risk for a change with no visible benefit.

## 2.5 Backward compatibility

Caches already written on device predate `lastModified`, so their items lack the field entirely. Those items sort **last** under `modified` — no `NaN`, no exception — and self-heal on the next refresh or cache expiry.

A stored preference from a future or corrupted write passes through `resolveSortCriterion` / `resolveSortDirection` and falls back to the defaults rather than breaking the listing.

## 2.6 The control

`IconButton icon="sort"` in the existing action row (back / view toggle / select all), opening a Paper `Menu` with the three criteria.

- The **active** criterion shows `arrow-up` / `arrow-down` as its `trailingIcon`, reflecting the current direction. Inactive criteria show nothing.
- Tapping the **active** criterion **toggles the direction**.
- Tapping an **inactive** criterion switches to it with `defaultDirectionFor(criterion)`.

New component `src/components/SortMenu.js`. It deliberately does **not** reuse or extend `ThemedSelect`:

- `ThemedSelect` is shaped for Settings rows (`width: '100%'`, `marginBottom: 16`, outlined full-width button anchor). An icon anchor would make the anchor, styles, label, and width all conditional.
- `ThemedSelect` explicitly does **not** fire `onChange` when the current value is re-picked. `SortMenu` needs the opposite — re-picking the active criterion is the toggle gesture.
- There is no shared theming to preserve: Paper's `Menu` already takes its background from `theme.colors.elevation.level2` by default (`Menu.tsx:677-678`, `elevation = 2`). `ThemedSelect`'s explicit `contentStyle` is redundant with that default; it is left in place as harmless self-documentation.

Accessibility: the `IconButton` announces what it controls plus the current criterion and direction; each `Menu.Item` announces that activating the current one reverses the order.

The control lives **only in Files**, not in Settings, even though the preference is global — it belongs where it is used, and duplicating it would be a second redundant path to the same state (the reasoning that removed the logout button).

## 2.7 Persistence

Global preference, applied to every bucket and connection, surviving app restart. Same pattern as `theme` and `preview`, with **two separate keys** rather than a composite `'modified:desc'` value — one key per preference is the existing convention (`appLanguage`, `preview`, `appTheme`), each value validates independently, and there is no format to migrate later.

- `data/connectionRepository.js`: `KEYS.SORT_CRITERION = 'sortCriterion'`, `KEYS.SORT_DIRECTION = 'sortDirection'`, plus `getSortCriterion()` / `saveSortCriterion()` and `getSortDirection()` / `saveSortDirection()` (SecureStore, plain strings).
- `context/AuthContext.js`: `sortCriterion` and `sortDirection` state (defaults `DEFAULT_SORT_CRITERION` and `defaultDirectionFor(DEFAULT_SORT_CRITERION)`, i.e. `'type'` / `'asc'` — derived, never a second hardcoded literal), a `changeSortCriterion(criterion)` action that also applies `defaultDirectionFor` and persists both, a `toggleSortDirection()` action, both values loaded in `loadStoredData` through the resolvers, and all four entries added to the `value`/deps of the `useMemo`.
- `screens/FileListScreen.js` reads them from context and passes them to `useFileList(currentConnection, currentBucket, sortCriterion, sortDirection)`.

## 2.8 i18n

Added to **both** `en` and `es` — the locale-parity test requires identical key sets:

`sortBy`, `sortByType`, `sortByName`, `sortByModified`, `sortAscending`, `sortDescending`.

## 2.9 Testing

TDD, domain first.

**`src/domain/__tests__/fileSorting.test.js`** (new)

- Folders first in all three criteria and both directions; only their internal name order reverses.
- `type`: exact category order; name A-Z within a category.
- `name`: A-Z ascending, Z-A descending.
- `modified`: newest first under `desc`, oldest first under `asc`.
- Items with `lastModified: null` sort last under `modified` in **both** directions.
- `desc` reverses the name tiebreak too, not just the primary key.
- `defaultDirectionFor`: `'desc'` for `modified`, `'asc'` for `type` and `name`.
- `resolveSortCriterion`: unknown, empty, `null`, and non-string inputs all fall back to `'type'`.
- `resolveSortDirection`: valid values pass through; unknown, empty, `null`, and non-string inputs fall back to `defaultDirectionFor(criterion)` — so a corrupt direction stored alongside `modified` resolves to `'desc'`, not `'asc'`.
- `toEpochMs`: `Date`, epoch number, ISO string, invalid string, `undefined`, `null`.
- Determinism: the same input always yields the same exact sequence.
- Input is never mutated.

**`src/domain/__tests__/fileListMapper.test.js`** (extended)

- `parseObjects` captures `lastModified` as epoch ms from a `Date`.
- …from an ISO string.
- …as `null` when absent or unparseable.
- Folder entries get `lastModified: null`.
- `sortFiles` is still exported from this module (re-export guard).

**`src/hooks/__tests__/useFileList.test.js`** (extended)

- Changing criterion reorders **without refetching** — asserted on the `listAllObjects` call count.
- Changing criterion resets the pagination window to the first page.
- `mediaFiles` order stays consistent with the new `fullFiles` order.
- Search results (`visibleFiles`) honour the active criterion and direction.

**`src/components/__tests__/SortMenu.test.js`** (new)

- Renders one item per criterion.
- The active criterion shows the direction arrow; inactive ones show no trailing icon.
- Tapping the active criterion calls the toggle, not the criterion setter.
- Tapping an inactive criterion calls the criterion setter.

**`src/screens/__tests__/FileListScreen.test.js`** (extended)

- The sort control opens the menu, and choosing an option reaches the context action.

**`src/context/__tests__/AuthContext.test.js`** (extended)

- Defaults to `'type'` / `'asc'` with nothing stored.
- Loads and resolves stored values; a corrupt value falls back.
- `changeSortCriterion` applies the criterion's default direction and persists both.
- `toggleSortDirection` flips and persists.

**`src/data/__tests__/connectionRepository.test.js`** (extended)

- get/save for both new keys; `null` when nothing is stored.

## 2.10 Out of scope

- **The modification date is not displayed in the list.** Confirmed by the user. `FileItem`'s list-view subtitle (currently size in MB) would be the natural home if that changes.
- **No sort control in Settings.** See [2.6](#26-the-control).

## Verification gate

`npm test` green, `npm run lint` clean, `npm run format:check` clean, and no hardcoded colors or strings introduced. Golden-rule files (`app.json`, `eas.json`, `plugin/`, `@aws-sdk` pin) untouched.
