# File Sorting and FAB Prominence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the FABs the app's amber action color with a legible primary/secondary hierarchy, and let the user sort a bucket listing by file type, name, or modification date in either direction, remembered across launches.

**Architecture:** Sorting rules, direction defaults, preference validation, and date normalization go in a new pure domain module (`src/domain/fileSorting.js`), re-exported from `fileListMapper` so existing imports keep working. The preference is global, persisted through `connectionRepository` into SecureStore, owned by `AuthContext`, and passed down to `useFileList`, which re-sorts already-loaded items **without refetching**. The FAB treatment becomes one shared `ActionFab` component so "amber means action" has a single owner.

**Tech Stack:** React Native 0.79 / Expo SDK 53 / React 19, react-native-paper v5 (MD3), Jest + `jest-expo` + `@testing-library/react-native`, `i18n-js`, `expo-secure-store`.

**Source spec:** `docs/superpowers/specs/2026-07-25-file-sorting-and-fab-prominence-design.md`

## Global Constraints

Copied verbatim from the spec's Global Constraints. Every task's requirements implicitly include this section.

1. **Google Play 16KB page size compatibility is mandatory.** No changes to `app.json` native build config, `eas.json`, `plugin/with16KPageSize.js`, `plugin/withAndroidPageSize.js`, or `expo-build-properties`. **No new native modules** — everything here is pure JS over existing dependencies.
2. **Do NOT bump `@aws-sdk/*`.** Pinned at `3.121.0`. `LastModified` is already present in the existing `ListObjectsV2` response; nothing new is requested from the SDK.
3. **All code, identifiers, and comments in English.** UI strings go through `src/locales/translations.js`.
4. **No new bugs.** Backward compatible with connections and caches already stored on device.
5. **TDD:** failing test first for every `domain/` and `data/` module and for new hook logic.
6. **Clean Code:** small single-responsibility functions, no hardcoded colors, all color from `useTheme()`.

**Never use `<FAB variant="primary">`.** Paper resolves it to `theme.colors.primaryContainer` / `onPrimaryContainer`, which this theme does not override, so they fall back to MD3's `#EADDFF` — light purple. Amber comes from explicit `style` + `color` props. (`variant="surface"` **is** safe: it maps to `elevation.level3` / `colors.primary`, both defined by this theme.)

## Verification gate (per task)

Every task's final step is a commit. Before committing, these must pass:

```bash
npm test
npm run lint
npm run format:check
```

Run all commands from the repo root: `/home/jaime/Documents/Git/S3Hub/.claude/worktrees/s3hub-improvement-plan/S3Hub`.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/components/ActionFab.js` | **Create.** Owns the amber-FAB treatment and the two prominence levels. | 1 |
| `src/components/__tests__/ActionFab.test.js` | **Create.** Includes the regression guard against `variant="primary"`. | 1 |
| `src/screens/FileListScreen.js` | **Modify.** Swap both FABs, fix their geometry (Task 2); mount `SortMenu` and wire the context preference (Task 9). | 2, 9 |
| `src/screens/ConnectionSelectScreen.js` | **Modify.** Swap the add-connection FAB. | 2 |
| `src/domain/fileSorting.js` | **Create.** Criteria, category rank, direction defaults, preference resolvers, `toEpochMs`, `sortFiles`. | 3 |
| `src/domain/__tests__/fileSorting.test.js` | **Create.** | 3 |
| `src/domain/fileListMapper.js` | **Modify.** Re-export `sortFiles`; capture `lastModified` in `parseObjects`. | 4 |
| `src/data/connectionRepository.js` | **Modify.** Two new keys + four accessors. | 5 |
| `src/context/AuthContext.js` | **Modify.** `sortCriterion` / `sortDirection` state, two actions, load-time resolution. | 6 |
| `src/hooks/useFileList.js` | **Modify.** `applyItems` helper, sort refs, reorder-without-refetch effect. | 7 |
| `src/components/SortMenu.js` | **Create.** The icon-anchored criterion menu with the direction toggle. | 8 |
| `src/components/__tests__/SortMenu.test.js` | **Create.** | 8 |
| `src/locales/translations.js` | **Modify.** Six keys in **both** `en` and `es`. | 9 |

**Task 1–2 (Part 1) and Task 3–9 (Part 2) share no code and can ship independently.** Within Part 2 the order is load-bearing: 3 → 4 → 5 → 6 → 7 → 8 → 9.

---

# Part 1 — FAB prominence and color

### Task 1: ActionFab component

**Files:**
- Create: `src/components/ActionFab.js`
- Test: `src/components/__tests__/ActionFab.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `ActionFab` — default export. Props: `prominence` (`'primary' | 'secondary'`, default `'primary'`), `style`, plus every other prop forwarded to Paper's `FAB` (`icon`, `onPress`, `disabled`, `accessibilityLabel`, `testID`).

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/ActionFab.test.js`:

```javascript
// src/components/__tests__/ActionFab.test.js
//
// ActionFab owns the app's "amber means action" FAB treatment. Two of these
// assertions guard traps that measurement/source-reading surfaced, not
// preferences:
//
//  (a) `variant="primary"` must NEVER be used. Paper maps it to
//      theme.colors.primaryContainer / onPrimaryContainer, which this theme
//      does not override, so they fall back to MD3's own purple (#EADDFF).
//      This is the same class of bug theme.js:50-58 documents for
//      react-navigation's `card`.
//  (b) The small (secondary) FAB needs an explicit primary-colored border.
//      Its variant="surface" background (elevation.level3) sits at 1.11:1
//      against the page background in light mode — invisible AS A BUTTON,
//      only the icon reads. WCAG 1.4.11 wants 3:1 for a control boundary;
//      the amber border measures 4.35:1 light / 8.03:1 dark.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Provider as PaperProvider, FAB } from 'react-native-paper';
import ActionFab from '../ActionFab';
import { darkTheme } from '../../theme/theme';

const renderFab = (props = {}) => {
  const onPress = jest.fn();
  render(
    <PaperProvider theme={darkTheme}>
      <ActionFab icon="upload" onPress={onPress} accessibilityLabel="Upload files" {...props} />
    </PaperProvider>,
  );
  return { onPress, fab: screen.UNSAFE_getByType(FAB) };
};

