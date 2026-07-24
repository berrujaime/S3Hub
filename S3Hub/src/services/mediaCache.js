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
      // Log the error identity only — never the full error — since
      // `remoteUri` is a presigned URL (a bearer credential) and some
      // download-layer errors embed the failing URL in their message.
      console.error('Error caching file:', error?.name || error?.code, error?.message);
      return null;
    }
  }
};

// Prefix shared with domain/cacheKeys.getCacheKey: every file-list cache
// entry is stored under a `files_...` key. Scoping the clear to this prefix
// (via getAllKeys + multiRemove) instead of AsyncStorage.clear() is
// intentional: AsyncStorage also holds unrelated app data — connection
// metadata, the current-connection pointer, and the one-time
// migrateLegacyCacheLayout flag below — that must survive a cache clear.
const FILE_LIST_CACHE_KEY_PREFIX = 'files_';

// Helper function to clear the entire cache: on-disk media files plus the
// file-list AsyncStorage entries, WITHOUT touching any other AsyncStorage
// data (see FILE_LIST_CACHE_KEY_PREFIX above).
export const clearEntireCache = async () => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    }
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });

    const allKeys = await AsyncStorage.getAllKeys();
    const fileListCacheKeys = allKeys.filter((key) => key.startsWith(FILE_LIST_CACHE_KEY_PREFIX));
    if (fileListCacheKeys.length > 0) {
      await AsyncStorage.multiRemove(fileListCacheKeys);
    }
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
// looked up again and would otherwise sit on disk, unreachable, until the
// recursive expiration sweep below (see evictExpiredEntries) eventually
// ages them out.
//
// Wiping the whole cache once, right away, is simpler than waiting up to a
// full CACHE_EXPIRATION period for the sweep to reclaim that dead weight,
// and just as correct: cached media is disposable (re-downloaded on next
// access), and this runs at most once per install.
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

// Recursively walks `directory`, deleting files older than CACHE_EXPIRATION
// and pruning any subdirectory the sweep leaves empty. Current cache keys
// (domain/cacheKeys.mediaCacheKey) are flat, but the cache dir can still
// contain subdirectories in practice — leftover legacy-layout entries (see
// migrateLegacyCacheLayout above) if that one-time wipe is ever skipped or
// races a write, or any future namespacing — and a sweep that only looked
// at `directory`'s immediate entries would leave anything nested inside
// permanently uncollectible.
//
// Each entry gets its own try/catch: a single unreadable or already-vanished
// path (getInfoAsync/readDirectoryAsync throwing, e.g. a permission error or
// a concurrent deletion) must only skip that one entry, not abort the sweep
// for every other file in the cache.
//
// A missing or non-numeric modificationTime means the filesystem can't tell
// us how old a file is. Since we can't prove it's still fresh, the safe
// choice for a disposable cache is to treat it as expired and delete it,
// rather than let it live forever (the previous behavior, since
// `undefined * 1000` is NaN and every NaN comparison is false).
//
// Returns true when `directory` itself ends up empty (and was therefore
// removed), so a parent call can prune it too without a second directory
// listing.
const evictExpiredEntries = async (directory, now) => {
  let entries;
  try {
    entries = await FileSystem.readDirectoryAsync(directory);
  } catch (error) {
    console.error(`Error reading cache directory ${directory}:`, error);
    return false;
  }

  let remaining = entries.length;

  for (const entry of entries) {
    const entryPath = `${directory}${entry}`;
    try {
      const entryInfo = await FileSystem.getInfoAsync(entryPath);
      if (!entryInfo.exists) {
        remaining -= 1;
        continue;
      }

      if (entryInfo.isDirectory) {
        const wasRemoved = await evictExpiredEntries(`${entryPath}/`, now);
        if (wasRemoved) {
          remaining -= 1;
        }
        continue;
      }

      const modifiedMs = entryInfo.modificationTime * 1000; // Convert to ms
      const isExpired = !Number.isFinite(modifiedMs) || now - modifiedMs > CACHE_EXPIRATION;
      if (isExpired) {
        await FileSystem.deleteAsync(entryPath, { idempotent: true });
        remaining -= 1;
      }
    } catch (error) {
      console.error(`Error evicting cache entry ${entryPath}:`, error);
      // Leave `remaining` unchanged: an entry we failed to process is not
      // known to be gone, so `directory` must not be pruned as empty.
    }
  }

  // Never remove CACHE_DIR itself, only subdirectories the sweep left empty.
  if (entries.length > 0 && remaining === 0 && directory !== CACHE_DIR) {
    await FileSystem.deleteAsync(directory, { idempotent: true });
    return true;
  }
  return false;
};

// Initialize the cache directory and clean old cache files based on expiration time
export const initializeMediaCache = async () => {
  try {
    await migrateLegacyCacheLayout();

    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }

    // Recursively clean old cache files based on expiration time.
    await evictExpiredEntries(CACHE_DIR, Date.now());
  } catch (error) {
    console.error('Error initializing cache:', error);
  }
};
