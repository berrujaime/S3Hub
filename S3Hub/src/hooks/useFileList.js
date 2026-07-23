import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Alert, AppState } from 'react-native';
import { listAllObjects, getSignedUrl } from '../services/s3Service';
import { PAGE_SIZE } from '../config/cacheConfig';
import {
  sortFiles,
  parseObjects,
  dedupeById,
  isPreviewableMediaType,
  stampItemOrigin,
  stripVolatileFields,
} from '../domain/fileListMapper';
import { getCacheKey } from '../domain/cacheKeys';
import {
  getCachedItems,
  setCachedItems,
  removeCachedItems,
} from '../data/fileCacheRepository';
import {
  initializeMediaCache,
  clearEntireCache,
} from '../services/mediaCache';
import i18n from '../locales/translations';
import { mapS3Error } from '../domain/errors';

// Generates presigned preview URLs for previewable (image/video) items,
// mutating each item's `url` in place. Presigning is a local, network-free
// HMAC operation (see services/s3Service.getSignedUrl) — it never makes a
// round trip to S3 — so this is cheap to run on every load, including a
// file-list cache hit, rather than persisting the URL itself (see
// domain/fileListMapper.stripVolatileFields for why persisting it is
// unsafe). Shared by both the cache-hit and fresh-fetch paths below.
const attachSignedUrls = async (items, connection, bucket) => {
  const signPromises = [];
  items.forEach((item) => {
    if (!item.isFolder && isPreviewableMediaType(item.mediaType)) {
      signPromises.push(
        getSignedUrl(connection, bucket, item.key)
          .then((url) => {
            item.url = url;
          })
          .catch((error) => {
            // Log the error identity only — never the full error — since a
            // signed URL is a bearer credential.
            console.error('Error getting the signed URL:', error?.name || error?.code, error?.message);
          })
      );
    }
  });
  await Promise.all(signPromises);
};

