// Data layer for the AsyncStorage-based file-list cache.
// Encapsulates the cache logic previously inlined in FileListScreen.
// Each entry is stored per cacheKey as a JSON string of shape:
//   { timestamp: <ms>, items: <array> }

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CACHE_EXPIRATION } from '../config/cacheConfig';

// Read the cached items for a key, returning them only if still fresh.
// Returns the items array on a fresh cache hit, or null otherwise
// (absent key, stale entry, or any read/parse error) so the caller
// can fall back to a server fetch.
export const getCachedItems = async (cacheKey) => {
  try {
    const cachedData = await AsyncStorage.getItem(cacheKey);
    if (!cachedData) {
      return null;
    }

    const { timestamp, items } = JSON.parse(cachedData);
    if (Date.now() - timestamp < CACHE_EXPIRATION) {
      return items;
    }

    // Entry is stale.
    return null;
  } catch (error) {
    console.error('Error reading cached items:', error);
    return null;
  }
};

// Persist the items for a key, stamping the current time as the timestamp.
export const setCachedItems = async (cacheKey, items) => {
  try {
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ timestamp: Date.now(), items })
    );
  } catch (error) {
    console.error('Error writing cached items:', error);
  }
};

// Remove the cache entry for a single key.
export const removeCachedItems = async (cacheKey) => {
  try {
    await AsyncStorage.removeItem(cacheKey);
  } catch (error) {
    console.error('Error removing cached items:', error);
  }
};

// Clear the entire AsyncStorage-backed cache.
export const clearAllCache = async () => {
  try {
    await AsyncStorage.clear();
  } catch (error) {
    console.error('Error clearing all cache:', error);
  }
};
