import { useState, useRef, useEffect, useCallback } from 'react';
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
            console.error('Error getting the signed URL:', error);
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

  const isMounted = useRef(true);
  const appState = useRef(AppState.currentState);

  const fetchFiles = useCallback(async () => {
    const cacheKey = getCacheKey(currentConnection, currentBucket, currentPath);
    try {
      // Attempt to retrieve cached data (returns items only if still fresh).
      const cachedItems = await getCachedItems(cacheKey);
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
        if (!isMounted.current) {
          return; // The component has unmounted, cancel state update.
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

      if (!isMounted.current) {
        return; // The component has unmounted, cancel state update.
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
      if (isMounted.current) {
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
      if (isMounted.current) {
        Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
        setLoading(false);
      }
    }
  }, [currentConnection, currentBucket, currentPath]);

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
    setMediaFiles((prev) => {
      // Mutate in place to preserve the original on-demand URL behavior.
      if (prev[index]) {
        prev[index].url = url;
      }
      return prev;
    });
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

  // Fetch files when the connection, bucket, or path changes.
  useEffect(() => {
    isMounted.current = true;

    const fetchData = async () => {
      if (currentConnection && currentBucket) {
        setLoading(true);
        await fetchFiles();
      } else {
        setFullFiles([]);
        setDisplayedFiles([]);
        setMediaFiles([]);
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConnection, currentBucket, currentPath]);

  // Clear cache and fetch new files when the bucket or connection changes.
  useEffect(() => {
    const handleBucketChange = async () => {
      if (currentConnection && currentBucket) {
        await clearEntireCache();
        await fetchFiles();
      }
    };

    handleBucketChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConnection, currentBucket]);

  // Filter the already-loaded items client-side by name (case-insensitive).
  // No new S3 requests are triggered. Existing sorting is preserved.
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const visibleFiles = trimmedQuery
    ? sortFiles(fullFiles.filter((file) => file.name.toLowerCase().includes(trimmedQuery)))
    : displayedFiles;
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