// Owns the file-list data: fetching, pagination, navigation, search and the
// media-cache lifecycle. Ports the exact behavior of the original
// FileListScreen, now consuming the extracted domain/data/service modules.
export default function useFileList(currentConnection, currentBucket) {
  const [fullFiles, setFullFiles] = useState([]);
  const [displayedFiles, setDisplayedFiles] = useState([]);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Guards async work that is NOT tied to a single effect run (the public
  // `fetchFiles`/`refreshAfterMutation` callbacks, invoked directly by
  // screens e.g. for pull-to-refresh): flips to false only on unmount, via
  // the mount-effect cleanup below. Effect-initiated fetches instead use a
  // per-run `active` flag (see the merged fetch effect) — that flag captures
  // BOTH unmount AND "superseded by a newer run" (e.g. fast folder
  // navigation), which this long-lived ref alone cannot distinguish.
  const isMounted = useRef(true);
  const appState = useRef(AppState.currentState);
  // Previous (connectionId, bucket) the fetch effect ran with, so it can
  // tell a real connection/bucket switch (cache must be cleared) apart from
  // a same-bucket path navigation (cache must be kept). Sentinel values so
  // the very first run with a real connection/bucket also counts as a
  // change (parity with the previous unconditional clear-on-mount).
  const prevOriginRef = useRef({ connectionId: undefined, bucket: undefined });

  const fetchFiles = useCallback(
    // `forceRefresh` (pull-to-refresh, Task 5.8) skips the cache-hit branch
    // below so a manual refresh always re-lists the bucket from the server —
    // otherwise a refresh while the AsyncStorage list cache is still "fresh"
    // (see cacheConfig's TTL) would silently re-render the same stale items
    // instead of recovering from e.g. a transient network loss.
    async (isActive = () => isMounted.current, { forceRefresh = false } = {}) => {
      const cacheKey = getCacheKey(currentConnection, currentBucket, currentPath);
      try {
        // Attempt to retrieve cached data (returns items only if still fresh).
        const cachedItems = forceRefresh ? null : await getCachedItems(cacheKey);
        if (cachedItems) {
          // Re-stamp on hydration: the listing cache key already scopes these
          // items to this connection+bucket, and entries written before origin
          // stamping existed lack the fields entirely.
          const sortedItems = sortFiles(
            stampItemOrigin(cachedItems, currentConnection?.id, currentBucket)
          );
          // The cache never stores `url` (see stripVolatileFields below), so
          // previewable items always need a freshly-signed URL here.
          await attachSignedUrls(sortedItems, currentConnection, currentBucket);
          if (!isActive()) {
            return; // Unmounted, or superseded by a newer fetch: cancel.
          }
          setFullFiles(sortedItems);
          setDisplayedFiles(sortedItems.slice(0, PAGE_SIZE));
          setMediaFiles(sortedItems.filter((f) => !f.isFolder && isPreviewableMediaType(f.mediaType)));
          setLoading(false);
          setPage(1);
          return; // Exit early to avoid fetching from server.
        }

        // Fetch fresh data from the server: the delimiter caps the result to
        // this level's files plus immediate subfolders, and listAllObjects
        // paginates until the full current-level listing is retrieved.
        const listing = await listAllObjects(currentConnection, currentBucket, {
          prefix: currentPath,
          delimiter: '/',
        });

        if (!isActive()) {
          return; // Unmounted, or superseded by a newer fetch: cancel.
        }

        // Stamp each item with its fetch-time origin so media cache keys are
        // derived from the item itself, never from live context (which can be
        // one render ahead of the items during a bucket/connection switch —
        // see domain/fileListMapper.stampItemOrigin).
        let items = stampItemOrigin(
          parseObjects(listing, currentPath),
          currentConnection?.id,
          currentBucket
        );

        // Fetch the signed URLs for previewable (image/video) items in parallel.
        // Other file types don't need an upfront URL: they render a generic
        // icon and only need a URL later, on demand (download/share).
        await attachSignedUrls(items, currentConnection, currentBucket);

        // Sort first, then dedupe (preserving the original sequence).
        items = sortFiles(items);
        items = dedupeById(items);

        // Update state and cache.
        if (isActive()) {
          setFullFiles(items);
          setDisplayedFiles(items.slice(0, PAGE_SIZE));
          setMediaFiles(items.filter((f) => !f.isFolder && isPreviewableMediaType(f.mediaType)));
          setLoading(false);
          setPage(1);
          // Never persist `url`: it's a presigned URL with a 1h TTL, far
          // shorter than the file-list cache's TTL (see
          // domain/fileListMapper.stripVolatileFields).
          await setCachedItems(cacheKey, stripVolatileFields(items));
        }
      } catch (error) {
        console.error('Error fetching the file list:', error);
        if (isActive()) {
          Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
          setLoading(false);
        }
      }
    },
    [currentConnection, currentBucket, currentPath]
  );

  const loadMoreFiles = useCallback(() => {
    setPage((prevPage) => {
      const nextPage = prevPage + 1;
      const nextItems = fullFiles.slice(0, nextPage * PAGE_SIZE);
      if (nextItems.length > displayedFiles.length) {
        setDisplayedFiles(nextItems);
        return nextPage;
      }
      return prevPage;
    });
  }, [fullFiles, displayedFiles]);

  const enterFolder = useCallback(
    (name) => {
      setCurrentPath(currentPath + name + '/');
    },
    [currentPath]
  );

  const goBack = useCallback(() => {
    if (currentPath) {
      const paths = currentPath.split('/').filter((p) => p !== '');
      paths.pop();
      setCurrentPath(paths.length > 0 ? paths.join('/') + '/' : '');
    }
  }, [currentPath]);

  const addFolderOptimistic = useCallback(
    (folder) => {
      const updatedFullFiles = sortFiles([...fullFiles, folder]);
      setFullFiles(updatedFullFiles);
      setDisplayedFiles(updatedFullFiles.slice(0, page * PAGE_SIZE));
    },
    [fullFiles, page]
  );

  const refreshAfterMutation = useCallback(async () => {
    await removeCachedItems(
      getCacheKey(currentConnection, currentBucket, currentPath)
    );
    await fetchFiles();
  }, [currentConnection, currentBucket, currentPath, fetchFiles]);

  const setMediaFileUrl = useCallback((index, url) => {
    setMediaFiles((prev) => prev.map((it, i) => (i === index ? { ...it, url } : it)));
  }, []);

  // Mount effect: initialize the media cache and subscribe to app-state changes
  // to clear the cache when the app goes to the background.
  useEffect(() => {
    initializeMediaCache();

    const handleAppStateChange = async (nextAppState) => {
      if (appState.current.match(/active/) && nextAppState === 'background') {
        // App is going to the background, clear cache.
        await clearEntireCache();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    return () => {
      isMounted.current = false;
      subscription.remove();
    };
  }, []);

  // Fetch files when the connection, bucket, or path changes. This is the
  // single effect that owns the file listing (previously split across two
  // effects that both fetched on mount — a double network burst — and
  // shared one `isMounted` ref, which meant a slow fetch for a path the user
  // had already navigated away from could still land in state).
  //
  // `active` is a per-run cancellation token, not a ref: React runs this
  // run's cleanup (`active = false`) both when a NEWER run starts (deps
  // changed — connection/bucket/path navigation) and on unmount, so a single
  // flag covers both "stale response" and "unmounted" without conflating
  // them with other runs.
  useEffect(() => {
    let active = true;
    const isActive = () => active;

    const run = async () => {
      if (!currentConnection || !currentBucket) {
        // No active connection/bucket: reset to empty, and reset the origin
        // ref so the next real (connection, bucket) is treated as a change
        // (matching the previous unconditional clear-on-mount behavior).
        prevOriginRef.current = { connectionId: undefined, bucket: undefined };
        setFullFiles([]);
        setDisplayedFiles([]);
        setMediaFiles([]);
        setLoading(false);
        return;
      }

      // Clear the media/file cache only when the connection or bucket
      // ACTUALLY changed since the previous run, never on a path-only
      // navigation (which would otherwise wipe the cache on every folder
      // the user enters).
      const originChanged =
        prevOriginRef.current.connectionId !== currentConnection?.id ||
        prevOriginRef.current.bucket !== currentBucket;
      prevOriginRef.current = { connectionId: currentConnection?.id, bucket: currentBucket };

      setLoading(true);
      if (originChanged) {
        await clearEntireCache();
        if (!isActive()) {
          return; // Superseded or unmounted while clearing the cache.
        }
      }
      await fetchFiles(isActive);
    };

    run();

    return () => {
      active = false;
    };
  }, [currentConnection, currentBucket, currentPath, fetchFiles]);

  // Filter the already-loaded items client-side by name (case-insensitive).
  // No new S3 requests are triggered. Existing sorting is preserved.
  const trimmedQuery = searchQuery.trim().toLowerCase();
  // useMemo (Task 5.7): the filter+sort below is O(n log n) with string
  // comparisons, but before this it re-ran on EVERY render of this hook
  // (i.e. every FileListScreen render — upload/delete progress ticks,
  // selection changes, modal open/close, etc.), not just when the search
  // query or the underlying file lists actually changed. Keyed on the true
  // inputs of the computation itself: trimmedQuery (what's searched),
  // fullFiles (what a non-empty query searches over), and displayedFiles
  // (what's returned verbatim when there is no query).
  const visibleFiles = useMemo(() => {
    return trimmedQuery
      ? sortFiles(fullFiles.filter((file) => file.name.toLowerCase().includes(trimmedQuery)))
      : displayedFiles;
  }, [trimmedQuery, fullFiles, displayedFiles]);
  const showNoResults = trimmedQuery !== '' && visibleFiles.length === 0;

  return {
    fullFiles,
    displayedFiles,
    mediaFiles,
    loading,
    currentPath,
    searchQuery,
    setSearchQuery,
    visibleFiles,
    showNoResults,
    fetchFiles,
    loadMoreFiles,
    enterFolder,
    goBack,
    addFolderOptimistic,
    refreshAfterMutation,
    setMediaFileUrl,
  };
}
