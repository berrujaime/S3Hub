import React, { useEffect, useState, useContext } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Text,
  useWindowDimensions,
} from "react-native";
import { AuthContext } from "../context/AuthContext";
import {
  getSignedUrl,
  deleteFile,
  deleteFolderRecursive,
  listAllUnderPrefix,
  getPresignedUploadUrl,
  uploadEmptyFolder,
} from "../services/s3Service";
import { FAB, Button, IconButton, Dialog, Portal, TextInput, Searchbar, useTheme } from 'react-native-paper';
import * as DocumentPicker from "expo-document-picker";
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

// Cache namespace derived from the ITEM's own fetch-time origin (stamped in
// useFileList), never from the live connection/bucket context — during a
// bucket/connection switch the context updates one render before the items
// do, and a live-context key would file the old bucket's bytes under the
// new bucket's namespace. Returns null (callers skip the disk cache) when
// an item lacks origin fields rather than guessing a namespace.
const itemCacheKey = (item) =>
  item.connectionId && item.bucket
    ? mediaCacheKey(item.connectionId, item.bucket, item.key)
    : null;

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
  const { width } = useWindowDimensions();

  const theme = useTheme(); // Access the theme

  // Deselect files when changing connection, bucket, or folder.
  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConnection, currentBucket, currentPath]);

  const numColumns = viewMode === 'grid' ? width >= 1024 ? 4 : width >= 768 ? 3 : 2 : 1;
  const itemSize = width / numColumns;

  const handleFolderPress = (folder) => {
    if (selectedFiles.length > 0) {
      // If in selection mode, toggle selection
      toggleSelection(folder.id);
    }
    else {
      enterFolder(folder.name);
      clearSelection(); // Deselect files when changing folder
    }
  };

  const handleItemPress = async (id) => {
    if (selectedFiles.length > 0) {
      toggleSelection(id);
    } else {
      const mediaIndex = mediaFiles.findIndex(f => f.id === id);
      if (mediaIndex !== -1) {
        // If URL is not preloaded because preview is off, load it now
        if (!mediaFiles[mediaIndex].url) {
          try {
            const url = await getSignedUrl(currentConnection, currentBucket, mediaFiles[mediaIndex].key);
            setMediaFileUrl(mediaIndex, url);
          } catch (error) {
            // Log the error identity only — never the full error — since a
            // signed URL is a bearer credential.
            console.error('Error loading media URL on demand:', error?.name || error?.code, error?.message);
          }
        }
        setCurrentMediaIndex(mediaIndex);
        setIsModalVisible(true);
      }
    }
  };

  // The FlatList passes an item; route folders and media to the right handler.
  const handleItemSelect = (item) => {
    if (item.isFolder) {
      handleFolderPress(item);
    } else {
      handleItemPress(item.id);
    }
  };

  const handleItemLongPress = (item) => {
    toggleSelection(item.id);
  };

  const handleUpload = async () => {
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

        setIsUploading(true);
        setUploadProgress(0);

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
            const existingFile = fullFiles.find(f => f.key === key);
            if (existingFile) {
              const timestamp = Date.now();
              key = `${currentPath}${fileName}_${timestamp}`;
            }

            const uploadUrl = await getPresignedUploadUrl(currentConnection, currentBucket, key, mimeType);

            // Upload the file using uploadAsync to allow background upload
            await FileSystem.uploadAsync(uploadUrl, fileUri, {
              httpMethod: 'PUT',
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
              headers: {
                'Content-Type': mimeType,
              },
            });

            uploadedFiles += 1;
          } catch (error) {
            console.error('Error uploading file:', error?.name || error?.code, error?.message);
            lastError = error;
          } finally {
            processedFiles += 1;
            setUploadProgress(processedFiles / totalFiles);
          }
        }

        // After all uploads are complete, refetch the file list to ensure synchronization
        await fetchFiles();

        setIsUploading(false);
        setUploadProgress(1);

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
            i18n.t('partialUpload', { done: uploadedFiles, total: totalFiles })
          );
        } else {
          Alert.alert(i18n.t('error'), i18n.t(mapS3Error(lastError)));
        }
      }
    } catch (error) {
      console.error('Error uploading files:', error?.name || error?.code, error?.message);
      setIsUploading(false);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
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
    if (
      currentConnection &&
      matchesOrigin(file, currentConnection.id, currentBucket)
    ) {
      return getSignedUrl(currentConnection, currentBucket, file.key);
    }
    return null;
  };

  const handleDownloadSelected = async () => {
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
          console.error('Error downloading selected item:', error?.name || error?.code, error?.message);
          lastError = error;
        }
      }

      if (succeededItems === totalItems) {
        Alert.alert(i18n.t('success'), i18n.t('downloadSuccess'));
      } else if (succeededItems > 0) {
        Alert.alert(
          i18n.t('error'),
          i18n.t('partialDownload', { done: succeededItems, total: totalItems })
        );
      } else {
        Alert.alert(i18n.t('error'), i18n.t(mapS3Error(lastError)));
      }
      clearSelection();
    } catch (error) {
      console.error('Error downloading files:', error?.name || error?.code, error?.message);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
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

      const downloadObject = FileSystem.createDownloadResumable(
        uri,
        tempFileUri
      );
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
      await FileSystem.deleteAsync(tempFileUri, { idempotent: true }).catch(
        (error) => console.error("Error deleting temp download file:", error)
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
    try {
      const confirm = await new Promise((resolve) => {
        Alert.alert(
          i18n.t('delete'),
          `${i18n.t('delete')} ${selectedFiles.length} ${i18n.t('items')}`,
          [
            { text: i18n.t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: i18n.t('delete'), style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });

      if (!confirm) return;

      const totalItems = selectedFiles.length;
      let processedItems = 0;
      let succeededItems = 0;
      let lastError = null;
      setIsDeleting(true);
      setDeleteProgress(0);

      for (const fileId of selectedFiles) {
        // Per-item try/catch: one item failing to delete must skip only
        // that item and be folded into the aggregated (done/total) result,
        // never abort the rest of the batch — same rationale as the
        // per-file aggregation in handleDownloadSelected.
        try {
          const file = fullFiles.find((f) => f.id === fileId);
          if (file.isFolder) {
            const { errors: deleteErrors } = await deleteFolderRecursive(currentConnection, currentBucket, file.key);
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
          setDeleteProgress(processedItems / totalItems);
        }
      }

      // **Clear the cache for the current path to ensure fetchFiles retrieves fresh data**
      // Fetch the updated file list from the server
      await refreshAfterMutation();

      setIsDeleting(false);
      setDeleteProgress(1);
      if (succeededItems === totalItems) {
        Alert.alert(i18n.t('success'), i18n.t('deleteSuccess'));
      } else if (succeededItems > 0) {
        Alert.alert(
          i18n.t('error'),
          i18n.t('partialDelete', { done: succeededItems, total: totalItems })
        );
      } else {
        Alert.alert(i18n.t('error'), i18n.t(mapS3Error(lastError)));
      }
      clearSelection();
    } catch (error) {
      console.error('Error deleting items:', error?.name || error?.code, error?.message);
      setIsDeleting(false);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
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
        currentBucket
      );
      addFolderOptimistic(newFolder);

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
      const localUri = cacheKey
        ? await getCachedFileUri(cacheKey, currentMedia.url)
        : null;

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
      const localUri = cacheKey
        ? await getCachedFileUri(cacheKey, currentMedia.url)
        : null;
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
    try {
      const currentMedia = mediaFiles[currentMediaIndex];
      if (!currentMedia) return;

      const confirm = await new Promise((resolve) => {
        Alert.alert(
          i18n.t('delete'),
          `${i18n.t('delete')} "${currentMedia.name}"?`,
          [
            { text: i18n.t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: i18n.t('delete'), style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });

      if (!confirm) return;

      setIsDeleting(true);
      setDeleteProgress(0);

      let deleteError = null;
      if (currentMedia.isFolder) {
        const { errors: deleteErrors } = await deleteFolderRecursive(currentConnection, currentBucket, currentMedia.key);
        if (deleteErrors.length > 0) {
          // Per-object S3 delete errors carry a `Code`, not a `name` —
          // reshape so mapS3Error (which reads `.name`) can look it up.
          deleteError = { name: deleteErrors[0].Code, message: deleteErrors[0].Message };
        }
      } else {
        await deleteFile(currentConnection, currentBucket, currentMedia.key);
      }

      // Update local state and cache incrementally
      await refreshAfterMutation();

      setIsDeleting(false);
      setDeleteProgress(1);
      if (deleteError) {
        Alert.alert(i18n.t('error'), i18n.t(mapS3Error(deleteError)));
      } else {
        Alert.alert(i18n.t('success'), i18n.t('deleteSuccess'));
      }
      setIsModalVisible(false);
    } catch (error) {
      console.error('Error deleting file:', error?.name || error?.code, error?.message);
      setIsDeleting(false);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
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
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(isUploading || isDeleting) && (
        <UploadProgressPopup
          progress={isUploading ? uploadProgress : deleteProgress}
          operation={isUploading ? i18n.t('uploadProgress') : i18n.t('deleteProgress')}
        />
      )}
      <Text style={styles.title}>{i18n.t('filesIn')} {currentBucket}</Text>

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
            style={styles.downloadButton}
          >
            {i18n.t('download')}
          </Button>
          <Button
            mode="contained"
            onPress={handleDeleteSelected}
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
          onEndReached={loadMoreFiles}
          onEndReachedThreshold={0.5}
        />
      )}

      <FAB
        style={styles.createFolderFab}
        icon="folder-plus"
        onPress={() => setIsDialogVisible(true)}
        accessibilityLabel={i18n.t('createFolder')}
      />

      <Portal>
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
      </Portal>

      <FAB
        style={styles.fab}
        icon="upload"
        onPress={handleUpload}
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
    marginTop: 40,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    backgroundColor: 'red',
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
