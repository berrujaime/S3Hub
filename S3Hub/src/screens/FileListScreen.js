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
import { listObjects, getSignedUrl, deleteFile, deleteFiles, getPresignedUploadUrl, uploadEmptyFolder } from "../services/s3Service";
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
import useFileList from '../hooks/useFileList';
import useFileSelection from '../hooks/useFileSelection';

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
            console.error("Error loading media URL on demand:", error);
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

      if (result.type !== 'cancel' && result.assets.length > 0) {
        const totalFiles = result.assets.length;
        let uploadedFiles = 0;

        setIsUploading(true);
        setUploadProgress(0);

        for (const asset of result.assets) {
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
          const progress = uploadedFiles / totalFiles;
          setUploadProgress(progress);
        }

        // After all uploads are complete, refetch the file list to ensure synchronization
        await fetchFiles();

        setIsUploading(false);
        setUploadProgress(1);
        Alert.alert(i18n.t('success'), i18n.t('uploadSuccess'));

        // Send notification upon completion of the upload
        await Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t('upload'),
            body: i18n.t('uploadSuccess'),
          },
          trigger: null,
        });
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      setIsUploading(false);
      Alert.alert(i18n.t('error'), i18n.t('uploadError'));
    }
  };

  const handleDownloadSelected = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(i18n.t('error'), i18n.t('downloadError'));
        return;
      }

      for (const fileId of selectedFiles) {
        const file = fullFiles.find((f) => f.id === fileId);
        if (file.isFolder) {
          await downloadFolder(file.key);
        } else {
          await downloadFile(file);
        }
      }
      Alert.alert(i18n.t('success'), i18n.t('downloadSuccess'));
      clearSelection();
    } catch (error) {
      console.error("Error downloading files:", error);
      Alert.alert(i18n.t('error'), i18n.t('downloadError'));
    }
  };

  const downloadFile = async (file) => {
    try {
      const uri = file.url;
      const fileName = file.name;
      const fileUri = FileSystem.documentDirectory + fileName;

      // Ensure directory exists before downloading
      await ensureDirectoryExists(fileUri);

      const downloadObject = FileSystem.createDownloadResumable(
        uri,
        fileUri
      );
      const response = await downloadObject.downloadAsync();

      // Save to gallery
      await MediaLibrary.saveToLibraryAsync(response.uri);
    } catch (error) {
      console.error("Error downloading file:", error);
    }
  };

  const downloadFolder = async (folderKey) => {
    try {
      const response = await listObjects(
        currentConnection,
        currentBucket,
        folderKey
      );

      if (response.Contents) {
        for (const object of response.Contents) {
          const key = object.Key;
          if (!key.endsWith('/')) {
            // It is a file
            const url = await getSignedUrl(currentConnection, currentBucket, key);
            const fileName = key.substring(key.lastIndexOf('/') + 1);
            const file = {
              url: url,
              name: fileName,
            };
            await downloadFile(file);
          }
        }
      }
    } catch (error) {
      console.error("Error downloading folder:", error);
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
      let deletedItems = 0;
      setIsDeleting(true);
      setDeleteProgress(0);

      for (const fileId of selectedFiles) {
        const file = fullFiles.find((f) => f.id === fileId);
        if (file.isFolder) {
          // Get all objects within the folder
          const response = await listObjects(currentConnection, currentBucket, file.key);
          if (response.Contents && response.Contents.length > 0) {
            const objects = response.Contents.map((obj) => ({ Key: obj.Key }));

            // Delete objects in batches of 1000
            const chunkSize = 1000;
            for (let i = 0; i < objects.length; i += chunkSize) {
              const chunk = objects.slice(i, i + chunkSize);
              await deleteFiles(currentConnection, currentBucket, chunk);
            }
          }
        } else {
          await deleteFile(currentConnection, currentBucket, file.key);
        }
        deletedItems += 1;
        const progress = deletedItems / totalItems;
        setDeleteProgress(progress);
      }

      // **Clear the cache for the current path to ensure fetchFiles retrieves fresh data**
      // Fetch the updated file list from the server
      await refreshAfterMutation();

      setIsDeleting(false);
      setDeleteProgress(1);
      Alert.alert(i18n.t('success'), i18n.t('deleteSuccess'));
      clearSelection();
    } catch (error) {
      console.error('Error deleting items:', error);
      setIsDeleting(false);
      Alert.alert(i18n.t('error'), i18n.t('deleteError'));
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

      // Update local state and cache incrementally
      const newFolder = {
        id: folderKey, // Unique identifier for folder
        key: folderKey,
        name: newFolderName.trim(),
        isFolder: true,
      };
      addFolderOptimistic(newFolder);

      Alert.alert(i18n.t('success'), i18n.t('folderCreated'));
    } catch (error) {
      console.error('Error creating folder:', error);
      Alert.alert(i18n.t('error'), i18n.t('folderError'));
    }
  };

  const handleModalShare = async () => {
    try {
      const currentMedia = mediaFiles[currentMediaIndex];
      if (!currentMedia) return;

      const localUri = await getCachedFileUri(currentMedia.key, currentMedia.url);

      if (localUri) {
        await Sharing.shareAsync(localUri);
      } else {
        Alert.alert(i18n.t('error'), i18n.t('downloadError'));
      }
    } catch (error) {
      console.error('Error sharing file:', error);
      Alert.alert(i18n.t('error'), i18n.t('downloadError'));
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

      const localUri = await getCachedFileUri(currentMedia.key, currentMedia.url);

      await MediaLibrary.saveToLibraryAsync(localUri);

      Alert.alert(i18n.t('success'), i18n.t('downloadSuccess'));
    } catch (error) {
      console.error('Error downloading file:', error);
      Alert.alert(i18n.t('error'), i18n.t('downloadError'));
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

      if (currentMedia.isFolder) {
        // Obtain and delete all objects within the folder
        const response = await listObjects(currentConnection, currentBucket, currentMedia.key);
        if (response.Contents && response.Contents.length > 0) {
          const objects = response.Contents.map((obj) => ({ Key: obj.Key }));

          // Delete objects in batches of 1000
          const chunkSize = 1000;
          for (let i = 0; i < objects.length; i += chunkSize) {
            const chunk = objects.slice(i, i + chunkSize);
            await deleteFiles(currentConnection, currentBucket, chunk);
          }
        }
      } else {
        await deleteFile(currentConnection, currentBucket, currentMedia.key);
      }

      // Update local state and cache incrementally
      await refreshAfterMutation();

      setIsDeleting(false);
      setDeleteProgress(1);
      Alert.alert(i18n.t('success'), i18n.t('deleteSuccess'));
      setIsModalVisible(false);
    } catch (error) {
      console.error('Error deleting file:', error);
      setIsDeleting(false);
      Alert.alert(i18n.t('error'), i18n.t('deleteError'));
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
          accessibilityLabel={viewMode === 'grid' ? i18n.t('listView') : 'gridView'}
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
