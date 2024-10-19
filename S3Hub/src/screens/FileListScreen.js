import React, { useEffect, useState, useContext, useRef } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Dimensions,
  Modal,
  Image as RNImage,
  Text,
} from "react-native";
import { Video } from 'expo-av';
import { AuthContext } from "../context/AuthContext";
import { listObjects, getSignedUrl, deleteFile, deleteFiles, getPresignedUploadUrl, uploadEmptyFolder } from "../services/s3Service";
import { FAB, Button, Checkbox, IconButton, Dialog, Portal, TextInput, useTheme } from 'react-native-paper';
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import UploadProgressPopup from '../components/UploadProgressPopup';
import i18n from '../locales/translations';

export default function FileListScreen() {
  const { currentConnection, currentBucket } = useContext(AuthContext);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [currentPath, setCurrentPath] = useState('');
  const isMounted = useRef(true); // Avoid state updates on unmounted components
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const flatListRef = useRef(null);
  const theme = useTheme(); // Access the theme

  useEffect(() => {
    isMounted.current = true;

    const fetchData = async () => {
      if (currentConnection && currentBucket) {
        setLoading(true);
        await fetchFiles();
        // Deselect files when changing connection, bucket, or folder
        setSelectedFiles([]);
      } else {
        // Clear files if the connection or bucket is not valid
        setFiles([]);
        setMediaFiles([]);
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted.current = false;
    };
  }, [currentConnection, currentBucket, currentPath]);

  const fetchFiles = async () => {
    try {
      // Re-verify that currentConnection and currentBucket are valid
      if (!currentConnection || !currentBucket) {
        setLoading(false);
        return;
      }

      const response = await listObjects(
        currentConnection,
        currentBucket,
        currentPath
      );

      if (!isMounted.current) {
        return; // The component has unmounted, cancel state update
      }

      let items = [];
      if (response.Contents) {
        const directories = new Set();
        const filePromises = [];

        response.Contents.forEach(object => {
          const key = object.Key;

          // Remove the 'currentPath' prefix from the key to get the relative path
          const relativeKey = key.substring(currentPath.length);

          // Ignore the 'currentPath' itself
          if (relativeKey === '') return;

          // Check if it is a directory or a file
          const index = relativeKey.indexOf('/');
          if (index !== -1) {
            // It is a directory
            const dirName = relativeKey.substring(0, index);
            directories.add(dirName);
          } else {
            // It is a file
            const isMedia = key.match(/\.(jpg|jpeg|png|gif|mp4|mov|avi|mkv)$/i);
            if (isMedia) {
              const isVideo = key.match(/\.(mp4|mov|avi|mkv)$/i) ? true : false;
              const fileItem = {
                id: key,
                key: key,
                name: relativeKey,
                size: object.Size,
                isFolder: false,
                isVideo: isVideo,
                url: null,
              };
              // Get the signed URL
              filePromises.push(
                getSignedUrl(currentConnection, currentBucket, key)
                  .then(url => {
                    fileItem.url = url;
                  })
                  .catch(error => {
                    console.error("Error getting the signed URL:", error);
                  })
              );
              items.push(fileItem);
            }
          }
        });

        // Add folders to the list
        directories.forEach(dir => {
          items.push({
            id: currentPath + dir + '/',
            key: currentPath + dir + '/',
            name: dir,
            isFolder: true,
          });
        });

        // Wait for all signed URLs to be obtained
        await Promise.all(filePromises);

        // Sort folders first
        items.sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        });
      }

      if (isMounted.current) {
        setFiles(items);
        setMediaFiles(items.filter(f => !f.isFolder));
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching the file list:", error);
      if (isMounted.current) {
        Alert.alert(i18n.t('error'), i18n.t('error'));
        setLoading(false);
      }
    }
  };

  const numColumns = viewMode === 'grid' ? 2 : 1;
  const itemSize = Dimensions.get('window').width / numColumns;

  const renderItem = ({ item }) => {
    const isSelected = selectedFiles.includes(item.id);

    if (item.isFolder) {
      // Render folder
      return (
        <TouchableOpacity
          onPress={() => handleFolderPress(item)}
          onLongPress={() => toggleSelection(item.id)}
          style={[
            viewMode === 'grid' ? styles.itemContainer : styles.listItemContainer,
            {
              width: viewMode === 'grid' ? itemSize - 16 : '100%',
              height: viewMode === 'grid' ? itemSize - 16 : 60,
              margin: 8,
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: viewMode === 'grid' ? 'column' : 'row',
            },
          ]}
        >
          <IconButton icon="folder" size={50} />
          <Text>{item.name}</Text>
          {isSelected && (
            <View style={styles.checkboxContainer}>
              <Checkbox
                status="checked"
                style={styles.checkbox}
              />
            </View>
          )}
        </TouchableOpacity>
      );
    }
    if (item.isVideo) {
      // Grid view
      if (viewMode === 'grid') {
        return (
          <TouchableOpacity
            onPress={() => handleItemPress(item.id)}
            onLongPress={() => toggleSelection(item.id)}
            style={[
              styles.itemContainer,
              {
                width: itemSize - 16,
                height: itemSize - 16,
                margin: 8,
              },
            ]}
          >
            {item.url ? (
              <View style={styles.videoContainer}>
                <Video
                  source={{ uri: item.url }}
                  style={styles.videoThumbnail}
                  resizeMode="cover"
                  isMuted
                />
                <View style={styles.playIconContainer}>
                  <IconButton icon="play-circle-outline" size={50} color="#fff" />
                </View>
              </View>
            ) : (
              <ActivityIndicator style={{ flex: 1 }} />
            )}
            {isSelected && (
              <View style={styles.checkboxContainer}>
                <Checkbox
                  status="checked"
                  style={styles.checkbox}
                />
              </View>
            )}
          </TouchableOpacity>
        );
      } else {
        // List view
        return (
          <TouchableOpacity
            onPress={() => handleItemPress(item.id)}
            onLongPress={() => toggleSelection(item.id)}
            style={styles.listItemContainer}
          >
            {item.url ? (
              <View style={styles.listVideoContainer}>
                <Video
                  source={{ uri: item.url }}
                  style={styles.listVideo}
                  resizeMode="cover"
                  isMuted
                />
                <View style={styles.playIconContainerList}>
                  <IconButton icon="play-circle-outline" size={30} color="#fff" />
                </View>
              </View>
            ) : (
              <ActivityIndicator style={styles.listVideo} />
            )}
            <View style={styles.listTextContainer}>
              <Text style={styles.listText}>{item.name}</Text>
              <Text style={styles.listSubText}>{(item.size / (1024 * 1024)).toFixed(2)} MB</Text>
            </View>
            {isSelected && (
              <Checkbox
                status="checked"
                style={styles.listCheckbox}
              />
            )}
          </TouchableOpacity>
        );
      }
    } else {
      // Render file
      if (viewMode === 'grid') {
        return (
          <TouchableOpacity
            onPress={() => handleItemPress(item.id)}
            onLongPress={() => toggleSelection(item.id)}
            style={[
              styles.itemContainer,
              {
                width: itemSize - 16,
                height: itemSize - 16,
                margin: 8,
              },
            ]}
          >
            {item.url ? (
              <RNImage
                style={[
                  styles.image,
                  {
                    width: '100%',
                    height: '100%',
                    opacity: isSelected ? 0.5 : 1,
                    borderRadius: 10,
                  },
                ]}
                source={{ uri: item.url }}
                resizeMode="cover"
              />
            ) : (
              <ActivityIndicator style={{ flex: 1 }} />
            )}
            {isSelected && (
              <View style={styles.checkboxContainer}>
                <Checkbox
                  status="checked"
                  style={styles.checkbox}
                />
              </View>
            )}
          </TouchableOpacity>
        );
      } else {
        // List view
        return (
          <TouchableOpacity
            onPress={() => handleItemPress(item.id)}
            onLongPress={() => toggleSelection(item.id)}
            style={styles.listItemContainer}
          >
            {item.url ? (
              <RNImage
                style={styles.listImage}
                source={{ uri: item.url, cache: 'force-cache' }}
                resizeMode="cover"
              />
            ) : (
              <ActivityIndicator style={styles.listImage} />
            )}
            <View style={styles.listTextContainer}>
              <Text style={styles.listText}>{item.name}</Text>
              <Text style={styles.listSubText}>{(item.size / (1024 * 1024)).toFixed(2)} MB</Text>
            </View>
            {isSelected && (
              <Checkbox
                status="checked"
                style={styles.listCheckbox}
              />
            )}
          </TouchableOpacity>
        );
      }
    }
  };

  const handleFolderPress = (folder) => {
    if (selectedFiles.length > 0) {
      // If in selection mode, toggle selection
      toggleSelection(folder.id);
    }
    else {
      setCurrentPath(currentPath + folder.name + '/');
      setSelectedFiles([]); // Deselect files when changing folder
    }
  };

  const toggleSelection = (id) => {
    setSelectedFiles((prevSelected) => {
      if (prevSelected.includes(id)) {
        return prevSelected.filter((fileId) => fileId !== id);
      } else {
        return [...prevSelected, id];
      }
    });
  };

  const handleItemPress = (id) => {
    if (selectedFiles.length > 0) {
      toggleSelection(id);
    } else {
      const mediaIndex = mediaFiles.findIndex(f => f.id === id);
      if (mediaIndex !== -1) {
        setCurrentMediaIndex(mediaIndex);
        setIsModalVisible(true);
      }
    }
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
  
      if (result.canceled === false && result.assets.length > 0) {
        const totalFiles = result.assets.length;
        let uploadedFiles = 0;
  
        setIsUploading(true);
  
        await Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t('uploadProgress'),
            body: i18n.t('uploadSuccess'),
          },
          trigger: null,
        });
  
        for (const asset of result.assets) {
          const fileUri = asset.uri;
          const fileName = asset.name;
          const mimeType = asset.mimeType || 'application/octet-stream';
  
          const key = currentPath + fileName;
  
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
  
        setIsUploading(false);
        setUploadProgress(1);
        Alert.alert(i18n.t('success'), i18n.t('uploadSuccess'));
        fetchFiles();
  
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
        const file = files.find((f) => f.id === fileId);
        if (file.isFolder) {
          await downloadFolder(file.key);
        } else {
          await downloadFile(file);
        }
      }
      Alert.alert(i18n.t('success'), i18n.t('downloadSuccess'));
      setSelectedFiles([]);
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
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      // Select all
      const allFileIds = files.map(file => file.id);
      setSelectedFiles(allFileIds);
    }
  };

  const handleSwitchView = () => {
    setViewMode(viewMode === 'grid' ? 'list' : 'grid');
  };

  const handleGoBack = () => {
    if (currentPath) {
      const paths = currentPath.split('/').filter(p => p !== '');
      paths.pop();
      setCurrentPath(paths.length > 0 ? paths.join('/') + '/' : '');
    }
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
        const file = files.find((f) => f.id === fileId);
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
  
      setIsDeleting(false);
      setDeleteProgress(1);
      Alert.alert(i18n.t('success'), i18n.t('deleteSuccess'));
      setSelectedFiles([]);
      fetchFiles();
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
      fetchFiles();
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
  
      const localUri = FileSystem.cacheDirectory + currentMedia.name;
      const downloadObject = FileSystem.createDownloadResumable(
        currentMedia.url,
        localUri
      );
      const response = await downloadObject.downloadAsync();
  
      if (response && response.status === 200) {
        await Sharing.shareAsync(response.uri);
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
  
      const uri = currentMedia.url;
      const fileName = currentMedia.name;
      const fileUri = FileSystem.documentDirectory + fileName;
  
      const downloadObject = FileSystem.createDownloadResumable(uri, fileUri);
      const response = await downloadObject.downloadAsync();
  
      await MediaLibrary.saveToLibraryAsync(response.uri);
  
      Alert.alert(i18n.t('success'), i18n.t('downloadSuccess'));
    } catch (error) {
      console.error(i18n.t('error'), error);
      Alert.alert(i18n.t('error'), i18n.t('downloadError'));
    }
  };  

  useEffect(() => {
    if (isModalVisible && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index: currentMediaIndex, animated: false });
    }
  }, [isModalVisible, currentMediaIndex]);

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
        <UploadProgressPopup progress={isUploading ? uploadProgress : deleteProgress}
        operation={isUploading ? i18n.t('uploadProgress') : i18n.t('deleteProgress')} 
        />
      )}
      <Text style={styles.title}>{i18n.t('filesIn')} {currentBucket}</Text>

      <View style={styles.actionContainer}>
        {currentPath ? (
          <IconButton
            icon="arrow-left"
            onPress={handleGoBack}
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

      <FlatList
        data={files}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={numColumns}
        key={viewMode}
        contentContainerStyle={styles.flatListContent}
      />

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
      {isModalVisible && mediaFiles.length > 0 && (
        <Modal
          visible={isModalVisible}
          transparent={true}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <IconButton
                icon="close"
                iconColor="white"
                size={24}
                onPress={() => setIsModalVisible(false)}
                style={styles.modalCloseButton}
                accessibilityLabel={i18n.t('close')}
              />
              <View style={styles.modalRightButtons}>
                <IconButton
                  icon="download"
                  iconColor="white"
                  size={24}
                  onPress={handleModalDownload}
                  style={styles.modalDownloadButton}
                  accessibilityLabel={i18n.t('download')}
                />
                <IconButton
                  icon="share-variant"
                  iconColor="white"
                  size={24}
                  onPress={handleModalShare}
                  style={styles.modalShareButton}
                  accessibilityLabel={i18n.t('share')}
                />
              </View>
            </View>

            {/* FlatList to Display Media */}
            <FlatList
              ref={flatListRef}
              data={mediaFiles}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              initialScrollIndex={currentMediaIndex}
              getItemLayout={(data, index) => (
                {length: Dimensions.get('window').width, offset: Dimensions.get('window').width * index, index}
              )}
              renderItem={({ item }) => (
                <View style={styles.modalMediaContainer}>
                  {item.isVideo ? (
                    <Video
                      source={{ uri: item.url }}
                      rate={1.0}
                      volume={1.0}
                      isMuted={false}
                      resizeMode="contain"
                      shouldPlay={true} // Autoplay activated
                      useNativeControls={true}
                      style={styles.fullMedia}
                    />
                  ) : (
                    <RNImage
                      source={{ uri: item.url }}
                      style={styles.fullMedia}
                      resizeMode="contain"
                    />
                  )}
                </View>
              )}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(
                  event.nativeEvent.contentOffset.x / Dimensions.get('window').width
                );
                setCurrentMediaIndex(index);
              }}
              style={{ flex: 1 }}
            />
            
            {mediaFiles[currentMediaIndex] && (
              <View style={[styles.infoContainer, { backgroundColor: theme.colors.accent }]}>
                <Text style={styles.infoText}>{i18n.t('fileName')}: {mediaFiles[currentMediaIndex].name}</Text>
                <Text style={styles.infoText}>
                  {i18n.t('fileSize')}: {(mediaFiles[currentMediaIndex].size / (1024 * 1024)).toFixed(2)} MB
                </Text>
              </View>
            )}
          </View>
        </Modal>
      )}
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
  itemContainer: {
    position: 'relative',
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  playIconContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -25 }, { translateY: -25 }],
  },
  listVideoContainer: {
    width: 50,
    height: 50,
    position: 'relative',
    marginRight: 8,
  },
  listVideo: {
    width: '100%',
    height: '100%',
    borderRadius: 5,
  },
  playIconContainerList: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -15 }, { translateY: -15 }],
  },
  image: {
    borderWidth: 1,
    borderColor: '#ccc',
  },
  listItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  listImage: {
    width: 50,
    height: 50,
    borderRadius: 5,
    marginRight: 8,
  },
  listTextContainer: {
    flex: 1,
  },
  listText: {
    fontSize: 16,
  },
  listSubText: {
    fontSize: 12,
    color: '#666',
  },
  listCheckbox: {
    marginLeft: 8,
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
  checkboxContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  checkbox: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  modalHeader: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 8,
    borderRadius: 8,
  },
  modalCloseButton: {
  },
  modalRightButtons: {
    flexDirection: 'row',
  },
  modalDownloadButton: {
    marginRight: 16,
  },
  modalShareButton: {},
  fullMedia: {
    width: Dimensions.get('window').width * 0.9,
    height: Dimensions.get('window').height * 0.6,
  },
  modalMediaContainer: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 16,
    borderRadius: 8,
  },
  infoText: {
    color: 'white',
    fontSize: 16,
    marginBottom: 8,
  },
});
