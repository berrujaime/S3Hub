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
