// Tests for the on-disk media cache service, in particular clearEntireCache:
// it must delete only file-list cache entries (the `files_`-prefixed
// AsyncStorage keys) plus the media directory on disk, and must never wipe
// unrelated AsyncStorage data (connection metadata, current-connection
// pointer, the one-time legacy-layout migration flag, etc.) — see the
// AsyncStorage.clear() incident this replaces.

import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearEntireCache, initializeMediaCache, getCachedFileUri, CACHE_DIR } from '../mediaCache';
import { CACHE_EXPIRATION } from '../../config/cacheConfig';

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiRemove: jest.fn(),
  clear: jest.fn(),
}));

describe('clearEntireCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('removes only files_-prefixed AsyncStorage keys, leaving everything else intact', async () => {
    const allKeys = [
      'connections_meta',
      'currentConnectionId',
      'mediaCacheLegacyLayoutCleared',
      'files_conn1_bucket1_',
      'files_conn1_bucket1_photos/',
    ];
    AsyncStorage.getAllKeys.mockResolvedValue(allKeys);

    await clearEntireCache();

    expect(AsyncStorage.multiRemove).toHaveBeenCalledTimes(1);
    const removedKeys = AsyncStorage.multiRemove.mock.calls[0][0];
    expect(removedKeys.sort()).toEqual(
      ['files_conn1_bucket1_', 'files_conn1_bucket1_photos/'].sort(),
    );
    expect(AsyncStorage.clear).not.toHaveBeenCalled();
  });

  it('still clears the on-disk media cache directory', async () => {
    AsyncStorage.getAllKeys.mockResolvedValue([]);

    await clearEntireCache();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(CACHE_DIR, { idempotent: true });
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(CACHE_DIR, { intermediates: true });
  });

  // Routed item (Task 6.1, code review): some AsyncStorage backends warn or
  // reject on a zero-length multiRemove batch, so the `files_` filter
  // finding nothing must skip the call entirely rather than calling
  // multiRemove([]).
  it('does not call AsyncStorage.multiRemove when there are no files_-prefixed keys to remove', async () => {
    AsyncStorage.getAllKeys.mockResolvedValue(['connections_meta', 'currentConnectionId']);

    await clearEntireCache();

    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
  });

  it('does not call AsyncStorage.multiRemove when getAllKeys itself returns an empty list', async () => {
    AsyncStorage.getAllKeys.mockResolvedValue([]);

    await clearEntireCache();

    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
  });

  it('logs and does not throw when clearing fails', async () => {
    AsyncStorage.getAllKeys.mockRejectedValue(new Error('getAllKeys failure'));

    await expect(clearEntireCache()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

// Tests for the expiration sweep run by initializeMediaCache. The cache dir
// can contain namespaced subdirectories (see domain/cacheKeys), so the sweep
// must recurse into them instead of only scanning CACHE_DIR's top level —
// otherwise nested media never expires. It must also treat an
// unusable/missing modificationTime as "expired" (never as "immortal"), and
// must not let one bad entry (a throwing getInfoAsync/readDirectoryAsync
// call) abort the sweep for the rest of the cache.
describe('initializeMediaCache', () => {
  const NOW = 1_700_000_000_000;
  const EXPIRED_SECONDS = (NOW - CACHE_EXPIRATION - 1000) / 1000; // just past expiry
  const FRESH_SECONDS = (NOW - 1000) / 1000; // just cached

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    // Skip the one-time legacy-layout migration path; it is covered by its
    // own tests and is orthogonal to the eviction sweep under test here.
    AsyncStorage.getItem.mockResolvedValue('true');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('recurses into a namespace subdirectory, deleting the expired file and keeping the fresh one', async () => {
    FileSystem.readDirectoryAsync.mockImplementation(async (dir) => {
      if (dir === CACHE_DIR) return ['ns1'];
      if (dir === `${CACHE_DIR}ns1/`) return ['expired.jpg', 'fresh.jpg'];
      return [];
    });
    FileSystem.getInfoAsync.mockImplementation(async (path) => {
      if (path === CACHE_DIR) return { exists: true, isDirectory: true };
      if (path === `${CACHE_DIR}ns1`) return { exists: true, isDirectory: true };
      if (path === `${CACHE_DIR}ns1/expired.jpg`) {
        return { exists: true, isDirectory: false, modificationTime: EXPIRED_SECONDS };
      }
      if (path === `${CACHE_DIR}ns1/fresh.jpg`) {
        return { exists: true, isDirectory: false, modificationTime: FRESH_SECONDS };
      }
      return { exists: false };
    });

    await initializeMediaCache();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${CACHE_DIR}ns1/expired.jpg`, {
      idempotent: true,
    });
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
      `${CACHE_DIR}ns1/fresh.jpg`,
      expect.anything(),
    );
    // The namespace dir still holds the fresh file, so it must survive.
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(`${CACHE_DIR}ns1/`, expect.anything());
  });

  it('deletes a cached file when modificationTime is missing, rather than treating it as immortal', async () => {
    FileSystem.readDirectoryAsync.mockImplementation(async (dir) => {
      if (dir === CACHE_DIR) return ['no-modtime.jpg'];
      return [];
    });
    FileSystem.getInfoAsync.mockImplementation(async (path) => {
      if (path === CACHE_DIR) return { exists: true, isDirectory: true };
      if (path === `${CACHE_DIR}no-modtime.jpg`) {
        return { exists: true, isDirectory: false }; // no modificationTime field
      }
      return { exists: false };
    });

    await initializeMediaCache();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${CACHE_DIR}no-modtime.jpg`, {
      idempotent: true,
    });
  });

  it('skips an entry whose getInfoAsync throws and still evicts the rest of the sweep', async () => {
    FileSystem.readDirectoryAsync.mockImplementation(async (dir) => {
      if (dir === CACHE_DIR) return ['broken.jpg', 'expired.jpg'];
      return [];
    });
    FileSystem.getInfoAsync.mockImplementation(async (path) => {
      if (path === CACHE_DIR) return { exists: true, isDirectory: true };
      if (path === `${CACHE_DIR}broken.jpg`) throw new Error('stat failed');
      if (path === `${CACHE_DIR}expired.jpg`) {
        return { exists: true, isDirectory: false, modificationTime: EXPIRED_SECONDS };
      }
      return { exists: false };
    });

    await expect(initializeMediaCache()).resolves.toBeUndefined();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${CACHE_DIR}expired.jpg`, {
      idempotent: true,
    });
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
      `${CACHE_DIR}broken.jpg`,
      expect.anything(),
    );
    expect(console.error).toHaveBeenCalled();
  });

  it('does not abort the sweep when readDirectoryAsync throws for a nested subdirectory', async () => {
    FileSystem.readDirectoryAsync.mockImplementation(async (dir) => {
      if (dir === CACHE_DIR) return ['brokenDir', 'ns2'];
      if (dir === `${CACHE_DIR}brokenDir/`) throw new Error('EACCES');
      if (dir === `${CACHE_DIR}ns2/`) return ['expired.jpg'];
      return [];
    });
    FileSystem.getInfoAsync.mockImplementation(async (path) => {
      if (path === CACHE_DIR) return { exists: true, isDirectory: true };
      if (path === `${CACHE_DIR}brokenDir`) return { exists: true, isDirectory: true };
      if (path === `${CACHE_DIR}ns2`) return { exists: true, isDirectory: true };
      if (path === `${CACHE_DIR}ns2/expired.jpg`) {
        return { exists: true, isDirectory: false, modificationTime: EXPIRED_SECONDS };
      }
      return { exists: false };
    });

    await expect(initializeMediaCache()).resolves.toBeUndefined();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${CACHE_DIR}ns2/expired.jpg`, {
      idempotent: true,
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('removes a namespace directory once every file inside it has expired', async () => {
    FileSystem.readDirectoryAsync.mockImplementation(async (dir) => {
      if (dir === CACHE_DIR) return ['ns3'];
      if (dir === `${CACHE_DIR}ns3/`) return ['expired.jpg'];
      return [];
    });
    FileSystem.getInfoAsync.mockImplementation(async (path) => {
      if (path === CACHE_DIR) return { exists: true, isDirectory: true };
      if (path === `${CACHE_DIR}ns3`) return { exists: true, isDirectory: true };
      if (path === `${CACHE_DIR}ns3/expired.jpg`) {
        return { exists: true, isDirectory: false, modificationTime: EXPIRED_SECONDS };
      }
      return { exists: false };
    });

    await initializeMediaCache();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${CACHE_DIR}ns3/expired.jpg`, {
      idempotent: true,
    });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${CACHE_DIR}ns3/`, {
      idempotent: true,
    });
  });
});

// Regression: FileSystem.downloadAsync does NOT reject on an HTTP error — it
// writes the response BODY to disk and reports the status. A presign failure
// (403 SignatureDoesNotMatch / expired signature / AccessDenied) therefore
// used to be cached as a file with the object's own name and extension whose
// content is really S3's XML error document. Handing that to a viewer made it
// open and close instantly, and the poisoned entry was served from cache
// forever after, so retrying never re-downloaded.
describe('getCachedFileUri download-status handling', () => {
  const CACHE_KEY = 'mabc123.pdf';
  const PATH = `${CACHE_DIR}${CACHE_KEY}`;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Cache miss for the file, but the directory already exists.
    FileSystem.getInfoAsync.mockImplementation(async (target) =>
      target === PATH ? { exists: false } : { exists: true },
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the local uri on a 200', async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 200, uri: PATH });

    await expect(getCachedFileUri(CACHE_KEY, 'https://signed.example/o')).resolves.toBe(PATH);
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it('rejects a 403 and deletes the error document instead of caching it', async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 403, uri: PATH });

    await expect(getCachedFileUri(CACHE_KEY, 'https://signed.example/o')).resolves.toBeNull();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(PATH, { idempotent: true });
  });

  it('rejects a 404 the same way', async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 404, uri: PATH });

    await expect(getCachedFileUri(CACHE_KEY, 'https://signed.example/o')).resolves.toBeNull();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(PATH, { idempotent: true });
  });

  it('never logs the presigned URL, which is a bearer credential', async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 403, uri: PATH });

    await getCachedFileUri(CACHE_KEY, 'https://signed.example/o?X-Amz-Signature=deadbeef');

    const logged = console.error.mock.calls.flat().join(' ');
    expect(logged).not.toContain('X-Amz-Signature');
    expect(logged).not.toContain('signed.example');
  });

  it('serves an existing cache entry without re-downloading', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    await expect(getCachedFileUri(CACHE_KEY, 'https://signed.example/o')).resolves.toBe(PATH);
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });
});
