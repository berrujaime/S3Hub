// Tests for useFileList: fetch-effect consolidation and per-run cancellation.
//
// Covers three behaviors:
//  (a) exactly one listAllObjects call per (connection, bucket, path) change
//      -- previously two effects both fetched on mount, causing a double
//      network burst.
//  (b) a slow, now-stale fetch (kicked off for a previous path) must never
//      overwrite state after navigation moved on to a new path -- previously
//      a shared `isMounted` ref did not distinguish "unmounted" from
//      "superseded by a newer fetch", so the stale response could still land.
//  (c) the media/file cache is cleared only when the connection or bucket
//      actually changes, never on a path-only navigation.
//
// `useFileList` takes connection/bucket as plain arguments (see
// hooks/useFileList.js), so no context provider is needed here.

import { renderHook, act, waitFor } from '@testing-library/react-native';
import useFileList from '../useFileList';
import { PAGE_SIZE } from '../../config/cacheConfig';
import { listAllObjects, getSignedUrl } from '../../services/s3Service';
import { getCachedItems, setCachedItems, removeCachedItems } from '../../data/fileCacheRepository';
import { initializeMediaCache, clearEntireCache } from '../../services/mediaCache';

// Explicit factories (rather than bare `jest.mock(path)` automocking): these
// modules import native/AWS SDK dependencies (AsyncStorage, expo-file-system,
// @aws-sdk/*) that automocking would still need to load to introspect their
// shape, which blows up outside a device/native runtime.
jest.mock('../../services/s3Service', () => ({
  listAllObjects: jest.fn(),
  getSignedUrl: jest.fn(),
}));
jest.mock('../../services/mediaCache', () => ({
  initializeMediaCache: jest.fn(),
  clearEntireCache: jest.fn(),
}));
jest.mock('../../data/fileCacheRepository', () => ({
  getCachedItems: jest.fn(),
  setCachedItems: jest.fn(),
  removeCachedItems: jest.fn(),
}));

const CONNECTION_A = { id: 'connA', service: 'aws' };
const CONNECTION_B = { id: 'connB', service: 'aws' };

const emptyListing = { contents: [], commonPrefixes: [] };

