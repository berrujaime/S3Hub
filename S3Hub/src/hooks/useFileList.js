import { useState, useRef, useEffect, useCallback } from 'react';
import { Alert, AppState } from 'react-native';
import { listObjects, getSignedUrl } from '../services/s3Service';
import { PAGE_SIZE } from '../config/cacheConfig';
import { sortFiles, parseObjects, dedupeById } from '../domain/fileListMapper';
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
        const sortedItems = sortFiles(cachedItems);
        setFullFiles(sortedItems);
        setDisplayedFiles(sortedItems.slice(0, PAGE_SIZE));
        setMediaFiles(sortedItems.filter((f) => !f.isFolder));
        setLoading(false);
        setPage(1);
        return; // Exit early to avoid fetching from server.
      }

      // Fetch fresh data from the server.
      const response = await listObjects(
        currentConnection,
        currentBucket,
        currentPath
      );

      if (!isMounted.current) {
        return; // The component has unmounted, cancel state update.
      }

      if (response.Contents) {
        let items = parseObjects(response.Contents, currentPath);

        // Fetch the signed URLs for file items in parallel.
        const filePromises = [];
        items.forEach((item) => {
          if (!item.isFolder) {
            filePromises.push(
              getSignedUrl(currentConnection, currentBucket, item.key)
                .then((url) => {
                  item.url = url;
                })
                .catch((error) => {
                  console.error('Error getting the signed URL:', error);
                })
            );
          }
        });

        // Wait for all signed URLs to be obtained.
        await Promise.all(filePromises);

        // Sort first, then dedupe (preserving the original sequence).
        items = sortFiles(items);
        items = dedupeById(items);

        // Update state and cache.
        if (isMounted.current) {
          setFullFiles(items);
          setDisplayedFiles(items.slice(0, PAGE_SIZE));
          setMediaFiles(items.filter((f) => !f.isFolder));
          setLoading(false);
          setPage(1);
          await setCachedItems(cacheKey, items);
        }
      } else {
        // If no contents, clear the list.
        if (isMounted.current) {
          setFullFiles([]);
          setDisplayedFiles([]);
          setMediaFiles([]);
          setLoading(false);
          await setCachedItems(cacheKey, []);
        }
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
