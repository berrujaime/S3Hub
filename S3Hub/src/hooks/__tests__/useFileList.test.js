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
import { listAllObjects, getSignedUrl } from '../../services/s3Service';
import {
  getCachedItems,
  setCachedItems,
  removeCachedItems,
} from '../../data/fileCacheRepository';
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
        expect(result.current.displayedFiles.map((f) => f.name)).toEqual(['bravo.txt'])
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
        { initialProps: { connection: CONNECTION_A, bucket: 'bucket-a' } }
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
        { initialProps: { connection: CONNECTION_A, bucket: 'bucket-a' } }
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      clearEntireCache.mockClear();

      rerender({ connection: CONNECTION_B, bucket: 'bucket-a' });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(clearEntireCache).toHaveBeenCalledTimes(1);
    });
  });
});
