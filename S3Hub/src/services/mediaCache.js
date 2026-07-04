// On-disk media cache backed by expo-file-system.
// Extracted from FileListScreen.js to keep caching behavior in one place.

import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CACHE_EXPIRATION } from '../config/cacheConfig';

// Define the cache directory
export const CACHE_DIR = `${FileSystem.cacheDirectory}S3HubCache/`;

// Helper function to ensure a directory exists
export const ensureDirectoryExists = async (filePath) => {
  const directory = filePath.substring(0, filePath.lastIndexOf('/'));
  const dirInfo = await FileSystem.getInfoAsync(directory);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
};

// Helper function to get a cached file URI, downloading it if not present
export const getCachedFileUri = async (cacheKey, remoteUri) => {
  const path = `${CACHE_DIR}${cacheKey}`;
  const pathInfo = await FileSystem.getInfoAsync(path);
  if (pathInfo.exists) {
    return path;
  } else {
    try {
      await ensureDirectoryExists(path);
      const result = await FileSystem.downloadAsync(remoteUri, path);
      return result.uri;
    } catch (error) {
      console.error('Error caching file:', error);
      return null;
    }
  }
};

// Helper function to clear the entire cache
export const clearEntireCache = async () => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    }
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    await AsyncStorage.clear();
  } catch (error) {
    console.error('Error clearing entire cache:', error);
  }
};

// AsyncStorage flag marking that the pre-namespacing cache layout has been
// wiped once (see migrateLegacyCacheLayout below).
const LEGACY_LAYOUT_CLEARED_KEY = 'mediaCacheLegacyLayoutCleared';

// One-time migration for the switch to namespaced media cache paths (see
// domain/cacheKeys.mediaCacheKey). Before this fix, cache files lived at
// `${CACHE_DIR}${item.key}` — a raw object key, which for nested keys (e.g.
// "photos/1.jpg") created real nested subdirectories under CACHE_DIR via
// ensureDirectoryExists. Every cache lookup now uses a namespaced, flat
// (no "/") path segment instead, so old-layout files/directories are never
// looked up again and would otherwise sit on disk forever as orphaned,
// unevictable garbage — the expiration sweep below only walks CACHE_DIR's
// top-level entries and isn't designed to recurse into old nested
// directories.
//
// Wiping the whole cache once is simpler than teaching the expiration sweep
// to also recognize and recurse into the old layout, and just as correct:
// cached media is disposable (re-downloaded on next access), this runs at
// most once per install, and it also clears out any leftover nested
// directories from the old layout in one step.
const migrateLegacyCacheLayout = async () => {
  const alreadyCleared = await AsyncStorage.getItem(LEGACY_LAYOUT_CLEARED_KEY);
  if (alreadyCleared) {
    return;
  }
  const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
  if (dirInfo.exists) {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  }
  await AsyncStorage.setItem(LEGACY_LAYOUT_CLEARED_KEY, 'true');
};

// Initialize the cache directory and clean old cache files based on expiration time
export const initializeMediaCache = async () => {
  try {
    await migrateLegacyCacheLayout();

    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }

    // Clean old cache files based on expiration time
    const filesInCache = await FileSystem.readDirectoryAsync(CACHE_DIR);
    const now = Date.now();

    for (const file of filesInCache) {
      const filePath = `${CACHE_DIR}${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        const fileModifiedTime = fileInfo.modificationTime * 1000; // Convert to ms
        if (now - fileModifiedTime > CACHE_EXPIRATION) {
          await FileSystem.deleteAsync(filePath);
        }
      }
    }
  } catch (error) {
    console.error('Error initializing cache:', error);
  }
};
