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
const folder = (name) => ({
  id: `${name}/`,
  key: `${name}/`,
  name,
  isFolder: true,
  lastModified: null,
});
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
    expect(toEpochMs('2026-01-02T03:04:05.000Z')).toBe(
      new Date('2026-01-02T03:04:05.000Z').getTime(),
    );
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
    const input = [
      { name: 'clip.mp4', key: 'clip.mp4', isFolder: false },
      { name: 'photo.jpg', key: 'photo.jpg', isFolder: false },
    ];

    expect(names(sortFiles(input, 'type', 'asc'))).toEqual(['photo.jpg', 'clip.mp4']);
  });

  it('ranks an unrecognized mediaType after every known category, including other', () => {
    // rankOf falls back to CATEGORY_RANK.length for a category it doesn't
    // recognize (a corrupted cache entry, or a future category added to
    // fileTypes without a matching CATEGORY_RANK entry). Ranking it after
    // 'other' -- not merely somewhere -- is the property that distinguishes
    // that intentional fallback from the -1-from-indexOf bug it guards
    // against, which would sort the unknown item FIRST, ahead of images.
    const input = [
      file('unknown.bin', 'ebook'),
      file('known.bin', 'other'),
      file('a.jpg', 'image'),
    ];

    expect(names(sortFiles(input, 'type', 'asc'))).toEqual(['a.jpg', 'known.bin', 'unknown.bin']);
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
    const input = [
      file('mid.jpg', 'image', 200),
      file('new.jpg', 'image', 300),
      file('old.jpg', 'image', 100),
    ];

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
    const input = [
      file('none.jpg', 'image', null),
      file('new.jpg', 'image', 300),
      file('old.jpg', 'image', 100),
    ];

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
