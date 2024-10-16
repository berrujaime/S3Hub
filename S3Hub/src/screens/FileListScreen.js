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
import { Image } from "expo-image";
import { Video } from 'expo-av';
import { AuthContext } from "../context/AuthContext";
import { listObjects, getSignedUrl, uploadFile, deleteFile, deleteFiles, getPresignedUploadUrl, uploadEmptyFolder } from "../services/s3Service";
import { FAB, Button, Checkbox, IconButton } from 'react-native-paper';
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { ProgressBar, Dialog, Portal, TextInput } from 'react-native-paper';
import UploadProgressPopup from '../components/UploadProgressPopup';


export default function FileListScreen() {
  const { currentConnection, currentBucket } = useContext(AuthContext);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalMediaUrl, setModalMediaUrl] = useState('');
  const [modalMediaInfo, setModalMediaInfo] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [currentPath, setCurrentPath] = useState('');
  const isMounted = useRef(true); // Avoid state updates on unmounted components
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');


  useEffect(() => {
    isMounted.current = true;

    const fetchData = async () => {
      if (currentConnection && currentBucket) {
        setLoading(true);
        await fetchFiles();
        // Deseleccionar archivos al cambiar de conexión, bucket o carpeta
        setSelectedFiles([]);
      } else {
        // Limpiar archivos si la conexión o el bucket no son válidos
        setFiles([]);
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      // Función de limpieza para establecer isMounted en false
      isMounted.current = false;
    };
  }, [currentConnection, currentBucket, currentPath]);

  const fetchFiles = async () => {
    try {
      // Verificar nuevamente que currentConnection y currentBucket son válidos
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
        return; // El componente se desmontó, cancelar actualización de estado
      }

      let items = [];
      if (response.Contents) {
        const directories = new Set();
        const filePromises = [];

        response.Contents.forEach(object => {
          const key = object.Key;

          // Eliminar el prefijo 'currentPath' de la key para obtener el path relativo
          const relativeKey = key.substring(currentPath.length);

          // Ignorar el propio 'currentPath'
          if (relativeKey === '') return;

          // Verificar si es un directorio o un archivo
          const index = relativeKey.indexOf('/');
          if (index !== -1) {
            // Es un directorio
            const dirName = relativeKey.substring(0, index);
            directories.add(dirName);
          } else {
            // Es un archivo
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
                url: null, // Inicialmente null
              };
              // Obtener la URL firmada
              filePromises.push(
                getSignedUrl(currentConnection, currentBucket, key)
                  .then(url => {
                    fileItem.url = url;
                  })
                  .catch(error => {
                    console.error("Error al obtener la URL firmada:", error);
                  })
              );
              items.push(fileItem);
            }
          }
        });

        // Agregar carpetas a la lista
        directories.forEach(dir => {
          items.push({
            id: currentPath + dir + '/',
            key: currentPath + dir + '/',
            name: dir,
            isFolder: true,
          });
        });

        // Esperar a que se obtengan todas las URLs firmadas
        await Promise.all(filePromises);

        // Ordenar carpetas primero
        items.sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        });
      }

      if (isMounted.current) {
        setFiles(items);
        setLoading(false);
      }
    } catch (error) {
      console.error("Error al obtener la lista de archivos:", error);
      if (isMounted.current) {
        Alert.alert("Error", "Error al obtener la lista de archivos.");
        setLoading(false);
      }
    }
  };

  const numColumns = viewMode === 'grid' ? 2 : 1;
  const itemSize = Dimensions.get('window').width / numColumns;

  const renderItem = ({ item }) => {
    const isSelected = selectedFiles.includes(item.id);

    if (item.isFolder) {
      // Renderizar carpeta
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
      // Vista en cuadrícula
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
        // Vista en lista
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
      // Renderizar archivo
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
              <Image
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
                contentFit="cover"
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
        // Vista de lista
        return (
          <TouchableOpacity
            onPress={() => handleItemPress(item.id)}
            onLongPress={() => toggleSelection(item.id)}
            style={styles.listItemContainer}
          >
            {item.url ? (
              <Image
                style={styles.listImage}
                source={{ uri: item.url }}
                contentFit="cover"
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
      // Si estamos en modo selección, alternar selección
      toggleSelection(folder.id);
    }
    else {
      setCurrentPath(currentPath + folder.name + '/');
      setSelectedFiles([]); // Deseleccionar archivos al cambiar de carpeta
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
      const file = files.find((f) => f.id === id);
      if (file) {
        setModalMediaUrl(file.url);
        setModalMediaInfo({
          name: file.name,
          size: file.size,
          isVideo: file.isVideo,
        });
        setIsModalVisible(true);
      }
    }
  };  

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true, // Permitir selección múltiple
        copyToCacheDirectory: true,
      });
  
      if (result.canceled === false && result.assets.length > 0) {
        const totalFiles = result.assets.length;
        let uploadedFiles = 0;
  
        setIsUploading(true); // Mostrar el popup de progreso
  
        // Enviar notificación al inicio de la subida
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Subida de Archivos',
            body: 'La subida de archivos ha comenzado.',
          },
          trigger: null,
        });
  
        for (const asset of result.assets) {
          const fileUri = asset.uri;
          const fileName = asset.name;
          const mimeType = asset.mimeType || 'application/octet-stream';
  
          const key = currentPath + fileName;
  
          // Obtener la URL firmada para subir
          const uploadUrl = await getPresignedUploadUrl(currentConnection, currentBucket, key, mimeType);
  
          // Subir el archivo usando uploadAsync para permitir subida en segundo plano
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
  
        setIsUploading(false); // Ocultar el popup de progreso
        setUploadProgress(1);
        Alert.alert('Éxito', 'Archivos subidos exitosamente.');
        fetchFiles(); // Actualizar la lista de archivos
  
        // Enviar notificación al finalizar la subida
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Subida de Archivos',
            body: 'La subida de archivos ha finalizado.',
          },
          trigger: null,
        });
      }
    } catch (error) {
      console.error('Error al subir los archivos:', error);
      setIsUploading(false);
      Alert.alert('Error', 'Error al subir los archivos.');
    }
  };
  
  const handleDownloadSelected = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permiso denegado", "No se puede acceder al almacenamiento.");
        return;
      }

      for (const fileId of selectedFiles) {
        const file = files.find((f) => f.id === fileId);
        if (file.isFolder) {
          // Descargar carpeta
          await downloadFolder(file.key);
        } else {
          // Descargar archivo
          await downloadFile(file);
        }
      }
      Alert.alert("Éxito", "Descarga completada.");
      setSelectedFiles([]);
    } catch (error) {
      console.error("Error al descargar los archivos:", error);
      Alert.alert("Error", "No se pudieron descargar los archivos.");
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

      // Guardar en la galería
      await MediaLibrary.saveToLibraryAsync(response.uri);
    } catch (error) {
      console.error("Error al descargar el archivo:", error);
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
            // Es un archivo
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
      console.error("Error al descargar la carpeta:", error);
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
          'Confirmar borrado',
          `¿Estás seguro de que deseas borrar ${selectedFiles.length} elemento(s)?`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Borrar', style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });
  
      if (!confirm) return;
  
      for (const fileId of selectedFiles) {
        const file = files.find((f) => f.id === fileId);
        if (file.isFolder) {
          // Obtener todos los objetos dentro de la carpeta
          const response = await listObjects(currentConnection, currentBucket, file.key);
          if (response.Contents && response.Contents.length > 0) {
            const objects = response.Contents.map((obj) => ({ Key: obj.Key }));
            // Eliminar objetos en lotes de 1000
            const chunkSize = 1000;
            for (let i = 0; i < objects.length; i += chunkSize) {
              const chunk = objects.slice(i, i + chunkSize);
              await deleteFiles(currentConnection, currentBucket, chunk);
            }
          }
        } else {
          await deleteFile(currentConnection, currentBucket, file.key);
        }
      }
  
      Alert.alert('Éxito', 'Elemento(s) borrado(s) exitosamente.');
      setSelectedFiles([]);
      fetchFiles(); // Actualizar la lista de archivos
    } catch (error) {
      console.error('Error al borrar los elementos:', error);
      Alert.alert('Error', 'No se pudieron borrar los elementos.');
    }
  };  

  const handleCreateFolder = async () => {
    if (newFolderName.trim() === '') {
      Alert.alert('Error', 'El nombre de la carpeta no puede estar vacío.');
      return;
    }
  
    const folderKey = currentPath + newFolderName.trim() + '/';
  
    try {
      await uploadEmptyFolder(currentConnection, currentBucket, folderKey);
      setIsDialogVisible(false);
      setNewFolderName('');
      fetchFiles(); // Actualizar la lista de archivos
      Alert.alert('Éxito', 'Carpeta creada exitosamente.');
    } catch (error) {
      console.error('Error al crear la carpeta:', error);
      Alert.alert('Error', 'No se pudo crear la carpeta.');
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
      {isUploading && (
        <UploadProgressPopup progress={uploadProgress} />
      )}
      <Text style={styles.title}>Archivos en {currentBucket}</Text>

      <View style={styles.actionContainer}>
        {currentPath ? (
          <IconButton
            icon="arrow-left"
            onPress={handleGoBack}
            style={styles.goBackButton}
          />
        ) : null}
        <IconButton
          icon={viewMode === 'grid' ? 'view-list' : 'view-grid'}
          onPress={handleSwitchView}
          style={styles.viewToggleButton}
        />
        <IconButton
          icon="select-all"
          onPress={handleSelectAll}
          style={styles.selectAllButton}
        />
      </View>

      {selectedFiles.length > 0 && (
        <View style={styles.selectionActionContainer}>
        {selectedFiles.length === 1 ? (
          <Button
            mode="contained"
            onPress={() => {
              const file = files.find((f) => f.id === selectedFiles[0]);
              if (file && !file.isFolder) {
                setModalMediaUrl(file.url);
                setModalMediaInfo({
                  name: file.name,
                  size: file.size,
                });
                setIsModalVisible(true);
              }
            }}
            style={styles.infoButton}
          >
            Ver Información
          </Button>
        ) : null}
        <Button
          mode="contained"
          onPress={handleDownloadSelected}
          style={styles.downloadButton}
        >
          Descargar
        </Button>
        <Button
          mode="contained"
          onPress={handleDeleteSelected}
          style={styles.deleteButton}
        >
          Borrar
        </Button>
      </View>
      )}

      <FlatList
        data={files}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={numColumns}
        key={viewMode} // Forzar redibujado al cambiar de vista
        contentContainerStyle={styles.flatListContent}
      />

      <FAB
        style={styles.createFolderFab}
        icon="folder-plus"
        onPress={() => setIsDialogVisible(true)}
      />

      <Portal>
        <Dialog visible={isDialogVisible} onDismiss={() => setIsDialogVisible(false)}>
          <Dialog.Title>Crear Nueva Carpeta</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Nombre de la Carpeta"
              value={newFolderName}
              onChangeText={setNewFolderName}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsDialogVisible(false)}>Cancelar</Button>
            <Button onPress={handleCreateFolder}>Crear</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <FAB
        style={styles.fab}
        icon="upload"
        onPress={handleUpload}
      />

      {/* Modal para mostrar la imagen completa y la información */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          {modalMediaInfo && modalMediaInfo.isVideo ? (
            <Video
              source={{ uri: modalMediaUrl }}
              rate={1.0}
              volume={1.0}
              isMuted={false}
              resizeMode="contain"
              shouldPlay
              useNativeControls
              style={styles.fullMedia}
            />
          ) : modalMediaInfo ? (
            <RNImage
              source={{ uri: modalMediaUrl }}
              style={styles.fullMedia}
              resizeMode="contain"
            />
          ) : null}
          {modalMediaInfo && (
            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>Nombre: {modalMediaInfo.name}</Text>
              <Text style={styles.infoText}>Tamaño: {(modalMediaInfo.size / (1024 * 1024)).toFixed(2)} MB</Text>
            </View>
          )}
          <Button onPress={() => setIsModalVisible(false)} style={styles.closeButton}>Cerrar</Button>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 40, // Espacio superior
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
  infoButton: {
    flex: 1,
    marginHorizontal: 8,
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
    transform: [{ translateX: -40 }, { translateY: -40 }],
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
  fullMedia: {
    width: '100%',
    height: '80%',
  },
  closeButton: {
    marginTop: 16,
  },  
  image: {
    borderWidth: 1,
    borderColor: '#ccc',
  },
  checkboxContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  checkbox: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
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
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
  infoContainer: {
    marginTop: 16,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    width: '100%',
  },
  infoText: {
    fontSize: 16,
    marginBottom: 8,
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
