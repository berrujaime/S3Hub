// Tests for the on-disk media cache service, in particular clearEntireCache:
// it must delete only file-list cache entries (the `files_`-prefixed
// AsyncStorage keys) plus the media directory on disk, and must never wipe
// unrelated AsyncStorage data (connection metadata, current-connection
// pointer, the one-time legacy-layout migration flag, etc.) — see the
// AsyncStorage.clear() incident this replaces.

import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearEntireCache, CACHE_DIR } from '../mediaCache';

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
      ['files_conn1_bucket1_', 'files_conn1_bucket1_photos/'].sort()
    );
    expect(AsyncStorage.clear).not.toHaveBeenCalled();
  });

  it('still clears the on-disk media cache directory', async () => {
    AsyncStorage.getAllKeys.mockResolvedValue([]);

    await clearEntireCache();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      CACHE_DIR,
      { idempotent: true }
    );
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      CACHE_DIR,
      { intermediates: true }
    );
  });

  it('logs and does not throw when clearing fails', async () => {
    AsyncStorage.getAllKeys.mockRejectedValue(new Error('getAllKeys failure'));

    await expect(clearEntireCache()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