describe('useFileList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCachedItems.mockResolvedValue(null); // Always a cache miss by default.
    setCachedItems.mockResolvedValue(undefined);
    removeCachedItems.mockResolvedValue(undefined);
    clearEntireCache.mockResolvedValue(undefined);
    initializeMediaCache.mockResolvedValue(undefined);
    getSignedUrl.mockResolvedValue('https://signed.example/url');
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('(a) single fetch per (connection, bucket, path) change', () => {
    it('fetches exactly once on mount', async () => {
      listAllObjects.mockResolvedValue(emptyListing);

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(listAllObjects).toHaveBeenCalledTimes(1);
    });

    it('fetches exactly once when only the path changes', async () => {
      listAllObjects.mockResolvedValue(emptyListing);

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      listAllObjects.mockClear();

      act(() => {
        result.current.enterFolder('sub');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(listAllObjects).toHaveBeenCalledTimes(1);
    });
  });

  describe('(b) stale-response race', () => {
    it('does not let a slow fetch for the previous path overwrite the current path', async () => {
      // Route each mock resolution by the listing's requested prefix, so the
      // test does not depend on exactly how many calls the (possibly still
      // buggy) implementation issues for a given path.
      const pendingByPrefix = {};
      listAllObjects.mockImplementation((connection, bucket, { prefix }) => {
        return new Promise((resolve) => {
          (pendingByPrefix[prefix] ??= []).push(resolve);
        });
      });
      const resolvePrefix = (prefix, value) => {
        const resolvers = pendingByPrefix[prefix] || [];
        pendingByPrefix[prefix] = [];
        resolvers.forEach((resolve) => resolve(value));
      };

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));
      await waitFor(() => expect((pendingByPrefix[''] || []).length).toBeGreaterThan(0));

      // Navigate away before the initial ('') fetch has resolved.
      act(() => {
        result.current.enterFolder('sub');
      });
      await waitFor(() => expect((pendingByPrefix['sub/'] || []).length).toBeGreaterThan(0));
      expect(result.current.currentPath).toBe('sub/');

      // The NEW path's fetch resolves first.
      await act(async () => {
        resolvePrefix('sub/', {
          contents: [{ Key: 'sub/bravo.txt', Size: 2 }],
          commonPrefixes: [],
        });
      });
      await waitFor(() =>
        expect(result.current.displayedFiles.map((f) => f.name)).toEqual(['bravo.txt']),
      );

      // The STALE, previous-path fetch resolves after that.
      await act(async () => {
        resolvePrefix('', {
          contents: [{ Key: 'alpha.txt', Size: 1 }],
          commonPrefixes: [],
        });
        // Give the stale fetch's continuation chain a chance to run, if it
        // were (incorrectly) going to call setState.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Still showing path B's contents, not path A's stale response.
      expect(result.current.currentPath).toBe('sub/');
      expect(result.current.displayedFiles.map((f) => f.name)).toEqual(['bravo.txt']);
      expect(result.current.fullFiles.map((f) => f.name)).toEqual(['bravo.txt']);
    });
  });

  describe('(c) cache-clear scoping', () => {
    it('does not clear the cache when only the path changes', async () => {
      listAllObjects.mockResolvedValue(emptyListing);

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      clearEntireCache.mockClear();

      act(() => {
        result.current.enterFolder('sub');
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(clearEntireCache).not.toHaveBeenCalled();
    });

    it('clears the cache when the bucket changes', async () => {
      listAllObjects.mockResolvedValue(emptyListing);

      const { result, rerender } = renderHook(
        ({ connection, bucket }) => useFileList(connection, bucket),
        { initialProps: { connection: CONNECTION_A, bucket: 'bucket-a' } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      clearEntireCache.mockClear();

      rerender({ connection: CONNECTION_A, bucket: 'bucket-b' });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(clearEntireCache).toHaveBeenCalledTimes(1);
    });

    it('clears the cache when the connection changes', async () => {
      listAllObjects.mockResolvedValue(emptyListing);

      const { result, rerender } = renderHook(
        ({ connection, bucket }) => useFileList(connection, bucket),
        { initialProps: { connection: CONNECTION_A, bucket: 'bucket-a' } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      clearEntireCache.mockClear();

      rerender({ connection: CONNECTION_B, bucket: 'bucket-a' });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(clearEntireCache).toHaveBeenCalledTimes(1);
    });
  });

  // Routed item (Task 6.1, code review): logging out (connection/bucket go
  // to null/undefined) and then logging back into the EXACT SAME connection
  // and bucket must still clear the cache and re-list from the server. The
  // mount-effect's `prevOriginRef` only clears when the (connectionId,
  // bucket) pair actually changes since the previous run -- without the
  // explicit reset in the "no active connection" branch (see useFileList.js),
  // logging out and back into the same connection would look like a no-op
  // origin change on re-login (old ref value === new value) and silently
  // suppress both the cache clear and the safety semantics it protects.
  describe('(d) logout then re-login into the SAME connection/bucket', () => {
    it('clears the cache and re-lists from the server again on re-login, even though the origin is unchanged from before logout', async () => {
      listAllObjects.mockResolvedValue(emptyListing);

      const { result, rerender } = renderHook(
        ({ connection, bucket }) => useFileList(connection, bucket),
        { initialProps: { connection: CONNECTION_A, bucket: 'bucket-a' } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      // Initial mount: prevOriginRef starts at the "no connection" sentinel,
      // so this first real connection/bucket already counts as a change.
      expect(clearEntireCache).toHaveBeenCalledTimes(1);

      // Logout: AuthContext nulls out both connection and bucket.
      rerender({ connection: null, bucket: null });
      await waitFor(() => expect(result.current.fullFiles).toEqual([]));
      clearEntireCache.mockClear();
      listAllObjects.mockClear();

      // Re-login into the SAME connection and bucket as before logout.
      rerender({ connection: CONNECTION_A, bucket: 'bucket-a' });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(clearEntireCache).toHaveBeenCalledTimes(1);
      expect(listAllObjects).toHaveBeenCalledTimes(1);
    });
  });

  // Brief Step 2 "client-side pagination bound" (Task 6.1 review): the file
  // list renders only page * PAGE_SIZE items and loadMoreFiles advances that
  // window over the already-fetched fullFiles WITHOUT any new S3 request.
  // The `nextItems.length > displayedFiles.length` guard is the bound: once
  // everything is displayed, further calls must leave state untouched
  // instead of incrementing `page` forever.
  describe('loadMoreFiles client-side pagination bound', () => {
    // 2.5 pages' worth of documents (non-previewable, so no signing round
    // trips) with zero-padded names, so alphabetical sort order == numeric
    // order and each page boundary is predictable.
    const makeContents = (count) =>
      Array.from({ length: count }, (_, i) => ({
        Key: `doc-${String(i).padStart(2, '0')}.txt`,
        Size: i + 1,
      }));

    it('advances displayedFiles by PAGE_SIZE per call, clamping the final partial page, with no extra fetch', async () => {
      listAllObjects.mockResolvedValue({
        contents: makeContents(PAGE_SIZE * 2 + 5),
        commonPrefixes: [],
      });

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.fullFiles).toHaveLength(PAGE_SIZE * 2 + 5);
      expect(result.current.displayedFiles).toHaveLength(PAGE_SIZE);

      act(() => result.current.loadMoreFiles());
      expect(result.current.displayedFiles).toHaveLength(PAGE_SIZE * 2);
      // The window extends over fullFiles in sorted order: the first item of
      // page 2 is the (PAGE_SIZE+1)-th document, not a refetched/reshuffled one.
      expect(result.current.displayedFiles[PAGE_SIZE].name).toBe(
        `doc-${String(PAGE_SIZE).padStart(2, '0')}.txt`,
      );

      act(() => result.current.loadMoreFiles());
      expect(result.current.displayedFiles).toHaveLength(PAGE_SIZE * 2 + 5);

      // Pagination is purely client-side: only the single mount fetch ever
      // hit the server.
      expect(listAllObjects).toHaveBeenCalledTimes(1);
    });

    it('is a no-op once every item is already displayed (stop-at-bound guard)', async () => {
      listAllObjects.mockResolvedValue({
        contents: makeContents(5), // fewer than one page
        commonPrefixes: [],
      });

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.displayedFiles).toHaveLength(5);

      const displayedBefore = result.current.displayedFiles;
      act(() => result.current.loadMoreFiles());

      // Same array reference, not just same length: the guard must skip
      // setDisplayedFiles entirely rather than re-setting an equal slice.
      expect(result.current.displayedFiles).toBe(displayedBefore);
      expect(result.current.displayedFiles).toHaveLength(5);
    });
  });

  // Task 5.8: pull-to-refresh must recover from a network loss even while
  // the AsyncStorage list cache is still "fresh" -- a plain fetchFiles()
  // call would hit the cache-hit branch and silently re-render the same
  // (possibly stale) items instead of re-listing from the server.
  describe('forceRefresh option', () => {
    it('skips the cache-hit branch and re-lists from the server when forceRefresh is true', async () => {
      listAllObjects.mockResolvedValue(emptyListing);
      getCachedItems.mockResolvedValue([
        { id: 'cached.txt', key: 'cached.txt', name: 'cached.txt', size: 1 },
      ]);

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Cache hit on mount: the cached item is shown, and the server is
      // never listed.
      expect(result.current.displayedFiles.map((f) => f.name)).toEqual(['cached.txt']);
      expect(listAllObjects).not.toHaveBeenCalled();

      listAllObjects.mockResolvedValue({
        contents: [{ Key: 'fresh.txt', Size: 2 }],
        commonPrefixes: [],
      });

      await act(async () => {
        await result.current.fetchFiles(undefined, { forceRefresh: true });
      });

      // The cache is bypassed (getCachedItems is not consulted again) and the
      // server listing wins, replacing the stale cached item.
      expect(listAllObjects).toHaveBeenCalledTimes(1);
      expect(result.current.displayedFiles.map((f) => f.name)).toEqual(['fresh.txt']);
    });

    it('still consults the cache on a plain fetchFiles() call (default forceRefresh: false)', async () => {
      listAllObjects.mockResolvedValue(emptyListing);
      getCachedItems.mockResolvedValue([
        { id: 'cached.txt', key: 'cached.txt', name: 'cached.txt', size: 1 },
      ]);

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      getCachedItems.mockClear();

      await act(async () => {
        await result.current.fetchFiles();
      });

      expect(getCachedItems).toHaveBeenCalledTimes(1);
      expect(listAllObjects).not.toHaveBeenCalled();
    });
  });

  describe('setMediaFileUrl immutability', () => {
    it('returns a new array with a new object at the updated index, preserving origin fields', async () => {
      // Fetch with a listing containing TWO previewable media items: the
      // second exists purely to assert that untouched siblings keep
      // reference identity — the property that distinguishes the targeted
      // `{ ...it, url }` update from a near-miss that spreads every element.
      // sortFiles orders alphabetically, so image.jpg is index 0 and
      // photo2.png is index 1.
      listAllObjects.mockResolvedValue({
        contents: [
          { Key: 'image.jpg', Size: 100 },
          { Key: 'photo2.png', Size: 200 },
        ],
        commonPrefixes: [],
      });

      const { result } = renderHook(() => useFileList(CONNECTION_A, 'bucket-a'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Verify mediaFiles has both items, in sorted order, with origin fields.
      expect(result.current.mediaFiles.map((f) => f.name)).toEqual(['image.jpg', 'photo2.png']);
      const firstItem = result.current.mediaFiles[0];
      expect(firstItem.connectionId).toBe('connA');
      expect(firstItem.bucket).toBe('bucket-a');

      // Capture the original array and element references.
      const originalMediaFiles = result.current.mediaFiles;
      const originalFirstElement = result.current.mediaFiles[0];
      const originalSecondElement = result.current.mediaFiles[1];

      const newUrl = 'https://new-signed.example/url';

      // Call setMediaFileUrl to update the URL at index 0.
      act(() => {
        result.current.setMediaFileUrl(0, newUrl);
      });

      // Verify the mediaFiles array reference has changed.
      expect(result.current.mediaFiles).not.toBe(originalMediaFiles);

      // Verify the element at index 0 has a new reference.
      expect(result.current.mediaFiles[0]).not.toBe(originalFirstElement);

      // Verify the untouched sibling at index 1 keeps reference identity.
      expect(result.current.mediaFiles[1]).toBe(originalSecondElement);

      // Verify the URL was updated.
      expect(result.current.mediaFiles[0].url).toBe(newUrl);

      // Verify origin fields survived the spread operation.
      expect(result.current.mediaFiles[0].connectionId).toBe('connA');
      expect(result.current.mediaFiles[0].bucket).toBe('bucket-a');

      // Verify other fields of the updated element survived.
      expect(result.current.mediaFiles[0].name).toBe('image.jpg');
    });
  });

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
});
