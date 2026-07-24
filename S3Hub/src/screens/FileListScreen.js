import React, { useEffect, useState, useContext, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Text,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import {
  getSignedUrl,
  deleteFile,
  deleteFolderRecursive,
  listAllUnderPrefix,
  getPresignedUploadUrl,
  uploadEmptyFolder,
} from '../services/s3Service';
import {
  FAB,
  Button,
  IconButton,
  Dialog,
  Portal,
  TextInput,
  Searchbar,
  useTheme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import UploadProgressPopup from '../components/UploadProgressPopup';
import FileItem from '../components/FileItem';
import MediaViewerModal from '../components/MediaViewerModal';
import i18n from '../locales/translations';
import { ensureDirectoryExists, getCachedFileUri } from '../services/mediaCache';
import { mediaCacheKey } from '../domain/cacheKeys';
import { matchesOrigin, stampItemOrigin } from '../domain/fileListMapper';
import { mapS3Error } from '../domain/errors';
import useFileList from '../hooks/useFileList';
import useFileSelection from '../hooks/useFileSelection';
import { SCREEN_TOP_SPACING } from '../theme/spacing';

// Cache namespace derived from the ITEM's own fetch-time origin (stamped in
// useFileList), never from the live connection/bucket context — during a
// bucket/connection switch the context updates one render before the items
// do, and a live-context key would file the old bucket's bytes under the
// new bucket's namespace. Returns null (callers skip the disk cache) when
// an item lacks origin fields rather than guessing a namespace.
const itemCacheKey = (item) =>
  item.connectionId && item.bucket ? mediaCacheKey(item.connectionId, item.bucket, item.key) : null;

export default function FileListScreen() {
  const { currentConnection, currentBucket, preview } = useContext(AuthContext);

  const {
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
  } = useFileList(currentConnection, currentBucket);

  const { selectedFiles, toggleSelection, selectAll, clearSelection } = useFileSelection();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Mutual exclusion for the batch operation handlers below (upload,
  // download-selected, delete-selected, modal-delete): only one may run at
  // a time. This both prevents a double-tap from starting two overlapping
  // operations and — since isUploading/uploadProgress and
  // isDeleting/deleteProgress are shared across those handlers — stops
  // their progress updates from interleaving when two would otherwise run
  // concurrently.
  //
  // Ref + state combo, deliberately: `operationInFlightRef` is the actual
  // gate each handler checks, since a plain `useState` boolean is only
  // guaranteed to be current after React commits the re-render — two taps
  // arriving before that commit (the double-tap case) would both read the
  // pre-update `false` from their own render's closure and both pass the
  // guard. A ref is mutated synchronously, so the very next handler
  // invocation — even one dispatched before the next render — sees the
  // update immediately. `operationInFlight` (state) is kept in lockstep
  // purely to drive the `disabled` prop of the upload FAB and the
  // delete/download selection actions, which does need a render to take
  // effect.
  const operationInFlightRef = useRef(false);
  const [operationInFlight, setOperationInFlight] = useState(false);
  const { width } = useWindowDimensions();

  const theme = useTheme(); // Access the theme
  // headerShown: false (see AppNavigator.js's FilesStack) — this screen sits
  // directly under the status bar, so insets.top replaces the old hardcoded
  // marginTop (Task 5.3).
  const insets = useSafeAreaInsets();

  // Guards the progress-related setState calls in the batch operation
  // handlers below against firing after unmount (e.g. the user navigates
  // away, or the connection/bucket is torn down, while an upload/download/
  // delete/folder-create is still in flight). Flips to false only on
  // unmount, mirroring the equivalent ref in useFileList.
  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Deselect files when changing connection, bucket, or folder.
  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConnection, currentBucket, currentPath]);

  const numColumns = viewMode === 'grid' ? (width >= 1024 ? 4 : width >= 768 ? 3 : 2) : 1;
  const itemSize = width / numColumns;

  // Pull-to-refresh (Task 5.8): re-fetches the current path bypassing the
  // AsyncStorage list cache (`forceRefresh`, see useFileList.fetchFiles), so
  // a manual pull recovers from e.g. a transient network loss instead of
  // silently re-rendering the same cached items.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchFiles(undefined, { forceRefresh: true });
    } finally {
      if (isMounted.current) {
        setRefreshing(false);
      }
    }
  }, [fetchFiles]);

  // handleFolderPress/handleItemPress/handleItemSelect/handleItemLongPress
  // are wrapped in useCallback (Task 5.7) so their identity stays stable
  // across FileListScreen re-renders that don't touch their own
  // dependencies — required for the FileItem React.memo below to actually
  // skip re-renders instead of always seeing a "new" onPress/onLongPress
  // prop. Logic is unchanged from the original plain function bodies.
  // NOTE: these still change identity whenever `selectedFiles` or
  // `mediaFiles` changes (selection/list state), which is inherent to what
  // the handlers do — memo still helps on every OTHER re-render (e.g.
  // upload/delete progress ticks, unrelated screen state).
  const handleFolderPress = useCallback(
    (folder) => {
      if (selectedFiles.length > 0) {
        // If in selection mode, toggle selection
        toggleSelection(folder.id);
      } else {
        enterFolder(folder.name);
        clearSelection(); // Deselect files when changing folder
      }
    },
    [selectedFiles, toggleSelection, enterFolder, clearSelection],
  );

  const handleItemPress = useCallback(
    async (id) => {
      if (selectedFiles.length > 0) {
        toggleSelection(id);
      } else {
        const mediaIndex = mediaFiles.findIndex((f) => f.id === id);
        if (mediaIndex !== -1) {
          // If URL is not preloaded because preview is off, load it now
          if (!mediaFiles[mediaIndex].url) {
            try {
              const url = await getSignedUrl(
                currentConnection,
                currentBucket,
                mediaFiles[mediaIndex].key,
              );
              setMediaFileUrl(mediaIndex, url);
            } catch (error) {
              // Log the error identity only — never the full error — since a
              // signed URL is a bearer credential.
              console.error(
                'Error loading media URL on demand:',
                error?.name || error?.code,
                error?.message,
              );
            }
          }
          setCurrentMediaIndex(mediaIndex);
          setIsModalVisible(true);
        }
      }
    },
    [selectedFiles, toggleSelection, mediaFiles, currentConnection, currentBucket, setMediaFileUrl],
  );

  // The FlatList passes an item; route folders and media to the right handler.
  const handleItemSelect = useCallback(
    (item) => {
      if (item.isFolder) {
        handleFolderPress(item);
      } else {
        handleItemPress(item.id);
      }
    },
    [handleFolderPress, handleItemPress],
  );

  const handleItemLongPress = useCallback(
    (item) => {
      toggleSelection(item.id);
    },
    [toggleSelection],
  );

  // Fixed-size grid row layout (Task 5.7): in grid mode every cell is a
  // square TouchableOpacity of (itemSize - 16) with an 8px margin on all
  // sides (see FileItem's itemContainer usage), so each cell's full
  // margin-box is (itemSize - 16) + 8 + 8 = itemSize on both axes, and
  // numColumns of them exactly fill `width` (itemSize = width / numColumns).
  // That makes every row exactly `itemSize` tall, so FlatList can compute
  // offsets without measuring. Only valid for the grid — list-view rows are
  // not fixed height — so it's applied conditionally below.
  //
  // NOTE: when numColumns > 1, FlatList overrides getItemCount/getItem so
  // VirtualizedList iterates over ROWS (Math.ceil(data.length/numColumns))
  // and passes that ROW index straight into getItemLayout — `index` here is
  // already the row index. Dividing it by numColumns again would collapse
  // distinct rows onto the same offset and corrupt the windowing math.
  const gridItemLayout = useCallback(
    (data, index) => ({ length: itemSize, offset: index * itemSize, index }),
    [itemSize],
  );

  const handleUpload = async () => {
    // A second tap while an upload/download/delete is already running is a
    // no-op: see the `operationInFlight` declaration above for why this is
    // shared across all the batch handlers, not just upload-specific.
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setOperationInFlight(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const totalFiles = result.assets.length;
        let uploadedFiles = 0;
        let processedFiles = 0;
        let lastError = null;

        if (isMounted.current) {
          setIsUploading(true);
          setUploadProgress(0);
        }

        // Per-asset try/catch: one file failing to sign or upload must skip
        // only that file and be folded into the aggregated (done/total)
        // result, never abort the rest of the batch — see the equivalent
        // per-item aggregation in handleDownloadSelected/handleDeleteSelected.
        for (const asset of result.assets) {
          try {
            const fileUri = asset.uri;
            const fileName = asset.name;
            const mimeType = asset.mimeType || 'application/octet-stream';

            let key = currentPath + fileName;

            // Handle duplicate file names by appending a timestamp
            const existingFile = fullFiles.find((f) => f.key === key);
            if (existingFile) {
              const timestamp = Date.now();
              key = `${currentPath}${fileName}_${timestamp}`;
            }

            const uploadUrl = await getPresignedUploadUrl(
              currentConnection,
              currentBucket,
              key,
              mimeType,
            );

            // Upload the file using uploadAsync to allow background upload
            const uploadResult = await FileSystem.uploadAsync(uploadUrl, fileUri, {
              httpMethod: 'PUT',
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
              headers: {
                'Content-Type': mimeType,
              },
            });

            // uploadAsync RESOLVES on HTTP 4xx/5xx (it only rejects on a
            // transport failure), so a presigned PUT rejected with e.g. 403
            // would otherwise be counted as a success. Only a 2xx response
            // is a successful upload; anything else throws a synthetic
            // error carrying $metadata.httpStatusCode so the shared catch
            // below folds it into the partial result and, in the all-failed
            // case, mapS3Error's status branch maps it (403 ->
            // errorAccessDenied, ...).
            if (uploadResult.status < 200 || uploadResult.status >= 300) {
              throw Object.assign(new Error(`Upload failed with HTTP ${uploadResult.status}`), {
                $metadata: { httpStatusCode: uploadResult.status },
              });
            }

            uploadedFiles += 1;
          } catch (error) {
            console.error('Error uploading file:', error?.name || error?.code, error?.message);
            lastError = error;
          } finally {
            processedFiles += 1;
            if (isMounted.current) {
              setUploadProgress(processedFiles / totalFiles);
            }
          }
        }

        // After all uploads are complete, refetch the file list to ensure synchronization
        await fetchFiles();

        if (isMounted.current) {
          setIsUploading(false);
          setUploadProgress(1);
        }

        if (uploadedFiles === totalFiles) {
          Alert.alert(i18n.t('success'), i18n.t('uploadSuccess'));

          // Send notification upon completion of the upload
          await Notifications.scheduleNotificationAsync({
            content: {
              title: i18n.t('upload'),
              body: i18n.t('uploadSuccess'),
            },
            trigger: null,
          });
        } else if (uploadedFiles > 0) {
          Alert.alert(
            i18n.t('error'),
            i18n.t('partialUpload', { done: uploadedFiles, total: totalFiles }),
          );
        } else {
          Alert.alert(i18n.t('error'), i18n.t(mapS3Error(lastError)));
        }
      }
    } catch (error) {
      console.error('Error uploading files:', error?.name || error?.code, error?.message);
      if (isMounted.current) {
        setIsUploading(false);
      }
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    } finally {
      operationInFlightRef.current = false;
      if (isMounted.current) {
        setOperationInFlight(false);
      }
    }
  };

  // Non-previewable items (document/audio/archive/other) are fetched without
  // an upfront signed URL (see domain/fileListMapper.isPreviewableMediaType)
  // and only get one on demand, here. Signing is only safe when the item's
  // own stamped fetch-time origin still matches the live connection/bucket
  // (see domain/fileListMapper.matchesOrigin) — otherwise this would mint a
  // URL using the wrong account's credentials. Returns null when a URL
  // cannot be safely obtained.
  const resolveFileUrl = async (file) => {
    if (file.url) {
      return file.url;
    }
    if (currentConnection && matchesOrigin(file, currentConnection.id, currentBucket)) {
      return getSignedUrl(currentConnection, currentBucket, file.key);
    }
    return null;
  };

  const handleDownloadSelected = async () => {
    // A second tap while an upload/download/delete is already running is a
    // no-op: see the `operationInFlight` declaration above.
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setOperationInFlight(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(i18n.t('error'), i18n.t('downloadError'));
        return;
      }

      const totalItems = selectedFiles.length;
      let succeededItems = 0;
      let lastError = null;

      for (const fileId of selectedFiles) {
        // Per-file try/catch: one file failing to sign or download (e.g. a
        // getSignedUrl rejection) must skip only that file and be folded
        // into the aggregated (done/total) result, never abort the rest of
        // the batch — the same skip-and-aggregate behavior as the null-url
        // guard below.
        try {
          const file = fullFiles.find((f) => f.id === fileId);
          if (file.isFolder) {
            if (await downloadFolder(file)) {
              succeededItems += 1;
            }
          } else {
            const url = await resolveFileUrl(file);
            if (url && (await downloadFile({ ...file, url }))) {
              succeededItems += 1;
            }
          }
        } catch (error) {
          console.error(
            'Error downloading selected item:',
            error?.name || error?.code,
            error?.message,
          );
          lastError = error;
        }
      }

      if (succeededItems === totalItems) {
        Alert.alert(i18n.t('success'), i18n.t('downloadSuccess'));
      } else if (succeededItems > 0) {
        Alert.alert(
          i18n.t('error'),
          i18n.t('partialDownload', { done: succeededItems, total: totalItems }),
        );
      } else {
        Alert.alert(i18n.t('error'), i18n.t(mapS3Error(lastError)));
      }
      clearSelection();
    } catch (error) {
      console.error('Error downloading files:', error?.name || error?.code, error?.message);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    } finally {
      operationInFlightRef.current = false;
      if (isMounted.current) {
        setOperationInFlight(false);
      }
    }
  };

  // Downloads one file to a temp location and hands it to the gallery.
  // Returns true on success, false on failure (the error is logged here, not
  // rethrown), so batch callers can aggregate per-file failures instead of
  // silently reporting success.
  const downloadFile = async (file) => {
    // Written under cacheDirectory (not documentDirectory) with a unique
    // suffix: cacheDirectory is OS-reclaimable disposable storage, and the
    // suffix avoids same-name collisions across downloads. The file is only
    // ever a hand-off to the gallery/share target, so it's always removed
    // afterwards in the finally block below — success or failure — instead
    // of accumulating unbounded on disk.
    const tempFileUri = `${FileSystem.cacheDirectory}${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
    try {
      const uri = file.url;

      // Ensure directory exists before downloading
      await ensureDirectoryExists(tempFileUri);

      const downloadObject = FileSystem.createDownloadResumable(uri, tempFileUri);
      const response = await downloadObject.downloadAsync();

      // Save to gallery
      await MediaLibrary.saveToLibraryAsync(response.uri);
      return true;
    } catch (error) {
      // Log the error identity only, never the full error: `file.url` is a
      // presigned URL (a bearer credential), and some download-layer errors
      // embed the failing URL in their message.
      console.error('Error downloading file:', error?.name || error?.code, error?.message);
      return false;
    } finally {
      await FileSystem.deleteAsync(tempFileUri, { idempotent: true }).catch((error) =>
        console.error('Error deleting temp download file:', error),
      );
    }
  };

  // Downloads every file under a folder prefix. Returns true only if the
  // listing succeeded AND every file downloaded; false as soon as anything
  // failed (errors are logged here, not rethrown), so batch callers can fold
  // folder failures into their aggregated result.
  //
  // Origin guard mirrors resolveFileUrl above: `folder` carries its own
  // fetch-time (connectionId, bucket) — see domain/fileListMapper.
  // stampItemOrigin — which can lag one render behind the live
  // AuthContext during a bucket/connection switch. Listing/signing with the
  // LIVE currentConnection/currentBucket against a folder key stamped from a
  // DIFFERENT origin would list and sign against the wrong account/bucket
  // for a key that may not even exist there. Returns false (no network call)
  // when the origin no longer matches.
  const downloadFolder = async (folder) => {
    if (!currentConnection || !matchesOrigin(folder, currentConnection.id, currentBucket)) {
      return false;
    }
    try {
      const objects = await listAllUnderPrefix(currentConnection, currentBucket, folder.key);

      let allSucceeded = true;
      for (const object of objects) {
        const key = object.Key;
        if (!key.endsWith('/')) {
          // It is a file
          const url = await getSignedUrl(currentConnection, currentBucket, key);
          const fileName = key.substring(key.lastIndexOf('/') + 1);
          const file = {
            url: url,
            name: fileName,
          };
          if (!(await downloadFile(file))) {
            allSucceeded = false;
          }
        }
      }
      return allSucceeded;
    } catch (error) {
      console.error('Error downloading folder:', error?.name || error?.code, error?.message);
      return false;
    }
  };

  const handleSelectAll = () => {
    // Select all currently shown items (the filtered set when searching).
    const trimmedQuery = searchQuery.trim().toLowerCase();
    const shownFiles = trimmedQuery
      ? fullFiles.filter((file) => file.name.toLowerCase().includes(trimmedQuery))
      : displayedFiles;
    selectAll(shownFiles);
  };

  const handleSwitchView = () => {
    setViewMode(viewMode === 'grid' ? 'list' : 'grid');
  };

  const handleDeleteSelected = async () => {
    // A second tap while an upload/download/delete is already running is a
    // no-op: see the `operationInFlight` declaration above.
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setOperationInFlight(true);
    try {
      const confirm = await new Promise((resolve) => {
        Alert.alert(
          i18n.t('delete'),
          `${i18n.t('delete')} ${selectedFiles.length} ${i18n.t('items')}`,
          [
            { text: i18n.t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: i18n.t('delete'), style: 'destructive', onPress: () => resolve(true) },
          ],
        );
      });

      if (!confirm) return;

      const totalItems = selectedFiles.length;
      let processedItems = 0;
      let succeededItems = 0;
      let lastError = null;
      if (isMounted.current) {
        setIsDeleting(true);
        setDeleteProgress(0);
      }

      for (const fileId of selectedFiles) {
        // Per-item try/catch: one item failing to delete must skip only
        // that item and be folded into the aggregated (done/total) result,
        // never abort the rest of the batch — same rationale as the
        // per-file aggregation in handleDownloadSelected.
        try {
          const file = fullFiles.find((f) => f.id === fileId);
          // Stale-origin guard, same as resolveFileUrl/downloadFolder: skip
          // deleting a key stamped from a different (connectionId, bucket)
          // than the live connection/bucket rather than issuing a delete
          // against the wrong account/bucket for a key that may not even
          // exist there. Folds into the aggregated result like any other
          // per-item failure, without throwing.
          if (!currentConnection || !matchesOrigin(file, currentConnection.id, currentBucket)) {
            // no-op: counted as a failure via processedItems below.
          } else if (file.isFolder) {
            const { errors: deleteErrors } = await deleteFolderRecursive(
              currentConnection,
              currentBucket,
              file.key,
            );
            if (deleteErrors.length > 0) {
              // Per-object S3 delete errors carry a `Code`, not a `name` —
              // reshape so mapS3Error (which reads `.name`) can look it up.
              lastError = { name: deleteErrors[0].Code, message: deleteErrors[0].Message };
            } else {
              succeededItems += 1;
            }
          } else {
            await deleteFile(currentConnection, currentBucket, file.key);
            succeededItems += 1;
          }
        } catch (error) {
          console.error('Error deleting item:', error?.name || error?.code, error?.message);
          lastError = error;
        } finally {
          processedItems += 1;
          if (isMounted.current) {
            setDeleteProgress(processedItems / totalItems);
          }
        }
      }

      // **Clear the cache for the current path to ensure fetchFiles retrieves fresh data**
      // Fetch the updated file list from the server
      await refreshAfterMutation();

      if (isMounted.current) {
        setIsDeleting(false);
        setDeleteProgress(1);
      }
      if (succeededItems === totalItems) {
        Alert.alert(i18n.t('success'), i18n.t('deleteSuccess'));
      } else if (succeededItems > 0) {
        Alert.alert(
          i18n.t('error'),
          i18n.t('partialDelete', { done: succeededItems, total: totalItems }),
        );
      } else {
        Alert.alert(i18n.t('error'), i18n.t(mapS3Error(lastError)));
      }
      clearSelection();
    } catch (error) {
      console.error('Error deleting items:', error?.name || error?.code, error?.message);
      if (isMounted.current) {
        setIsDeleting(false);
      }
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    } finally {
      operationInFlightRef.current = false;
      if (isMounted.current) {
        setOperationInFlight(false);
      }
    }
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim() === '') {
      Alert.alert(i18n.t('error'), i18n.t('folderError'));
      return;
    }

    const folderKey = currentPath + newFolderName.trim() + '/';

    try {
      await uploadEmptyFolder(currentConnection, currentBucket, folderKey);

      if (isMounted.current) {
        setIsDialogVisible(false);
        setNewFolderName('');

        // Update local state and cache incrementally. Stamped with the
        // current (connectionId, bucket) like every other listed item (see
        // domain/fileListMapper.stampItemOrigin) so an immediate download of
        // this folder passes the matchesOrigin guard in downloadFolder
        // instead of being treated as a stale-origin item.
        const [newFolder] = stampItemOrigin(
          [
            {
              id: folderKey, // Unique identifier for folder
              key: folderKey,
              name: newFolderName.trim(),
              isFolder: true,
            },
          ],
          currentConnection?.id,
          currentBucket,
        );
        addFolderOptimistic(newFolder);
      }

      Alert.alert(i18n.t('success'), i18n.t('folderCreated'));
    } catch (error) {
      console.error('Error creating folder:', error?.name || error?.code, error?.message);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    }
  };

  const handleModalShare = async () => {
    try {
      const currentMedia = mediaFiles[currentMediaIndex];
      if (!currentMedia) return;

      const cacheKey = itemCacheKey(currentMedia);
      const localUri = cacheKey ? await getCachedFileUri(cacheKey, currentMedia.url) : null;

      if (localUri) {
        await Sharing.shareAsync(localUri);
      } else {
        Alert.alert(i18n.t('error'), i18n.t('downloadError'));
      }
    } catch (error) {
      console.error('Error sharing file:', error?.name || error?.code, error?.message);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    }
  };

  const handleModalDownload = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(i18n.t('error'), i18n.t('downloadError'));
        return;
      }

      const currentMedia = mediaFiles[currentMediaIndex];
      if (!currentMedia) return;

      const cacheKey = itemCacheKey(currentMedia);
      const localUri = cacheKey ? await getCachedFileUri(cacheKey, currentMedia.url) : null;
      if (!localUri) {
        Alert.alert(i18n.t('error'), i18n.t('downloadError'));
        return;
      }

      await MediaLibrary.saveToLibraryAsync(localUri);

      Alert.alert(i18n.t('success'), i18n.t('downloadSuccess'));
    } catch (error) {
      console.error('Error downloading file:', error?.name || error?.code, error?.message);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    }
  };

  const handleModalDelete = async () => {
    // A second tap while an upload/download/delete is already running is a
    // no-op: see the `operationInFlight` declaration above. This also keeps
    // this handler from interleaving with handleDeleteSelected, which
    // shares the same isDeleting/deleteProgress state.
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setOperationInFlight(true);
    try {
      const currentMedia = mediaFiles[currentMediaIndex];
      if (!currentMedia) return;

      const confirm = await new Promise((resolve) => {
        Alert.alert(i18n.t('delete'), `${i18n.t('delete')} "${currentMedia.name}"?`, [
          { text: i18n.t('cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: i18n.t('delete'), style: 'destructive', onPress: () => resolve(true) },
        ]);
      });

      if (!confirm) return;

      if (isMounted.current) {
        setIsDeleting(true);
        setDeleteProgress(0);
      }

      let deleteError = null;
      // Stale-origin guard, same as resolveFileUrl/downloadFolder/
      // handleDeleteSelected: the viewer can still be showing an item from
      // a bucket/connection the user has since switched away from. Skip
      // rather than deleting a key stamped from a different origin using
      // the live connection/bucket's credentials; report it as a failure
      // (mapS3Error falls back to errorGeneric for a non-error object).
      //
      // No folder branch here (unlike handleDeleteSelected): currentMedia
      // comes from mediaFiles, which useFileList populates by filtering out
      // isFolder items (only previewable image/video files are ever added
      // to mediaFiles), so currentMedia.isFolder is always false.
      if (!currentConnection || !matchesOrigin(currentMedia, currentConnection.id, currentBucket)) {
        deleteError = {};
      } else {
        await deleteFile(currentConnection, currentBucket, currentMedia.key);
      }

      // Update local state and cache incrementally
      await refreshAfterMutation();

      if (isMounted.current) {
        setIsDeleting(false);
        setDeleteProgress(1);
      }
      if (deleteError) {
        Alert.alert(i18n.t('error'), i18n.t(mapS3Error(deleteError)));
      } else {
        Alert.alert(i18n.t('success'), i18n.t('deleteSuccess'));
      }
      if (isMounted.current) {
        setIsModalVisible(false);
      }
    } catch (error) {
      console.error('Error deleting file:', error?.name || error?.code, error?.message);
      if (isMounted.current) {
        setIsDeleting(false);
      }
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    } finally {
      operationInFlightRef.current = false;
      if (isMounted.current) {
        setOperationInFlight(false);
      }
    }
  };

  // When the viewer reaches the last loaded item, request more pages.
  const handleModalReachEnd = (lastIndex) => {
    if (lastIndex >= displayedFiles.length - 1) {
      loadMoreFiles();
    }
  };

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + SCREEN_TOP_SPACING }]}>
      {(isUploading || isDeleting) && (
        <UploadProgressPopup
          progress={isUploading ? uploadProgress : deleteProgress}
          operation={isUploading ? i18n.t('uploadProgress') : i18n.t('deleteProgress')}
        />
      )}
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.onBackground }]}>
        {i18n.t('filesIn')} {currentBucket}
      </Text>

      <Searchbar
        placeholder={i18n.t('search')}
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
      />

      <View style={styles.actionContainer}>
        {currentPath ? (
          <IconButton
            icon="arrow-left"
            onPress={goBack}
            style={styles.goBackButton}
            accessibilityLabel={i18n.t('back')}
          />
        ) : null}
        <IconButton
          icon={viewMode === 'grid' ? 'view-list' : 'view-grid'}
          onPress={handleSwitchView}
          style={styles.viewToggleButton}
          accessibilityLabel={viewMode === 'grid' ? i18n.t('listView') : i18n.t('gridView')}
        />
        <IconButton
          icon="select-all"
          onPress={handleSelectAll}
          style={styles.selectAllButton}
          accessibilityLabel={i18n.t('selectAll')}
        />
      </View>

      {selectedFiles.length > 0 && (
        <View style={styles.selectionActionContainer}>
          <Button
            mode="contained"
            onPress={handleDownloadSelected}
            disabled={operationInFlight}
            style={styles.downloadButton}
          >
            {i18n.t('download')}
          </Button>
          <Button
            mode="contained"
            onPress={handleDeleteSelected}
            disabled={operationInFlight}
            // buttonColor/textColor (not style.backgroundColor) so Paper
            // computes an AA label color for THIS background rather than
            // keeping its contained-mode default (onPrimary, meant for a
            // primary-colored background).
            buttonColor={theme.colors.error}
            textColor={theme.colors.onError}
            style={styles.deleteButton}
          >
            {i18n.t('delete')}
          </Button>
        </View>
      )}

      {showNoResults ? (
        <View style={styles.noResultsContainer}>
          <Text style={[styles.noResultsText, { color: theme.colors.onSurface }]}>
            {i18n.t('noResults')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleFiles}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <FileItem
              item={item}
              index={index}
              viewMode={viewMode}
              itemSize={itemSize}
              isSelected={selectedFiles.includes(item.id)}
              preview={preview}
              currentMediaIndex={currentMediaIndex}
              isModalVisible={isModalVisible}
              onPress={handleItemSelect}
              onLongPress={handleItemLongPress}
            />
          )}
          numColumns={numColumns}
          key={`${viewMode}-${numColumns}`}
          contentContainerStyle={styles.flatListContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          onEndReached={loadMoreFiles}
          onEndReachedThreshold={0.5}
          // getItemLayout only applies to the grid: list-view row heights
          // are content-driven (text can wrap), so `undefined` there falls
          // back to FlatList's normal measured layout (unchanged behavior).
          getItemLayout={viewMode === 'grid' ? gridItemLayout : undefined}
          // windowSize trimmed from the default 21 screens' worth of
          // content to 5: each row can hold expensive CachedImage/
          // CachedVideo content, so keeping fewer off-screen rows mounted
          // reduces memory/CPU without starving the pre-render window needed
          // for smooth scroll.
          windowSize={5}
          // Android-beneficial: unmounts off-screen native views, which
          // matters here since rows can hold images/videos. The classic iOS
          // caveat is content disappearing when clipped views sit inside
          // scale/opacity-animated or `position: absolute`-outside-bounds
          // ancestors; FileItem's absolutely-positioned children (checkbox/
          // play-icon overlays) are always inside their own row's bounds, so
          // that failure mode doesn't apply here.
          removeClippedSubviews={true}
        />
      )}

      <FAB
        style={styles.createFolderFab}
        icon="folder-plus"
        onPress={() => setIsDialogVisible(true)}
        accessibilityLabel={i18n.t('createFolder')}
      />

      <Portal>
        {/* The keyboard avoider must sit at the Portal root: RN computes the
            keyboard overlap from the wrapped view's parent-relative onLayout
            frame versus the keyboard's absolute screen Y, so the math only
            fires when the wrapper spans the screen (frame.y ~ 0). Wrapping
            anything deeper (e.g. Dialog.Content) yields zero overlap and no
            adjustment.
            The flex:1 spacer View is load-bearing, not decoration: on iOS the
            'padding' behavior adds paddingBottom to the avoider, but Yoga
            never applies parent padding to absolutely-positioned children
            with all insets defined — and Paper Modal's root is exactly that
            (absoluteFill). Padding only affects normal-flow children, so the
            spacer shrinks with the padding and the Modal fills the shrunken
            spacer instead of the whole window. Android's 'height' behavior
            shrinks the avoider's own border box, which works either way.
            enabled={isDialogVisible} gates the permanently-mounted avoider so
            its keyboard listeners don't fire a global LayoutAnimation when
            the keyboard opens for anything else on this screen (e.g. search).
            pointerEvents="box-none" lets backdrop presses through so
            onDismiss still works. */}
        <KeyboardAvoidingView
          style={StyleSheet.absoluteFill}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={isDialogVisible}
          pointerEvents="box-none"
        >
          <View style={styles.dialogAvoiderSpacer} pointerEvents="box-none">
            <Dialog visible={isDialogVisible} onDismiss={() => setIsDialogVisible(false)}>
              <Dialog.Title>{i18n.t('createFolder')}</Dialog.Title>
              <Dialog.Content>
                <TextInput
                  label={i18n.t('folderName')}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  mode="outlined"
                />
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setIsDialogVisible(false)}>{i18n.t('cancel')}</Button>
                <Button onPress={handleCreateFolder}>{i18n.t('create')}</Button>
              </Dialog.Actions>
            </Dialog>
          </View>
        </KeyboardAvoidingView>
      </Portal>

      <FAB
        style={styles.fab}
        icon="upload"
        onPress={handleUpload}
        disabled={operationInFlight}
        accessibilityLabel={i18n.t('upload')}
      />

      {/* Modal to show the full picture with its information */}
      <MediaViewerModal
        visible={isModalVisible}
        mediaFiles={mediaFiles}
        currentMediaIndex={currentMediaIndex}
        onClose={() => setIsModalVisible(false)}
        onDelete={handleModalDelete}
        onDownload={handleModalDownload}
        onShare={handleModalShare}
        onIndexChange={setCurrentMediaIndex}
        onReachEnd={handleModalReachEnd}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Normal-flow child of the create-folder KeyboardAvoidingView; see the
  // comment at the dialog for why this spacer is required on iOS.
  dialogAvoiderSpacer: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  searchbar: {
    marginHorizontal: 8,
    marginBottom: 8,
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  noResultsText: {
    fontSize: 16,
    textAlign: 'center',
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  goBackButton: {},
  viewToggleButton: {},
  selectAllButton: {},
  selectionActionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  downloadButton: {
    flex: 1,
    marginHorizontal: 8,
  },
  deleteButton: {
    flex: 1,
    marginHorizontal: 8,
    // color is themed via the buttonColor/textColor props at the call site
    // (theme.colors.error / onError) instead of a hardcoded literal.
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 64,
  },
  createFolderFab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 140,
  },
  flatListContent: {
    paddingBottom: 80,
  },
});