describe('ActionFab', () => {
  it('paints the primary prominence with the theme accent', () => {
    const { fab } = renderFab();

    expect(StyleSheet.flatten(fab.props.style).backgroundColor).toBe(darkTheme.colors.primary);
    expect(fab.props.color).toBe(darkTheme.colors.onPrimary);
  });

  it('renders the secondary prominence as a small surface FAB', () => {
    const { fab } = renderFab({ prominence: 'secondary' });

    expect(fab.props.size).toBe('small');
    expect(fab.props.variant).toBe('surface');
  });

  it('gives the secondary prominence a visible accent boundary', () => {
    const { fab } = renderFab({ prominence: 'secondary' });
    const flattened = StyleSheet.flatten(fab.props.style);

    expect(flattened.borderWidth).toBe(1);
    expect(flattened.borderColor).toBe(darkTheme.colors.primary);
  });

  it('never asks Paper for the purple primaryContainer variant', () => {
    expect(renderFab().fab.props.variant).not.toBe('primary');
    expect(renderFab({ prominence: 'secondary' }).fab.props.variant).not.toBe('primary');
  });

  it("merges a caller's positioning style over its own background", () => {
    const { fab } = renderFab({ style: { position: 'absolute', bottom: 64 } });
    const flattened = StyleSheet.flatten(fab.props.style);

    // Positioning is screen layout, not button identity, so the caller owns
    // it -- but it must not cost the FAB its color.
    expect(flattened.bottom).toBe(64);
    expect(flattened.backgroundColor).toBe(darkTheme.colors.primary);
  });

  it('forwards press handling and the accessibility label', () => {
    const { onPress } = renderFab();

    fireEvent.press(screen.getByLabelText('Upload files'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('forwards the disabled state', () => {
    const { fab } = renderFab({ disabled: true });

    expect(fab.props.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/components/__tests__/ActionFab.test.js`

Expected: FAIL — `Cannot find module '../ActionFab' from 'src/components/__tests__/ActionFab.test.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ActionFab.js`:

```javascript
// src/components/ActionFab.js
//
// The app's floating action buttons. Amber (theme.colors.primary) marks the
// primary action of a screen -- the same accent the active tab
// (AppNavigator.js) and every contained Button already use. Before this,
// the FABs passed no color at all, so Paper applied its MD3 default of
// secondaryContainer: pale blue in this theme, making the most prominent
// affordance on each screen the only one NOT using the action color.
//
// WARNING -- do NOT "simplify" this to <FAB variant="primary">.
// Paper maps that variant to theme.colors.primaryContainer /
// onPrimaryContainer (react-native-paper/src/components/FAB/utils.ts:183,226),
// and this theme overrides NEITHER. They fall back to MD3's defaults, where
// primaryContainer is palette.primary90 = #EADDFF -- a light purple. That is
// the same trap theme.js:50-58 documents for react-navigation's `card`:
// Paper's un-overridden MD3 tokens are tints of ITS own purple primary, not
// this theme's amber. The filled amber therefore comes from explicit style +
// color props.
//
// variant="surface" IS safe and is exactly the secondary treatment: Paper
// maps it to elevation.level3 for the background (utils.ts:195) and
// colors.primary for the icon (utils.ts:238), both defined by this theme in
// light and dark.
import React from 'react';
import { StyleSheet } from 'react-native';
import { FAB, useTheme } from 'react-native-paper';

/**
 * Floating action button at one of two emphasis levels.
 * @param {Object} props
 * @param {'primary'|'secondary'} [props.prominence] - 'primary' (default) is
 *   a 56dp filled amber FAB for the screen's main action; 'secondary' is a
 *   40dp low-emphasis one for a supporting action beside it.
 * @param {Object} [props.style] - Positioning, supplied by the caller (screen
 *   layout is not button identity). Merged LAST so it can place the FAB
 *   without dropping its background.
 */
export default function ActionFab({ prominence = 'primary', style, ...rest }) {
  const theme = useTheme();

  if (prominence === 'secondary') {
    return (
      // `rest` is spread FIRST so a caller can never override the props that
      // define this component's identity (size/variant/border).
      <FAB
        {...rest}
        size="small"
        variant="surface"
        style={[styles.secondary, { borderColor: theme.colors.primary }, style]}
      />
    );
  }

  return (
    <FAB
      {...rest}
      color={theme.colors.onPrimary}
      style={[{ backgroundColor: theme.colors.primary }, style]}
    />
  );
}

const styles = StyleSheet.create({
  secondary: {
    // Load-bearing, not decoration. variant="surface" resolves the background
    // to elevation.level3, which measures 1.11:1 (light) / 1.42:1 (dark)
    // against the page background -- the button is invisible AS A BUTTON and
    // only its icon reads, with the shape carried by a very faint elevation
    // shadow. WCAG 1.4.11 requires 3:1 for a boundary that identifies a
    // control. A colors.primary border measures 4.35:1 / 8.03:1 and doubles
    // as reinforcement that amber means action. (A colors.outline border was
    // measured and rejected: 1.54:1 / 1.83:1, still failing.)
    borderWidth: 1,
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/components/__tests__/ActionFab.test.js`

Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full gate and commit**

```bash
npm test && npm run lint && npm run format:check
git add src/components/ActionFab.js src/components/__tests__/ActionFab.test.js
git commit -m "feat: add ActionFab with amber primary and bordered secondary prominence"
```

---

### Task 2: Adopt ActionFab in both screens

**Files:**
- Modify: `src/screens/FileListScreen.js` (imports; the two `<FAB>` blocks at `:1072` and `:1125`; `styles.fab` / `styles.createFolderFab` at `:1238-1249`)
- Modify: `src/screens/ConnectionSelectScreen.js` (import at `:5`; the `<FAB>` block at `:135`)
- Test: `src/screens/__tests__/FileListScreen.test.js` (existing, should need **no changes** — see Step 1)

**Interfaces:**
- Consumes: `ActionFab` from Task 1.
- Produces: no new exports. Files gains a 56dp amber upload FAB and a 40dp bordered create-folder FAB, axis-aligned.

- [ ] **Step 1: Confirm the existing screen tests still pass unchanged**

`FileListScreen.test.js` finds FABs with `screen.UNSAFE_getAllByType(FAB).find((fab) => fab.props.icon === 'upload')` (`:213`, `:254`, `:274`). `UNSAFE_getAllByType` walks the **rendered** tree, and `ActionFab` renders a real Paper `FAB` with `icon` forwarded, so those queries keep matching. No test edit should be needed.

Run the baseline now so a later failure is unambiguous:

Run: `npx jest src/screens/__tests__/FileListScreen.test.js`
Expected: PASS (baseline, before any edit).

- [ ] **Step 2: Swap the FABs in FileListScreen**

In `src/screens/FileListScreen.js`, remove `FAB` from the `react-native-paper` import (`:23`) — the other named imports on that list stay — and add the component import next to the other component imports (near `:53`):

```javascript
import ActionFab from '../components/ActionFab';
```

Replace the create-folder FAB (currently at `:1072-1077`):

```javascript
      <ActionFab
        prominence="secondary"
        style={styles.createFolderFab}
        icon="folder-plus"
        onPress={() => setIsDialogVisible(true)}
        accessibilityLabel={i18n.t('createFolder')}
      />
```

Replace the upload FAB (currently at `:1125-1131`):

```javascript
      <ActionFab
        style={styles.fab}
        icon="upload"
        onPress={handleUpload}
        disabled={operationInFlight}
        accessibilityLabel={i18n.t('upload')}
      />
```

- [ ] **Step 3: Fix the FAB geometry**

Still in `src/screens/FileListScreen.js`, replace the `createFolderFab` style (currently `:1244-1249`). `fab` is unchanged:

```javascript
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 64,
  },
  createFolderFab: {
    position: 'absolute',
    margin: 16,
    // Both FABs use `right: 0`, so their margin decides how far the CENTRE
    // sits from the screen edge -- and they are different sizes. At 40dp the
    // small FAB's centre would land 36dp from the edge against the 56dp
    // FAB's 44dp, leaving the two visibly off-axis. +8 lines them up.
    marginRight: 24,
    right: 0,
    // Upload occupies 64 -> 120, so this is a clean 16dp gap (was 140, i.e.
    // an off-grid 20dp).
    bottom: 136,
  },
```

- [ ] **Step 4: Swap the FAB in ConnectionSelectScreen**

In `src/screens/ConnectionSelectScreen.js`, change the import at `:5` from:

```javascript
import { Text, FAB, IconButton, useTheme } from 'react-native-paper';
```

to:

```javascript
import { Text, IconButton, useTheme } from 'react-native-paper';
```

and add, next to the other component imports (near `:11`):

```javascript
import ActionFab from '../components/ActionFab';
```

Replace the FAB block at `:135-140`:

```javascript
      <ActionFab
        style={styles.fab}
        icon="plus"
        onPress={handleAddConnection}
        accessibilityLabel={i18n.t('addConnection')}
      />
```

`styles.fab` there (`:171-176`) is unchanged — it is the only FAB on that screen, so there is no axis to align.

- [ ] **Step 5: Run the gate and commit**

```bash
npm test && npm run lint && npm run format:check
```

Expected: PASS, including `FileListScreen.test.js`'s upload-FAB assertions (`disabled` while an operation is in flight) unchanged. If `UNSAFE_getAllByType(FAB)` no longer matches, the cause is `FAB` having been dropped from the **test's** import rather than anything in `ActionFab` — re-read Step 1 before changing assertions.

```bash
git add src/screens/FileListScreen.js src/screens/ConnectionSelectScreen.js
git commit -m "feat: use amber ActionFab across Files and Connections, align FAB axes"
```

---

# Part 2 — Sorting in Files

### Task 3: fileSorting domain module

**Files:**
- Create: `src/domain/fileSorting.js`
- Test: `src/domain/__tests__/fileSorting.test.js`

**Interfaces:**
- Consumes: `classifyKey` from `src/domain/fileTypes.js` (existing).
- Produces:
  - `SORT_CRITERIA: ['type', 'name', 'modified']`
  - `SORT_DIRECTIONS: ['asc', 'desc']`
  - `DEFAULT_SORT_CRITERION: 'type'`
  - `sortFiles(filesArray, criterion?, direction?) -> Array` — new array, input never mutated. Defaults: `criterion = DEFAULT_SORT_CRITERION`, `direction = defaultDirectionFor(criterion)`, so the existing one-argument call sites keep working.
  - `defaultDirectionFor(criterion) -> 'asc' | 'desc'`
  - `resolveSortCriterion(stored) -> string` — always a valid criterion.
  - `resolveSortDirection(stored, criterion) -> string` — always a valid direction.
  - `toEpochMs(value) -> number | null`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/fileSorting.test.js`:

```javascript
// src/domain/__tests__/fileSorting.test.js
//
// Pure sorting rules and preference validation. Two properties matter beyond
// the individual orders:
//
//  (a) EVERY comparator ends in a name tiebreak, so the order is total and
//      these tests can assert exact sequences without depending on
//      Array.prototype.sort stability.
//  (b) 'desc' reverses the COMPLETE visible order, tiebreak included --
//      reversed categories with names still running A-Z reads as a bug.
import {
  SORT_CRITERIA,
  SORT_DIRECTIONS,
  DEFAULT_SORT_CRITERION,
  sortFiles,
  defaultDirectionFor,
  resolveSortCriterion,
  resolveSortDirection,
  toEpochMs,
} from '../fileSorting';

// `mediaType` is what parseObjects stores, so fixtures carry it like real
// items do.
const file = (name, mediaType, lastModified = null) => ({
  id: name,
  key: name,
  name,
  isFolder: false,
  mediaType,
  lastModified,
});
const folder = (name) => ({ id: `${name}/`, key: `${name}/`, name, isFolder: true, lastModified: null });
const names = (items) => items.map((item) => item.name);

describe('constants', () => {
  it('exposes the three criteria and two directions', () => {
    expect(SORT_CRITERIA).toEqual(['type', 'name', 'modified']);
    expect(SORT_DIRECTIONS).toEqual(['asc', 'desc']);
    expect(DEFAULT_SORT_CRITERION).toBe('type');
  });
});

describe('toEpochMs', () => {
  it('converts a Date to epoch milliseconds', () => {
    expect(toEpochMs(new Date('2026-01-02T03:04:05.000Z'))).toBe(1767323045000);
  });

  it('passes an epoch number through', () => {
    expect(toEpochMs(1700000000000)).toBe(1700000000000);
  });

  it('parses an ISO string', () => {
    expect(toEpochMs('2026-01-02T03:04:05.000Z')).toBe(new Date('2026-01-02T03:04:05.000Z').getTime());
  });

  it('returns null for an invalid date string', () => {
    expect(toEpochMs('not a date')).toBeNull();
  });

  it('returns null for an invalid Date object', () => {
    expect(toEpochMs(new Date('nonsense'))).toBeNull();
  });

  it('returns null for undefined, null, and non-date types', () => {
    expect(toEpochMs(undefined)).toBeNull();
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs({})).toBeNull();
    expect(toEpochMs(NaN)).toBeNull();
  });
});

describe('defaultDirectionFor', () => {
  it("defaults 'modified' to newest-first", () => {
    // Otherwise picking "date modified" would show the OLDEST files first,
    // the opposite of the common case.
    expect(defaultDirectionFor('modified')).toBe('desc');
  });

  it("defaults 'type' and 'name' to ascending", () => {
    expect(defaultDirectionFor('type')).toBe('asc');
    expect(defaultDirectionFor('name')).toBe('asc');
  });
});

describe('resolveSortCriterion', () => {
  it('passes every valid criterion through', () => {
    SORT_CRITERIA.forEach((criterion) => {
      expect(resolveSortCriterion(criterion)).toBe(criterion);
    });
  });

  it('falls back to the default for unknown, empty, and non-string values', () => {
    // A preference written by a future build, or a corrupted one, must never
    // break the listing -- same contract as domain/localeResolver.
    [undefined, null, '', 'size', 42, {}].forEach((stored) => {
      expect(resolveSortCriterion(stored)).toBe('type');
    });
  });
});

describe('resolveSortDirection', () => {
  it('passes every valid direction through', () => {
    SORT_DIRECTIONS.forEach((direction) => {
      expect(resolveSortDirection(direction, 'name')).toBe(direction);
    });
  });

  it("falls back to the CRITERION's default, not a fixed one", () => {
    // The whole point of taking `criterion`: a corrupt direction stored
    // alongside 'modified' must resolve to 'desc', not 'asc'.
    expect(resolveSortDirection('sideways', 'modified')).toBe('desc');
    expect(resolveSortDirection('sideways', 'type')).toBe('asc');
  });

  it('falls back for empty, null, and non-string values', () => {
    [undefined, null, '', 7, {}].forEach((stored) => {
      expect(resolveSortDirection(stored, 'name')).toBe('asc');
      expect(resolveSortDirection(stored, 'modified')).toBe('desc');
    });
  });
});

describe('sortFiles: folders', () => {
  it('puts folders first under every criterion and direction', () => {
    const input = [file('b.jpg', 'image', 200), folder('zeta'), file('a.jpg', 'image', 100)];

    SORT_CRITERIA.forEach((criterion) => {
      SORT_DIRECTIONS.forEach((direction) => {
        expect(sortFiles(input, criterion, direction)[0].name).toBe('zeta');
      });
    });
  });

  it('orders folders among themselves by name, reversing only that order', () => {
    const input = [folder('beta'), folder('alpha'), folder('gamma')];

    expect(names(sortFiles(input, 'type', 'asc'))).toEqual(['alpha', 'beta', 'gamma']);
    expect(names(sortFiles(input, 'type', 'desc'))).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('ignores the criterion when ordering folders (they have no date or type)', () => {
    // Folders are CommonPrefixes: pure prefixes with no date, size, or
    // mediaType. Matches Finder / Explorer with "folders first" enabled.
    const input = [folder('beta'), folder('alpha')];

    expect(names(sortFiles(input, 'modified', 'asc'))).toEqual(['alpha', 'beta']);
    expect(names(sortFiles(input, 'name', 'asc'))).toEqual(['alpha', 'beta']);
  });
});

describe("sortFiles: criterion 'type'", () => {
  it('orders categories image, video, audio, document, archive, other', () => {
    const input = [
      file('f.bin', 'other'),
      file('e.zip', 'archive'),
      file('d.pdf', 'document'),
      file('c.mp3', 'audio'),
      file('b.mp4', 'video'),
      file('a.jpg', 'image'),
    ];

    expect(names(sortFiles(input, 'type', 'asc'))).toEqual([
      'a.jpg',
      'b.mp4',
      'c.mp3',
      'd.pdf',
      'e.zip',
      'f.bin',
    ]);
  });

  it('orders by name within a category', () => {
    const input = [file('c.jpg', 'image'), file('a.jpg', 'image'), file('b.jpg', 'image')];

    expect(names(sortFiles(input, 'type', 'asc'))).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('reverses categories AND the name tiebreak under desc', () => {
    const input = [file('a.jpg', 'image'), file('b.jpg', 'image'), file('c.mp4', 'video')];

    expect(names(sortFiles(input, 'type', 'desc'))).toEqual(['c.mp4', 'b.jpg', 'a.jpg']);
  });

  it('falls back to classifying the key when mediaType is absent', () => {
    // Items written by a build that predates a field, or hand-built ones,
    // must not all collapse into 'other'.
    const input = [{ name: 'clip.mp4', key: 'clip.mp4', isFolder: false }, { name: 'photo.jpg', key: 'photo.jpg', isFolder: false }];

    expect(names(sortFiles(input, 'type', 'asc'))).toEqual(['photo.jpg', 'clip.mp4']);
  });
});

describe("sortFiles: criterion 'name'", () => {
  it('sorts A-Z ascending and Z-A descending, ignoring type', () => {
    const input = [file('c.jpg', 'image'), file('a.mp4', 'video'), file('b.pdf', 'document')];

    expect(names(sortFiles(input, 'name', 'asc'))).toEqual(['a.mp4', 'b.pdf', 'c.jpg']);
    expect(names(sortFiles(input, 'name', 'desc'))).toEqual(['c.jpg', 'b.pdf', 'a.mp4']);
  });
});

describe("sortFiles: criterion 'modified'", () => {
  it('sorts oldest first ascending and newest first descending', () => {
    const input = [file('mid.jpg', 'image', 200), file('new.jpg', 'image', 300), file('old.jpg', 'image', 100)];

    expect(names(sortFiles(input, 'modified', 'asc'))).toEqual(['old.jpg', 'mid.jpg', 'new.jpg']);
    expect(names(sortFiles(input, 'modified', 'desc'))).toEqual(['new.jpg', 'mid.jpg', 'old.jpg']);
  });

  it('breaks equal timestamps by name, reversing that too under desc', () => {
    const input = [file('b.jpg', 'image', 100), file('a.jpg', 'image', 100)];

    expect(names(sortFiles(input, 'modified', 'asc'))).toEqual(['a.jpg', 'b.jpg']);
    expect(names(sortFiles(input, 'modified', 'desc'))).toEqual(['b.jpg', 'a.jpg']);
  });

  it('sorts undated items LAST in both directions', () => {
    // An unknown date is not a date to order by, so these do not take part
    // in the reversal. This is also the backward-compatibility path: cache
    // entries written before `lastModified` existed lack the field.
    const input = [file('none.jpg', 'image', null), file('new.jpg', 'image', 300), file('old.jpg', 'image', 100)];

    expect(names(sortFiles(input, 'modified', 'asc'))).toEqual(['old.jpg', 'new.jpg', 'none.jpg']);
    expect(names(sortFiles(input, 'modified', 'desc'))).toEqual(['new.jpg', 'old.jpg', 'none.jpg']);
  });

  it('orders several undated items among themselves by name', () => {
    const input = [file('z.jpg', 'image'), file('a.jpg', 'image'), file('dated.jpg', 'image', 100)];

    expect(names(sortFiles(input, 'modified', 'desc'))).toEqual(['dated.jpg', 'a.jpg', 'z.jpg']);
  });

  it('accepts a Date or an ISO string in lastModified', () => {
    const input = [
      file('iso.jpg', 'image', '2026-01-02T00:00:00.000Z'),
      file('date.jpg', 'image', new Date('2020-01-01T00:00:00.000Z')),
    ];

    expect(names(sortFiles(input, 'modified', 'asc'))).toEqual(['date.jpg', 'iso.jpg']);
  });
});

describe('sortFiles: contract', () => {
  it('returns a new array and never mutates the input', () => {
    const input = [file('b.jpg', 'image'), file('a.jpg', 'image')];

    const result = sortFiles(input, 'name', 'asc');

    expect(result).not.toBe(input);
    expect(names(input)).toEqual(['b.jpg', 'a.jpg']);
  });

  it('never mutates the items themselves', () => {
    const input = [file('a.jpg', 'image', 100)];

    sortFiles(input, 'modified', 'desc');

    expect(input[0]).toEqual(file('a.jpg', 'image', 100));
  });

  it('defaults to the type criterion in its default direction', () => {
    const input = [file('b.mp4', 'video'), file('a.jpg', 'image')];

    expect(sortFiles(input)).toEqual(sortFiles(input, 'type', 'asc'));
  });

  it('is deterministic: the same input always yields the same sequence', () => {
    const input = [
      file('b.jpg', 'image', 100),
      file('a.jpg', 'image', 100),
      folder('f'),
      file('c.pdf', 'document', 100),
    ];

    const first = names(sortFiles(input, 'type', 'asc'));
    expect(names(sortFiles(input, 'type', 'asc'))).toEqual(first);
    expect(names(sortFiles([...input].reverse(), 'type', 'asc'))).toEqual(first);
  });

  it('handles an empty and a nullish list', () => {
    expect(sortFiles([], 'name', 'asc')).toEqual([]);
    expect(sortFiles(undefined, 'name', 'asc')).toEqual([]);
  });
});
```

(The `1767323045000` literal above was computed with `node -e "console.log(new Date('2026-01-02T03:04:05.000Z').getTime())"`, not written from memory. Re-run that if you touch the date.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/domain/__tests__/fileSorting.test.js`

Expected: FAIL — `Cannot find module '../fileSorting'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/fileSorting.js`:

```javascript
// Pure sorting rules and sort-preference validation for the file listing.
// No React, AWS SDK, or Expo imports — fully unit-testable.
//
// Split out of fileListMapper (which re-exports `sortFiles` for its existing
// callers) following the precedent of fileTypes: fileListMapper's job is
// mapping S3 listings to items, while three criteria, a category order, a
// direction, and preference validation are a separate responsibility.
import { classifyKey } from './fileTypes';

export const SORT_CRITERIA = ['type', 'name', 'modified'];
export const SORT_DIRECTIONS = ['asc', 'desc'];
export const DEFAULT_SORT_CRITERION = 'type';

// Category display order for the 'type' criterion. Media the user most
// likely came to look at first, bulk/opaque formats last.
const CATEGORY_RANK = ['image', 'video', 'audio', 'document', 'archive', 'other'];

// Unknown categories sort after every known one rather than throwing off the
// order with a -1 from indexOf.
const rankOf = (category) => {
  const index = CATEGORY_RANK.indexOf(category);
  return index === -1 ? CATEGORY_RANK.length : index;
};

// An item's file-type category. Prefers the `mediaType` that parseObjects
// already computed; falls back to re-classifying the key so items lacking the
// field (hand-built ones, or anything written by an older build) still order
// sensibly instead of all collapsing into 'other'.
const categoryOf = (item) => item?.mediaType ?? classifyKey(item?.key ?? item?.name ?? '');

/**
 * Normalizes a modification date to epoch milliseconds.
 *
 * Milliseconds rather than a Date because the file-list cache round-trips
 * through JSON.stringify (see data/fileCacheRepository): a number survives
 * intact, a Date would come back as a string. The ISO-string branch is
 * defensive -- this app lists arbitrary S3-compatible providers whose
 * responses are not guaranteed to be as well-formed as AWS's.
 *
 * `null` is the single sentinel for "no usable date" (never undefined, never
 * NaN), so comparators have exactly one case to check and the field survives
 * JSON explicitly.
 * @param {Date|number|string|null|undefined} value
 * @returns {number|null}
 */
export const toEpochMs = (value) => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
};

/**
 * The direction a criterion starts in when the user picks it.
 *
 * Only 'modified' differs: newest-first is the common case, so defaulting it
 * to ascending would show the oldest files first. This is the Finder /
 * Explorer column-header convention -- clicking a new column starts in that
 * column's natural direction.
 * @param {string} criterion
 * @returns {'asc'|'desc'}
 */
export const defaultDirectionFor = (criterion) => (criterion === 'modified' ? 'desc' : 'asc');

/**
 * Validates a stored sort criterion, falling back to the default.
 *
 * Mirrors domain/localeResolver.resolveLocale: a preference written by a
 * future build, or a corrupted one, must never break the listing. Always
 * returns a usable value, so no caller needs a fallback of its own.
 * @param {*} stored
 * @returns {string}
 */
export const resolveSortCriterion = (stored) =>
  SORT_CRITERIA.includes(stored) ? stored : DEFAULT_SORT_CRITERION;

/**
 * Validates a stored sort direction, falling back to the criterion's default.
 *
 * Takes `criterion` on purpose: a corrupt direction stored alongside
 * 'modified' must resolve to 'desc', not to a fixed 'asc'.
 * @param {*} stored
 * @param {string} criterion
 * @returns {string}
 */
export const resolveSortDirection = (stored, criterion) =>
  SORT_DIRECTIONS.includes(stored) ? stored : defaultDirectionFor(criterion);

const byName = (a, b) => a.name.localeCompare(b.name);

// Ascending comparator for FILES (folders are handled separately). Every
// branch ends in a name tiebreak, so the resulting order is total and
// deterministic -- callers and tests can rely on an exact sequence without
// depending on Array.prototype.sort being stable.
const fileComparatorFor = (criterion) => {
  if (criterion === 'name') {
    return byName;
  }
  if (criterion === 'modified') {
    return (a, b) => {
      // Undated items are held out by sortFiles below, so both sides are
      // guaranteed to have a usable timestamp here.
      const delta = toEpochMs(a.lastModified) - toEpochMs(b.lastModified);
      return delta !== 0 ? delta : byName(a, b);
    };
  }
  return (a, b) => {
    const delta = rankOf(categoryOf(a)) - rankOf(categoryOf(b));
    return delta !== 0 ? delta : byName(a, b);
  };
};

/**
 * Sorts a listing by one criterion in one direction.
 *
 * Folders always come first, in every criterion and both directions, ordered
 * among themselves by name -- they are CommonPrefixes, pure prefixes with no
 * date, size, or mediaType. Under 'desc' only their internal name order
 * reverses. This matches Finder and Windows Explorer with "folders first".
 *
 * 'desc' reverses the COMPLETE order including the name tiebreak: reversed
 * categories with names still running A-Z would read as a bug.
 *
 * Returns a new array; neither the input array nor its items are mutated.
 * @param {Array<Object>} filesArray
 * @param {string} [criterion]
 * @param {string} [direction]
 * @returns {Array<Object>}
 */
export const sortFiles = (
  filesArray,
  criterion = DEFAULT_SORT_CRITERION,
  direction = defaultDirectionFor(criterion),
) => {
  const items = [...(filesArray ?? [])];
  const reverse = direction === 'desc' ? -1 : 1;

  const folders = items.filter((item) => item?.isFolder);
  const files = items.filter((item) => !item?.isFolder);

  folders.sort((a, b) => reverse * byName(a, b));

  // Under 'modified', items with no usable date sort LAST in both
  // directions: an unknown date is not a date to order by, so they are held
  // out of the reversal entirely rather than flipping to the front under
  // 'asc'. This is also what keeps cache entries written before
  // `lastModified` existed from producing NaN comparisons.
  const isUndated = (item) => toEpochMs(item.lastModified) === null;
  const dated = criterion === 'modified' ? files.filter((item) => !isUndated(item)) : files;
  const undated = criterion === 'modified' ? files.filter(isUndated) : [];

  const compare = fileComparatorFor(criterion);
  dated.sort((a, b) => reverse * compare(a, b));
  undated.sort(byName);

  return [...folders, ...dated, ...undated];
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/domain/__tests__/fileSorting.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm test -- src/domain && npm run lint && npm run format:check
git add src/domain/fileSorting.js src/domain/__tests__/fileSorting.test.js
git commit -m "feat: add fileSorting domain module with criteria, direction and resolvers"
```

`npm test` in full will still pass at this point — nothing imports the new module yet.

---

### Task 4: Capture lastModified in parseObjects

**Files:**
- Modify: `src/domain/fileListMapper.js` (the `sortFiles` definition at `:19-32`; the file-item push at `:64-73`; the folder push at `:85-90`)
- Test: `src/domain/__tests__/fileListMapper.test.js` (existing — extended, and four exact-shape assertions updated)

**Interfaces:**
- Consumes: `sortFiles`, `toEpochMs` from `src/domain/fileSorting.js` (Task 3).
- Produces: `parseObjects` items gain `lastModified: number | null`. `sortFiles` is still exported from `fileListMapper` with the Task 3 signature.

- [ ] **Step 1: Write the failing tests**

In `src/domain/__tests__/fileListMapper.test.js`, add `lastModified` coverage. Put this new `describe` immediately after the existing `describe('parseObjects', ...)` block closes:

```javascript
describe('parseObjects: lastModified', () => {
  it('captures LastModified as epoch milliseconds from a Date', () => {
    const when = new Date('2026-01-02T03:04:05.000Z');
    const listing = { contents: [{ Key: 'a.jpg', Size: 1, LastModified: when }], commonPrefixes: [] };

    expect(parseObjects(listing, '')[0].lastModified).toBe(when.getTime());
  });

  it('captures LastModified from an ISO string', () => {
    // Defensive: this app lists arbitrary S3-compatible providers, whose
    // responses are not guaranteed to be as well-formed as AWS's.
    const listing = {
      contents: [{ Key: 'a.jpg', Size: 1, LastModified: '2026-01-02T03:04:05.000Z' }],
      commonPrefixes: [],
    };

    expect(parseObjects(listing, '')[0].lastModified).toBe(
      new Date('2026-01-02T03:04:05.000Z').getTime(),
    );
  });

  it('stores null when LastModified is absent or unparseable', () => {
    const listing = {
      contents: [
        { Key: 'a.jpg', Size: 1 },
        { Key: 'b.jpg', Size: 1, LastModified: 'nonsense' },
      ],
      commonPrefixes: [],
    };
    const result = parseObjects(listing, '');

    // null, never undefined or NaN: one sentinel for the comparator to check,
    // and it survives the cache's JSON round-trip explicitly.
    expect(result[0].lastModified).toBeNull();
    expect(result[1].lastModified).toBeNull();
  });

  it('gives folder rows a null lastModified', () => {
    // CommonPrefixes are pure prefixes -- no date exists. Harmless because
    // folders always sort first by name.
    const listing = { contents: [], commonPrefixes: ['sub/'] };

    expect(parseObjects(listing, '')[0].lastModified).toBeNull();
  });
});

describe('sortFiles re-export', () => {
  it('is still exported from fileListMapper', () => {
    // It now LIVES in domain/fileSorting; this module re-exports it because
    // it was its original home and callers/tests import it from here.
    expect(typeof sortFiles).toBe('function');
  });

  it('accepts a criterion and direction', () => {
    const input = [
      { name: 'a.jpg', key: 'a.jpg', isFolder: false, mediaType: 'image' },
      { name: 'b.jpg', key: 'b.jpg', isFolder: false, mediaType: 'image' },
    ];

    expect(sortFiles(input, 'name', 'desc').map((i) => i.name)).toEqual(['b.jpg', 'a.jpg']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/domain/__tests__/fileListMapper.test.js`

Expected: FAIL — the four new `lastModified` tests report `undefined` instead of a number/`null`, and `sortFiles(input, 'name', 'desc')` ignores its extra arguments.

- [ ] **Step 3: Write the implementation**

In `src/domain/fileListMapper.js`, replace the whole `sortFiles` definition (`:19-32`) with a re-export, and import what is needed. The top of the file becomes:

```javascript
// Pure domain logic for mapping S3 listings into file/folder list items.
// No React, AWS SDK, or Expo imports — fully unit-testable.

import { classifyKey } from './fileTypes';
import { sortFiles, toEpochMs } from './fileSorting';

// Extension knowledge lives in `domain/fileTypes` (it also has to answer how
// to OPEN a key and what MIME type it is, and one owner beats three copies of
// the extension lists). Re-exported here because this module was its original
// home and callers/tests import it from here.
export { classifyKey };

// Sorting lives in `domain/fileSorting` for the same reason: three criteria,
// a category order, a direction, and preference validation are a separate
// responsibility from mapping a listing to items. Re-exported here because
// this module was its original home.
export { sortFiles };
```

Then add `lastModified` to the file item push (`:64-73`):

```javascript
    items.push({
      id: key, // Unique identifier based on S3 key.
      key: key,
      name: key.substring(currentPath.length),
      size: object.Size,
      isFolder: false,
      isVideo: mediaType === 'video',
      mediaType,
      // Normalized to epoch ms HERE, at parse time, rather than at sort
      // time: the file-list cache round-trips items through JSON.stringify,
      // where a number survives intact but a Date would come back as a
      // string (see domain/fileSorting.toEpochMs).
      lastModified: toEpochMs(object.LastModified),
      url: null,
    });
```

And to the folder push (`:85-90`):

```javascript
    items.push({
      id: prefix, // Unique identifier for folder.
      key: prefix,
      name,
      isFolder: true,
      // CommonPrefixes are pure prefixes: no date exists. Folders always
      // sort first by name, so this never affects the output.
      lastModified: null,
    });
```

- [ ] **Step 4: Update the exact-shape assertions this breaks**

Four existing assertions compare a whole parsed item with `toEqual`, so they now fail on the added field. Add `lastModified` to each — do **not** loosen them to `objectContaining`, the exact shape is the point.

Run: `npx jest src/domain/__tests__/fileListMapper.test.js`

Read the failures and fix each one:

- `~:201` — the multi-item `contents` shape. Each file object gains `lastModified: null` (that fixture passes no `LastModified`).
- `~:301` — the unicode file name shape. Gains `lastModified: null`.
- `~:318` — the unicode folder-prefix shape (`My Photos + Vidéos/`). Gains `lastModified: null`.
- `~:169` — `'derives folder rows from commonPrefixes, stripping the current prefix'`:

```javascript
    expect(result).toEqual([
      { id: 'sub/', key: 'sub/', name: 'sub', isFolder: true, lastModified: null },
    ]);
```

The existing seven `describe('sortFiles')` tests should need **no** changes: the new default is `('type', 'asc')`, and `categoryOf` falls back to `classifyKey` for their fixtures (which carry no `mediaType`), so `photo.jpg` still classifies as `image` and `clip.mp4` as `video`. If any of them fails, that fallback is missing from Task 3 — fix `fileSorting.js`, not the test.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/domain`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm test && npm run lint && npm run format:check
git add src/domain/fileListMapper.js src/domain/__tests__/fileListMapper.test.js
git commit -m "feat: capture LastModified as epoch ms in parseObjects"
```

---

### Task 5: Persist the sort preference

**Files:**
- Modify: `src/data/connectionRepository.js` (`KEYS` at `:38-43`; append accessors after `saveTheme` at `:336-338`)
- Test: `src/data/__tests__/connectionRepository.test.js` (existing — extended)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `getSortCriterion() -> Promise<string|null>`, `saveSortCriterion(value) -> Promise<void>`, `getSortDirection() -> Promise<string|null>`, `saveSortDirection(value) -> Promise<void>`. SecureStore keys `'sortCriterion'` and `'sortDirection'`, plain strings.

- [ ] **Step 1: Write the failing tests**

Append to `src/data/__tests__/connectionRepository.test.js`. **First read the top of that file** and match its existing SecureStore mock and import style rather than introducing a second convention:

```javascript
describe('sort preference', () => {
  it('returns the stored sort criterion', async () => {
    SecureStore.getItemAsync.mockResolvedValue('modified');

    await expect(connectionRepository.getSortCriterion()).resolves.toBe('modified');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('sortCriterion');
  });

  it('returns null when no sort criterion is stored', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);

    await expect(connectionRepository.getSortCriterion()).resolves.toBeNull();
  });

  it('persists the sort criterion', async () => {
    await connectionRepository.saveSortCriterion('name');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('sortCriterion', 'name');
  });

  it('returns the stored sort direction', async () => {
    SecureStore.getItemAsync.mockResolvedValue('desc');

    await expect(connectionRepository.getSortDirection()).resolves.toBe('desc');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('sortDirection');
  });

  it('returns null when no sort direction is stored', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);

    await expect(connectionRepository.getSortDirection()).resolves.toBeNull();
  });

  it('persists the sort direction', async () => {
    await connectionRepository.saveSortDirection('asc');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('sortDirection', 'asc');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/data/__tests__/connectionRepository.test.js`

Expected: FAIL — `connectionRepository.getSortCriterion is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/data/connectionRepository.js`, extend `KEYS` (`:38-43`):

```javascript
const KEYS = {
  CURRENT_BUCKET: 'currentBucket',
  LANGUAGE: 'appLanguage',
  PREVIEW: 'preview',
  THEME: 'appTheme',
  // Two keys rather than one composite 'modified:desc' value: one key per
  // preference is this file's existing convention, each value validates
  // independently (see domain/fileSorting's resolvers), and there is no
  // packed format to migrate later.
  SORT_CRITERION: 'sortCriterion',
  SORT_DIRECTION: 'sortDirection',
};
```

Append after `saveTheme` (`:336-338`):

```javascript
// --- Sort preference (plain strings; global, applies to every bucket) ---
//
// Neither getter validates: a stored-but-unknown value is resolved by
// domain/fileSorting.resolveSortCriterion / resolveSortDirection at the point
// of use, which is also where the per-criterion default direction lives.

// Returns the stored sort criterion, or null if none is stored.
export async function getSortCriterion() {
  return SecureStore.getItemAsync(KEYS.SORT_CRITERION);
}

// Persists the sort criterion.
export async function saveSortCriterion(value) {
  await SecureStore.setItemAsync(KEYS.SORT_CRITERION, value);
}

// Returns the stored sort direction, or null if none is stored.
export async function getSortDirection() {
  return SecureStore.getItemAsync(KEYS.SORT_DIRECTION);
}

// Persists the sort direction.
export async function saveSortDirection(value) {
  await SecureStore.setItemAsync(KEYS.SORT_DIRECTION, value);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/data/__tests__/connectionRepository.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm test && npm run lint && npm run format:check
git add src/data/connectionRepository.js src/data/__tests__/connectionRepository.test.js
git commit -m "feat: persist sort criterion and direction in SecureStore"
```

---

### Task 6: Own the sort preference in AuthContext

**Files:**
- Modify: `src/context/AuthContext.js` (imports at `:1-8`; state at `:12-19`; a new action after `changeTheme` at `:46-49`; `loadStoredData` after the `storedTheme` block at `:149-150`; the `useMemo` value and deps at `:161-194`)
- Test: `src/context/__tests__/AuthContext.test.js` (existing — mock factory extended, new describe block)

**Interfaces:**
- Consumes: `DEFAULT_SORT_CRITERION`, `defaultDirectionFor`, `resolveSortCriterion`, `resolveSortDirection` from `src/domain/fileSorting.js` (Task 3); the four accessors from Task 5.
- Produces, on the context value: `sortCriterion: string`, `sortDirection: string`, `changeSortCriterion(criterion) -> Promise<void>`, `toggleSortDirection() -> Promise<void>`.

- [ ] **Step 1: Extend the repository mock, then write the failing tests**

`AuthContext.test.js` mocks `connectionRepository` with an explicit factory (`:29-45`). Add the four new members, or every test in the file breaks with `is not a function`:

```javascript
  getTheme: jest.fn(),
  saveTheme: jest.fn(),
  getSortCriterion: jest.fn(),
  saveSortCriterion: jest.fn(),
  getSortDirection: jest.fn(),
  saveSortDirection: jest.fn(),
}));
```

Check that file's `beforeEach` and give the two new getters a default `mockResolvedValue(null)` alongside the existing ones, so unrelated tests keep loading cleanly.

Then add a new describe block:

```javascript
describe('sort preference', () => {
  it("defaults to 'type' ascending when nothing is stored", async () => {
    connectionRepository.getSortCriterion.mockResolvedValue(null);
    connectionRepository.getSortDirection.mockResolvedValue(null);

    const { result } = renderAuthContext();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sortCriterion).toBe('type');
    expect(result.current.sortDirection).toBe('asc');
  });

  it('loads a stored criterion and direction', async () => {
    connectionRepository.getSortCriterion.mockResolvedValue('name');
    connectionRepository.getSortDirection.mockResolvedValue('desc');

    const { result } = renderAuthContext();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sortCriterion).toBe('name');
    expect(result.current.sortDirection).toBe('desc');
  });

  it("resolves a corrupt direction against the STORED criterion's default", async () => {
    // The regression this guards: falling back to a fixed 'asc' would show
    // the oldest files first for a user whose criterion is 'modified'.
    connectionRepository.getSortCriterion.mockResolvedValue('modified');
    connectionRepository.getSortDirection.mockResolvedValue('sideways');

    const { result } = renderAuthContext();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sortCriterion).toBe('modified');
    expect(result.current.sortDirection).toBe('desc');
  });

  it('falls back to the default for a corrupt criterion', async () => {
    connectionRepository.getSortCriterion.mockResolvedValue('size');
    connectionRepository.getSortDirection.mockResolvedValue(null);

    const { result } = renderAuthContext();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sortCriterion).toBe('type');
  });

  it("changing the criterion applies that criterion's default direction and persists both", async () => {
    connectionRepository.getSortCriterion.mockResolvedValue(null);
    connectionRepository.getSortDirection.mockResolvedValue(null);

    const { result } = renderAuthContext();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.changeSortCriterion('modified');
    });

    expect(result.current.sortCriterion).toBe('modified');
    expect(result.current.sortDirection).toBe('desc');
    expect(connectionRepository.saveSortCriterion).toHaveBeenCalledWith('modified');
    expect(connectionRepository.saveSortDirection).toHaveBeenCalledWith('desc');
  });

  it('toggling flips the direction and persists it', async () => {
    connectionRepository.getSortCriterion.mockResolvedValue('name');
    connectionRepository.getSortDirection.mockResolvedValue('asc');

    const { result } = renderAuthContext();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleSortDirection();
    });

    expect(result.current.sortDirection).toBe('desc');
    expect(connectionRepository.saveSortDirection).toHaveBeenCalledWith('desc');

    await act(async () => {
      await result.current.toggleSortDirection();
    });

    expect(result.current.sortDirection).toBe('asc');
  });

  it('leaves the criterion alone when only the direction is toggled', async () => {
    connectionRepository.getSortCriterion.mockResolvedValue('modified');
    connectionRepository.getSortDirection.mockResolvedValue('desc');

    const { result } = renderAuthContext();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleSortDirection();
    });

    expect(result.current.sortCriterion).toBe('modified');
    expect(connectionRepository.saveSortCriterion).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/context/__tests__/AuthContext.test.js`

Expected: FAIL — `result.current.sortCriterion` is `undefined`; `changeSortCriterion is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/context/AuthContext.js`, add the import beside the other domain imports (after `:8`):

```javascript
import {
  DEFAULT_SORT_CRITERION,
  defaultDirectionFor,
  resolveSortCriterion,
  resolveSortDirection,
} from '../domain/fileSorting';
```

Add state after `const [theme, setTheme] = useState('system');` (`:19`):

```javascript
  // Global sort preference for the file listing: it applies to every bucket
  // and connection. Defaults are DERIVED from the domain module, never a
  // second hardcoded literal that could drift from it.
  const [sortCriterion, setSortCriterion] = useState(DEFAULT_SORT_CRITERION);
  const [sortDirection, setSortDirection] = useState(defaultDirectionFor(DEFAULT_SORT_CRITERION));
```

Add the two actions after `changeTheme` (`:46-49`):

```javascript
  // Picking a criterion also RESETS the direction to that criterion's
  // default (see domain/fileSorting.defaultDirectionFor): choosing "date
  // modified" should start newest-first, not inherit an 'asc' left over from
  // sorting by name. The toggle below then overrides it explicitly. This is
  // the Finder / Explorer column-header convention.
  const changeSortCriterion = useCallback(async (newCriterion) => {
    const newDirection = defaultDirectionFor(newCriterion);
    setSortCriterion(newCriterion);
    setSortDirection(newDirection);
    await connectionRepository.saveSortCriterion(newCriterion);
    await connectionRepository.saveSortDirection(newDirection);
  }, []);

  const toggleSortDirection = useCallback(async () => {
    const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    setSortDirection(newDirection);
    await connectionRepository.saveSortDirection(newDirection);
  }, [sortDirection]);
```

In `loadStoredData`, after the `storedTheme` block (`:149-150`):

```javascript
        // Both values go through the domain resolvers, so a preference
        // written by a future build or a corrupted one falls back instead of
        // breaking the listing. The direction is resolved AGAINST the
        // resolved criterion, so a corrupt direction stored alongside
        // 'modified' becomes 'desc' rather than a fixed 'asc'.
        const storedSortCriterion = await connectionRepository.getSortCriterion();
        const resolvedSortCriterion = resolveSortCriterion(storedSortCriterion);
        setSortCriterion(resolvedSortCriterion);

        const storedSortDirection = await connectionRepository.getSortDirection();
        setSortDirection(resolveSortDirection(storedSortDirection, resolvedSortCriterion));
```

Finally add all four entries to **both** the `useMemo` value and its dependency array (`:161-194`). The value gains:

```javascript
      sortCriterion,
      sortDirection,
      changeSortCriterion,
      toggleSortDirection,
```

and the deps array gains the same four identifiers. Missing them from the deps would freeze consumers on a stale sort.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/context/__tests__/AuthContext.test.js`

Expected: PASS, including the pre-existing tests in that file.

- [ ] **Step 5: Commit**

```bash
npm test && npm run lint && npm run format:check
git add src/context/AuthContext.js src/context/__tests__/AuthContext.test.js
git commit -m "feat: own global sort preference in AuthContext"
```

---

### Task 7: Reorder without refetching in useFileList

**Files:**
- Modify: `src/hooks/useFileList.js` (imports at `:1-17`; signature at `:53`; refs near `:79`; `fetchFiles` state blocks at `:105-111` and `:147-151`; the reset branch at `:246-251`; a new effect after the main fetch effect at `:278`; the `visibleFiles` memo at `:291-295`)
- Test: `src/hooks/__tests__/useFileList.test.js` (existing — extended)

**Interfaces:**
- Consumes: `sortFiles`, `DEFAULT_SORT_CRITERION`, `defaultDirectionFor` (Task 3, imported via `fileListMapper` for `sortFiles` as it already is, and from `fileSorting` for the two constants).
- Produces: `useFileList(currentConnection, currentBucket, sortCriterion?, sortDirection?)`. Return shape is unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/hooks/__tests__/useFileList.test.js`. Note the fixtures give `mediaType` and `lastModified` because that is what `parseObjects` now produces:

```javascript
  describe('(d) sorting is a client-side reorder, never a refetch', () => {
    // Six items so PAGE_SIZE slicing is observable, in a deliberately
    // scrambled order.
    const listingForSort = {
      contents: [
        { Key: 'b.jpg', Size: 1, LastModified: new Date('2026-01-02T00:00:00.000Z') },
        { Key: 'a.mp4', Size: 1, LastModified: new Date('2026-01-03T00:00:00.000Z') },
        { Key: 'c.pdf', Size: 1, LastModified: new Date('2026-01-01T00:00:00.000Z') },
      ],
      commonPrefixes: ['zfolder/'],
    };

    it('does not call listAllObjects again when the criterion changes', async () => {
      listAllObjects.mockResolvedValue(listingForSort);

      const { result, rerender } = renderHook(
        ({ criterion, direction }) => useFileList(CONNECTION_A, 'bucket-a', criterion, direction),
        { initialProps: { criterion: 'type', direction: 'asc' } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(listAllObjects).toHaveBeenCalledTimes(1);

      rerender({ criterion: 'name', direction: 'asc' });
      await waitFor(() => expect(result.current.fullFiles[1].name).toBe('a.mp4'));

      // The regression this guards: putting the criterion into fetchFiles'
      // useCallback deps changes its identity, which is itself a dep of the
      // main fetch effect -- so a pure reorder would refetch the listing AND
      // re-sign every preview URL.
      expect(listAllObjects).toHaveBeenCalledTimes(1);
    });

    it('reorders fullFiles when the criterion changes', async () => {
      listAllObjects.mockResolvedValue(listingForSort);

      const { result, rerender } = renderHook(
        ({ criterion, direction }) => useFileList(CONNECTION_A, 'bucket-a', criterion, direction),
        { initialProps: { criterion: 'type', direction: 'asc' } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      // 'type': folder first, then image, video, document.
      expect(result.current.fullFiles.map((f) => f.name)).toEqual([
        'zfolder',
        'b.jpg',
        'a.mp4',
        'c.pdf',
      ]);

      rerender({ criterion: 'name', direction: 'asc' });

      await waitFor(() =>
        expect(result.current.fullFiles.map((f) => f.name)).toEqual([
          'zfolder',
          'a.mp4',
          'b.jpg',
          'c.pdf',
        ]),
      );
    });

    it('honours the direction', async () => {
      listAllObjects.mockResolvedValue(listingForSort);

      const { result, rerender } = renderHook(
        ({ criterion, direction }) => useFileList(CONNECTION_A, 'bucket-a', criterion, direction),
        { initialProps: { criterion: 'name', direction: 'asc' } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      rerender({ criterion: 'name', direction: 'desc' });

      await waitFor(() =>
        expect(result.current.fullFiles.map((f) => f.name)).toEqual([
          'zfolder',
          'c.pdf',
          'b.jpg',
          'a.mp4',
        ]),
      );
    });

    it('rebuilds displayedFiles and mediaFiles alongside fullFiles', async () => {
      listAllObjects.mockResolvedValue(listingForSort);

      const { result, rerender } = renderHook(
        ({ criterion, direction }) => useFileList(CONNECTION_A, 'bucket-a', criterion, direction),
        { initialProps: { criterion: 'type', direction: 'asc' } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      rerender({ criterion: 'name', direction: 'desc' });
      await waitFor(() => expect(result.current.fullFiles[1].name).toBe('c.pdf'));

      // displayedFiles is a slice of fullFiles and mediaFiles drives the
      // media viewer's paging, so a reorder that updated only fullFiles
      // would leave a window sliced from the PREVIOUS order.
      expect(result.current.displayedFiles).toEqual(result.current.fullFiles.slice(0, PAGE_SIZE));
      // mediaFiles is fullFiles FILTERED, so it keeps the new order: under
      // name-desc the files run c.pdf, b.jpg, a.mp4, and c.pdf is not
      // previewable.
      expect(result.current.mediaFiles.map((f) => f.name)).toEqual(['b.jpg', 'a.mp4']);
    });

    it('resets the pagination window to the first page on reorder', async () => {
      // More than one page, so a stale window is detectable.
      const many = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => ({
        Key: `file-${String(i).padStart(3, '0')}.jpg`,
        Size: 1,
        LastModified: new Date('2026-01-01T00:00:00.000Z'),
      }));
      listAllObjects.mockResolvedValue({ contents: many, commonPrefixes: [] });

      const { result, rerender } = renderHook(
        ({ criterion, direction }) => useFileList(CONNECTION_A, 'bucket-a', criterion, direction),
        { initialProps: { criterion: 'name', direction: 'asc' } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.loadMoreFiles();
      });
      await waitFor(() => expect(result.current.displayedFiles.length).toBe(PAGE_SIZE + 3));

      rerender({ criterion: 'name', direction: 'desc' });

      await waitFor(() => expect(result.current.displayedFiles.length).toBe(PAGE_SIZE));
    });

    it('applies the active criterion to search results', async () => {
      listAllObjects.mockResolvedValue(listingForSort);

      const { result, rerender } = renderHook(
        ({ criterion, direction }) => useFileList(CONNECTION_A, 'bucket-a', criterion, direction),
        { initialProps: { criterion: 'name', direction: 'asc' } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.setSearchQuery('.');
      });
      await waitFor(() => expect(result.current.visibleFiles.length).toBe(3));
      expect(result.current.visibleFiles.map((f) => f.name)).toEqual(['a.mp4', 'b.jpg', 'c.pdf']);

      rerender({ criterion: 'name', direction: 'desc' });

      await waitFor(() =>
        expect(result.current.visibleFiles.map((f) => f.name)).toEqual(['c.pdf', 'b.jpg', 'a.mp4']),
      );
    });

    it('defaults to the type criterion when no preference is passed', async () => {
      listAllObjects.mockResolvedValue(listingForSort);

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.fullFiles.map((f) => f.name)).toEqual([
        'zfolder',
        'b.jpg',
        'a.mp4',
        'c.pdf',
      ]);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/hooks/__tests__/useFileList.test.js`

Expected: FAIL — the hook ignores its 3rd/4th arguments, so the reorder assertions never see a new order.

- [ ] **Step 3: Add the sort arguments and refs**

In `src/hooks/useFileList.js`, extend the domain imports (`:5-12`) with the two constants — `sortFiles` is already imported from `fileListMapper`:

```javascript
import { DEFAULT_SORT_CRITERION, defaultDirectionFor } from '../domain/fileSorting';
```

Change the signature (`:53`):

```javascript
export default function useFileList(
  currentConnection,
  currentBucket,
  sortCriterion = DEFAULT_SORT_CRITERION,
  sortDirection = defaultDirectionFor(DEFAULT_SORT_CRITERION),
) {
```

Add the refs next to `prevOriginRef` (after `:79`):

```javascript
  // Sort preference read INSIDE fetchFiles through refs, deliberately not
  // through its useCallback deps. fetchFiles' identity is a dependency of
  // the main fetch effect below, so adding the criterion there would refetch
  // the whole listing -- and re-sign every preview URL -- for what is a
  // purely client-side reorder. The reorder effect below keeps these current.
  const sortCriterionRef = useRef(sortCriterion);
  const sortDirectionRef = useRef(sortDirection);
  // Mirrors `fullFiles` so the reorder effect can re-sort the loaded listing
  // without taking `fullFiles` as a dependency (which would re-run it on
  // every fetch and reset the pagination window).
  const fullFilesRef = useRef([]);
```

- [ ] **Step 4: Extract the applyItems helper and use it at all three sites**

Still in `src/hooks/useFileList.js`, add this immediately before `fetchFiles` (`:81`):

```javascript
  // Single owner of "this is the listing now". fullFiles, displayedFiles and
  // mediaFiles must always be rebuilt TOGETHER: displayedFiles is a
  // page-slice of fullFiles, and mediaFiles drives the media viewer's paging
  // (FileListScreen's handleModalReachEnd compares against
  // displayedFiles.length), so updating one without the others leaves a
  // window sliced from a previous order. The page counter resets to 1 for
  // the same reason. The cache-hit path, the fresh-fetch path and the
  // reorder effect all go through here -- the first two previously
  // duplicated this block verbatim.
  const applyItems = useCallback((items) => {
    fullFilesRef.current = items;
    setFullFiles(items);
    setDisplayedFiles(items.slice(0, PAGE_SIZE));
    setMediaFiles(items.filter((f) => !f.isFolder && isPreviewableMediaType(f.mediaType)));
    setLoading(false);
    setPage(1);
  }, []);
```

Replace the cache-hit block (`:96-112`) so it sorts with the refs and ends in `applyItems`:

```javascript
          const sortedItems = sortFiles(
            stampItemOrigin(cachedItems, currentConnection?.id, currentBucket),
            sortCriterionRef.current,
            sortDirectionRef.current,
          );
          // The cache never stores `url` (see stripVolatileFields below), so
          // previewable items always need a freshly-signed URL here.
          await attachSignedUrls(sortedItems, currentConnection, currentBucket);
          if (!isActive()) {
            return; // Unmounted, or superseded by a newer fetch: cancel.
          }
          applyItems(sortedItems);
          return; // Exit early to avoid fetching from server.
```

Replace the fresh-fetch sort and state block (`:142-157`):

```javascript
        // Sort first, then dedupe (preserving the original sequence).
        items = sortFiles(items, sortCriterionRef.current, sortDirectionRef.current);
        items = dedupeById(items);

        // Update state and cache.
        if (isActive()) {
          applyItems(items);
          // Never persist `url`: it's a presigned URL with a 1h TTL, far
          // shorter than the file-list cache's TTL (see
          // domain/fileListMapper.stripVolatileFields).
          await setCachedItems(cacheKey, stripVolatileFields(items));
        }
```

Add `applyItems` to `fetchFiles`' dependency array (`:166`):

```javascript
    [currentConnection, currentBucket, currentPath, applyItems],
```

`applyItems` is memoized on `[]`, so its identity is stable forever and `fetchFiles`' identity is unchanged in practice — the main fetch effect still does not re-run.

Replace the no-connection reset branch (`:246-251`) so the ref stays in sync:

```javascript
        prevOriginRef.current = { connectionId: undefined, bucket: undefined };
        applyItems([]);
        return;
```

- [ ] **Step 5: Add the reorder effect**

Insert immediately after the main fetch effect closes (after `:278`):

```javascript
  // Re-sorts the ALREADY-LOADED listing when the sort preference changes.
  // This is a client-side reorder, not a new request: listAllObjects
  // paginates until the current level is exhausted, so fullFiles always
  // holds the complete current-level listing and there is nothing to fetch.
  //
  // The refs are updated here (not in fetchFiles' deps) so the next fetch
  // sorts with the current preference while fetchFiles' identity stays
  // stable — see the refs' declaration above.
  useEffect(() => {
    sortCriterionRef.current = sortCriterion;
    sortDirectionRef.current = sortDirection;

    // Nothing loaded yet: skip. Calling applyItems here would set
    // loading=false during the very first fetch and flash the empty state.
    if (fullFilesRef.current.length === 0) {
      return;
    }

    applyItems(sortFiles(fullFilesRef.current, sortCriterion, sortDirection));
  }, [sortCriterion, sortDirection, applyItems]);
```

- [ ] **Step 6: Apply the criterion to search results**

Replace the `visibleFiles` memo (`:291-295`):

```javascript
  const visibleFiles = useMemo(() => {
    return trimmedQuery
      ? sortFiles(
          fullFiles.filter((file) => file.name.toLowerCase().includes(trimmedQuery)),
          sortCriterion,
          sortDirection,
        )
      : displayedFiles;
  }, [trimmedQuery, fullFiles, displayedFiles, sortCriterion, sortDirection]);
```

Reading the props directly is correct here — unlike `fetchFiles`, this memo's identity is not a dependency of the fetch effect.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx jest src/hooks/__tests__/useFileList.test.js`

Expected: PASS, including the pre-existing groups (a), (b) and (c) — especially (a)'s "fetches exactly once" counts, which are the same property Trap 2 is about.

- [ ] **Step 8: Commit**

```bash
npm test && npm run lint && npm run format:check
git add src/hooks/useFileList.js src/hooks/__tests__/useFileList.test.js
git commit -m "feat: reorder the loaded listing without refetching in useFileList"
```

---

### Task 8: SortMenu component

**Files:**
- Create: `src/components/SortMenu.js`
- Test: `src/components/__tests__/SortMenu.test.js`
- Modify: `src/locales/translations.js` (six keys in both `en` and `es` — needed here because the component renders them)

**Interfaces:**
- Consumes: `SORT_CRITERIA`, `resolveSortCriterion` from `src/domain/fileSorting.js` (Task 3).
- Produces: `SortMenu` — default export. Props: `criterion`, `direction`, `onChangeCriterion(criterion)`, `onToggleDirection()`, `testID`.

- [ ] **Step 1: Add the i18n keys**

In `src/locales/translations.js`, add to the `en` object (near the existing `listView` / `gridView` keys at `:35-36`):

```javascript
  sortBy: 'Sort by',
  sortByType: 'File type',
  sortByName: 'Name',
  sortByModified: 'Date modified',
  sortAscending: 'Ascending',
  sortDescending: 'Descending',
```

and the same six keys to the `es` object (near `:112-113`) — the locale-parity test requires identical key sets:

```javascript
  sortBy: 'Ordenar por',
  sortByType: 'Tipo de archivo',
  sortByName: 'Nombre',
  sortByModified: 'Fecha de modificación',
  sortAscending: 'Ascendente',
  sortDescending: 'Descendente',
```

Run: `npx jest src/locales`
Expected: PASS (parity holds).

- [ ] **Step 2: Write the failing test**

Create `src/components/__tests__/SortMenu.test.js`:

```javascript
// src/components/__tests__/SortMenu.test.js
//
// The gesture that makes this component distinct from ThemedSelect: tapping
// the ALREADY-ACTIVE criterion reverses the direction. ThemedSelect
// deliberately does the opposite (it swallows a re-pick of the current
// value), which is why this is its own component rather than a variant.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import SortMenu from '../SortMenu';
import { darkTheme } from '../../theme/theme';
import i18n from '../../locales/translations';

const renderMenu = (props = {}) => {
  const onChangeCriterion = jest.fn();
  const onToggleDirection = jest.fn();
  render(
    <PaperProvider theme={darkTheme}>
      <SortMenu
        criterion="type"
        direction="asc"
        onChangeCriterion={onChangeCriterion}
        onToggleDirection={onToggleDirection}
        testID="sort"
        {...props}
      />
    </PaperProvider>,
  );
  const open = () => fireEvent.press(screen.getByTestId('sort'));
  return { onChangeCriterion, onToggleDirection, open };
};

describe('SortMenu', () => {
  beforeEach(() => {
    i18n.locale = 'en';
  });

  it('renders one item per criterion', () => {
    const { open } = renderMenu();
    open();

    expect(screen.getByText('File type')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Date modified')).toBeTruthy();
  });

  it('marks the active criterion with an up arrow when ascending', () => {
    const { open } = renderMenu({ criterion: 'name', direction: 'asc' });
    open();

    expect(screen.getByTestId('sort-item-name').props.trailingIcon).toBe('arrow-up');
  });

  it('marks the active criterion with a down arrow when descending', () => {
    const { open } = renderMenu({ criterion: 'name', direction: 'desc' });
    open();

    expect(screen.getByTestId('sort-item-name').props.trailingIcon).toBe('arrow-down');
  });

  it('leaves inactive criteria without a trailing icon', () => {
    const { open } = renderMenu({ criterion: 'name', direction: 'asc' });
    open();

    expect(screen.getByTestId('sort-item-type').props.trailingIcon).toBeUndefined();
    expect(screen.getByTestId('sort-item-modified').props.trailingIcon).toBeUndefined();
  });

  it('toggles the direction when the ACTIVE criterion is tapped', () => {
    const { onChangeCriterion, onToggleDirection, open } = renderMenu({ criterion: 'name' });
    open();

    fireEvent.press(screen.getByText('Name'));

    expect(onToggleDirection).toHaveBeenCalledTimes(1);
    expect(onChangeCriterion).not.toHaveBeenCalled();
  });

  it('switches criterion when an INACTIVE one is tapped', () => {
    const { onChangeCriterion, onToggleDirection, open } = renderMenu({ criterion: 'name' });
    open();

    fireEvent.press(screen.getByText('Date modified'));

    expect(onChangeCriterion).toHaveBeenCalledWith('modified');
    expect(onToggleDirection).not.toHaveBeenCalled();
  });

  it('announces what it controls plus the current criterion and direction', () => {
    renderMenu({ criterion: 'modified', direction: 'desc' });

    // The visible affordance is a bare sort icon, which alone says neither
    // what it sorts nor how it is sorted right now.
    expect(screen.getByLabelText('Sort by Date modified Descending')).toBeTruthy();
  });

  it('survives a corrupt criterion without crashing', () => {
    const { open } = renderMenu({ criterion: 'size' });
    open();

    // Resolved through the domain fallback, so a preference from a future
    // build renders as the default rather than an empty label.
    expect(screen.getByTestId('sort-item-type').props.trailingIcon).toBe('arrow-up');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/components/__tests__/SortMenu.test.js`

Expected: FAIL — `Cannot find module '../SortMenu'`.

- [ ] **Step 4: Write the implementation**

Create `src/components/SortMenu.js`:

```javascript
// src/components/SortMenu.js
//
// Icon-anchored menu for choosing the file-listing sort criterion, with the
// direction folded into the same gesture: tapping the ACTIVE criterion
// reverses it, tapping an inactive one switches to it in that criterion's
// natural direction (domain/fileSorting.defaultDirectionFor, applied by
// AuthContext.changeSortCriterion).
//
// Deliberately NOT a variant of ThemedSelect:
//  - ThemedSelect is shaped for Settings rows (width: '100%', marginBottom,
//    outlined full-width Button anchor). An icon anchor would make its
//    anchor, styles, label and width all conditional.
//  - ThemedSelect deliberately does NOT fire onChange when the current value
//    is re-picked. Here that re-pick IS the toggle gesture -- the exact
//    inverse contract.
//
// No contentStyle needed: Paper's Menu already takes its background from
// theme.colors.elevation.level2 by default (Menu.tsx, elevation = 2), so
// there is no native/JS theming split to paper over.
import React, { useState } from 'react';
import { IconButton, Menu } from 'react-native-paper';
import i18n from '../locales/translations';
import { SORT_CRITERIA, resolveSortCriterion } from '../domain/fileSorting';

// One i18n key per criterion, so adding a criterion in the domain module
// fails loudly here rather than rendering a blank row.
const LABEL_KEYS = {
  type: 'sortByType',
  name: 'sortByName',
  modified: 'sortByModified',
};

/**
 * Sort control for the file listing.
 * @param {Object} props
 * @param {string} props.criterion - Active criterion.
 * @param {string} props.direction - Active direction ('asc' | 'desc').
 * @param {(criterion: string) => void} props.onChangeCriterion - Called when
 *   a DIFFERENT criterion is chosen.
 * @param {() => void} props.onToggleDirection - Called when the active
 *   criterion is re-picked.
 * @param {string} [props.testID]
 */
export default function SortMenu({
  criterion,
  direction,
  onChangeCriterion,
  onToggleDirection,
  testID,
}) {
  const [visible, setVisible] = useState(false);
  const close = () => setVisible(false);

  // Resolved rather than trusted: a preference written by a future build
  // would otherwise render a row with no label and mark nothing as active.
  const activeCriterion = resolveSortCriterion(criterion);
  const isAscending = direction !== 'desc';
  const directionLabel = i18n.t(isAscending ? 'sortAscending' : 'sortDescending');

  const handlePress = (value) => {
    close();
    if (value === activeCriterion) {
      onToggleDirection();
    } else {
      onChangeCriterion(value);
    }
  };

  return (
    <Menu
      visible={visible}
      onDismiss={close}
      anchor={
        <IconButton
          icon="sort"
          onPress={() => setVisible(true)}
          testID={testID}
          // The icon alone says neither what it sorts nor how it is sorted
          // right now, so the announced label carries both.
          accessibilityLabel={`${i18n.t('sortBy')} ${i18n.t(
            LABEL_KEYS[activeCriterion],
          )} ${directionLabel}`}
        />
      }
    >
      {SORT_CRITERIA.map((value) => {
        const isActive = value === activeCriterion;
        const label = i18n.t(LABEL_KEYS[value]);
        return (
          <Menu.Item
            key={value}
            testID={testID ? `${testID}-item-${value}` : undefined}
            onPress={() => handlePress(value)}
            title={label}
            // Only the active row carries an arrow; it doubles as the
            // affordance for "tap me again to reverse".
            trailingIcon={isActive ? (isAscending ? 'arrow-up' : 'arrow-down') : undefined}
            accessibilityLabel={isActive ? `${label} ${directionLabel}` : label}
          />
        );
      })}
    </Menu>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/components/__tests__/SortMenu.test.js`

Expected: PASS.

If `getByTestId('sort-item-name').props.trailingIcon` comes back `undefined` for the active row, the `testID` is landing on a wrapper rather than the `Menu.Item` — query `screen.UNSAFE_getAllByType(Menu.Item)` and match on `props.title` instead of changing the component.

- [ ] **Step 6: Commit**

```bash
npm test && npm run lint && npm run format:check
git add src/components/SortMenu.js src/components/__tests__/SortMenu.test.js src/locales/translations.js
git commit -m "feat: add SortMenu with criterion choice and direction toggle"
```

---

### Task 9: Wire the sort control into Files

**Files:**
- Modify: `src/screens/FileListScreen.js` (context destructure at `:66`; the `useFileList` call at `:68-84`; the action row at `:964-985`)
- Test: `src/screens/__tests__/FileListScreen.test.js` (existing — context value extended, new test)

**Interfaces:**
- Consumes: `SortMenu` (Task 8); `sortCriterion`, `sortDirection`, `changeSortCriterion`, `toggleSortDirection` from `AuthContext` (Task 6); the extended `useFileList` signature (Task 7).
- Produces: nothing new. The control lives **only** in Files — not in Settings, even though the preference is global.

- [ ] **Step 1: Write the failing test**

In `src/screens/__tests__/FileListScreen.test.js`, extend the `AuthContext.Provider` value (`:124-126`) so the screen has a preference and the actions to change it:

```javascript
      <AuthContext.Provider
        value={{
          currentConnection: CONNECTION,
          currentBucket: 'bucket-a',
          preview: 'false',
          sortCriterion: 'type',
          sortDirection: 'asc',
          changeSortCriterion: mocks.changeSortCriterion,
          toggleSortDirection: mocks.toggleSortDirection,
        }}
      >
```

Read that file's render helper first and add `changeSortCriterion: jest.fn()` / `toggleSortDirection: jest.fn()` to whatever object it already returns as `mocks`, so the new test can assert on them.

Then add:

```javascript
describe('FileListScreen sort control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    i18n.locale = 'en';
  });

  it('reaches the context action when a new criterion is chosen', () => {
    const mocks = renderScreen();

    fireEvent.press(screen.getByTestId('sort-menu'));
    fireEvent.press(screen.getByText('Date modified'));

    expect(mocks.changeSortCriterion).toHaveBeenCalledWith('modified');
  });

  it('reaches the context toggle when the active criterion is re-picked', () => {
    const mocks = renderScreen();

    fireEvent.press(screen.getByTestId('sort-menu'));
    fireEvent.press(screen.getByText('File type'));

    expect(mocks.toggleSortDirection).toHaveBeenCalledTimes(1);
  });

  it('passes the active preference down to useFileList', () => {
    renderScreen();

    expect(useFileList).toHaveBeenCalledWith(
      expect.anything(),
      'bucket-a',
      'type',
      'asc',
    );
  });
});
```

`fireEvent` and `i18n` are already imported by that file; check the render-helper's name (`renderScreen` here) and match it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/__tests__/FileListScreen.test.js`

Expected: FAIL — `Unable to find an element with testID: sort-menu`.

- [ ] **Step 3: Write the implementation**

In `src/screens/FileListScreen.js`, add the import beside the other component imports (near `:53`):

```javascript
import SortMenu from '../components/SortMenu';
```

Extend the context destructure (`:66`):

```javascript
  const {
    currentConnection,
    currentBucket,
    preview,
    sortCriterion,
    sortDirection,
    changeSortCriterion,
    toggleSortDirection,
  } = useContext(AuthContext);
```

Pass the preference to the hook (`:84`):

```javascript
  } = useFileList(currentConnection, currentBucket, sortCriterion, sortDirection);
```

Add the control to the action row, after the view-toggle `IconButton` and before the select-all one (`:978`):

```javascript
        <SortMenu
          criterion={sortCriterion}
          direction={sortDirection}
          onChangeCriterion={changeSortCriterion}
          onToggleDirection={toggleSortDirection}
          testID="sort-menu"
        />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/screens/__tests__/FileListScreen.test.js`

Expected: PASS, including that file's pre-existing pull-to-refresh and upload-FAB tests.

- [ ] **Step 5: Run the full gate and commit**

```bash
npm test && npm run lint && npm run format:check
git add src/screens/FileListScreen.js src/screens/__tests__/FileListScreen.test.js
git commit -m "feat: add the sort control to the Files action row"
```

- [ ] **Step 6: Confirm the golden-rule files are untouched**

```bash
git diff --stat main -- app.json eas.json plugin/ package.json
```

Expected: empty output. Any diff here violates Global Constraints 1 or 2 and must be reverted.

---

## Manual verification (after Task 9)

The automated suite cannot see color, contrast, or geometry. On device, in **both** light and dark mode:

1. **Files:** the upload FAB is filled amber with a legible icon; the create-folder FAB above it is small, low-emphasis, with a **visible amber ring** — check that it reads as a button, not a floating icon. That ring is the WCAG 1.4.11 fix and is the one thing a reviewer is most likely to dismiss as decoration.
2. Both FABs share one vertical axis, with an even gap.
3. **Connections:** the add FAB is filled amber.
4. **No purple anywhere.** Purple is the signature of the `primaryContainer` fallback.
5. Sort by each criterion; re-tap the active one to reverse. The arrow follows the direction.
6. Pick "Date modified": it starts newest-first.
7. Force-quit and relaunch: the criterion and direction are still active.
8. Reorder a large folder, then scroll — pagination continues from the new first page rather than jumping.
9. Open an image from a reordered listing and page through the viewer: the order matches the list.
10. Reorder while a search query is active: the filtered results follow the criterion.
11. Reorder on a folder whose cache predates this change (or clear/expire the cache): under "Date modified", undated items sit at the end in both directions, and nothing crashes.

## Self-review notes

Recorded for the implementer, from checking this plan back against the spec:

- **Spec coverage:** every numbered spec section maps to a task — 1.2/1.3 → Task 1, 1.2 geometry → Task 2, 2.2/2.3 → Tasks 3–4, 2.7 → Tasks 5–6, 2.4 → Task 7, 2.6/2.8 → Tasks 8–9. Spec §2.10 (no date in the list, no Settings control) is a non-goal and correctly has no task.
- **Two test breakages the spec did not anticipate**, both handled inline rather than left to be discovered: Task 4 Step 4 lists the four exact-shape `parseObjects` assertions that the added `lastModified` field breaks; Task 6 Step 1 and Task 9 Step 1 extend the `connectionRepository` mock factory and the `AuthContext.Provider` value, without which every test in those files fails with `is not a function` / a missing preference.
- **The existing seven `sortFiles` tests survive unchanged**, which is why `categoryOf` falls back to `classifyKey` instead of reading `mediaType` alone. That fallback is load-bearing for backward compatibility, not defensive padding — Task 3 has a test for it, and Task 4 Step 4 says to fix the module rather than the tests if it regresses.
- **Names are consistent across tasks:** `applyItems`, `fullFilesRef`, `sortCriterionRef`, `sortDirectionRef`, `changeSortCriterion`, `toggleSortDirection`, `defaultDirectionFor`, `resolveSortCriterion`, `resolveSortDirection`, `toEpochMs`.
- **One deliberate deviation from the spec's wording.** Spec §2.4 says the criterion-change effect updates the refs and rebuilds the three arrays; it does not say how the effect reads the current listing. Taking `fullFiles` as a dependency would re-run the effect after every fetch and reset the pagination window, and calling `setFullFiles` with an updater that also calls other setters makes the updater impure (React may invoke it twice). Task 7 therefore adds `fullFilesRef`, written by `applyItems`. If a reviewer prefers a different mechanism, the observable contract to preserve is the Task 7 tests, not the ref.
- **Two errors of mine, found by hand-tracing the expected sequences rather than trusting them:** Task 7's `mediaFiles` assertion said `['a.mp4', 'b.jpg']`, but `mediaFiles` is `fullFiles` filtered, so under name-desc it is `['b.jpg', 'a.mp4']` — corrected, with the reasoning in a comment. And the epoch literal in Task 3 was left as a marker until it was computed with `node -e`; it is now the real `1767323045000`. No placeholders remain.
- **`PAGE_SIZE` is 10** (`src/config/cacheConfig.js:8`), which is why Task 7's pagination test builds `PAGE_SIZE + 3` items rather than a bare handful — with only four items every window would be the full list and the reset would be invisible.
- **Task 9's tests depend on the existing mock returning `loading: false`** (`FileListScreen.test.js:106`). It does. If that changes, the screen's early `loading` return means no sort control is ever rendered and those tests fail for an unrelated reason.
