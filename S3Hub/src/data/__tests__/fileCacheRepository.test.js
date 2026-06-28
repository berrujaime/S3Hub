// Tests for the AsyncStorage-based file-list cache data layer.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CACHE_EXPIRATION } from '../../config/cacheConfig';
import {
  getCachedItems,
  setCachedItems,
  removeCachedItems,
  clearAllCache,
} from '../fileCacheRepository';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

const CACHE_KEY = 'connection::bucket::path/';
const ITEMS = [{ key: 'a.txt', isFolder: false }, { key: 'sub/', isFolder: true }];

describe('fileCacheRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Silence defensive logging during expected-error tests.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCachedItems', () => {
    it('returns items when the cache entry is fresh', async () => {
      const now = 1_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      AsyncStorage.getItem.mockResolvedValue(
        JSON.stringify({ timestamp: now - 1000, items: ITEMS })
      );

      const result = await getCachedItems(CACHE_KEY);

      expect(AsyncStorage.getItem).toHaveBeenCalledWith(CACHE_KEY);
      expect(result).toEqual(ITEMS);
    });

    it('returns null when the cache entry is stale', async () => {
      const now = 10 * CACHE_EXPIRATION;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      AsyncStorage.getItem.mockResolvedValue(
        JSON.stringify({ timestamp: now - CACHE_EXPIRATION - 1, items: ITEMS })
      );

      const result = await getCachedItems(CACHE_KEY);

      expect(result).toBeNull();
    });

    it('returns null when the key is absent', async () => {
      AsyncStorage.getItem.mockResolvedValue(null);

      const result = await getCachedItems(CACHE_KEY);

      expect(result).toBeNull();
    });

    it('returns null when the stored JSON is malformed', async () => {
      AsyncStorage.getItem.mockResolvedValue('not-json');

      const result = await getCachedItems(CACHE_KEY);

      expect(result).toBeNull();
    });

    it('returns null when reading throws', async () => {
      AsyncStorage.getItem.mockRejectedValue(new Error('read failure'));

      const result = await getCachedItems(CACHE_KEY);

      expect(result).toBeNull();
    });
  });

  describe('setCachedItems', () => {
    it('writes the correct JSON shape to the correct key', async () => {
      const now = 1_234_567;
      jest.spyOn(Date, 'now').mockReturnValue(now);

      await setCachedItems(CACHE_KEY, ITEMS);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        CACHE_KEY,
        JSON.stringify({ timestamp: now, items: ITEMS })
      );
    });

    it('logs and does not throw when writing fails', async () => {
      AsyncStorage.setItem.mockRejectedValue(new Error('write failure'));

      await expect(setCachedItems(CACHE_KEY, ITEMS)).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('removeCachedItems', () => {
    it('removes the entry for the given key', async () => {
      await removeCachedItems(CACHE_KEY);

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('logs and does not throw when removal fails', async () => {
      AsyncStorage.removeItem.mockRejectedValue(new Error('remove failure'));

      await expect(removeCachedItems(CACHE_KEY)).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('clearAllCache', () => {
    it('clears all AsyncStorage entries', async () => {
      await clearAllCache();

      expect(AsyncStorage.clear).toHaveBeenCalledTimes(1);
    });

    it('logs and does not throw when clearing fails', async () => {
      AsyncStorage.clear.mockRejectedValue(new Error('clear failure'));

      await expect(clearAllCache()).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalled();
    });
  });
});
