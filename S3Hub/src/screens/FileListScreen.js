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
import { AuthContext } from "../context/AuthContext";
import { listObjects, getSignedUrl, uploadFile } from "../services/s3Service";
import { FAB, Button, Checkbox, IconButton } from 'react-native-paper';
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';


export default function FileListScreen() {
  const { currentConnection, currentBucket } = useContext(AuthContext);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [modalImageInfo, setModalImageInfo] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' o 'list'
  const [currentPath, setCurrentPath] = useState(''); // Para navegación de carpetas
  const isMounted = useRef(true); // Para evitar actualizaciones de estado en componentes desmontados

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
            const isImage = key.match(/\.(jpg|jpeg|png|gif)$/i);
            if (isImage) {
              const fileItem = {
                id: key,
                key: key,
                name: relativeKey,
                size: object.Size,
                isFolder: false,
                url: null, // Inicialmente null
              };
              // Agregamos la promesa para obtener la URL firmada
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
        </TouchableOpacity>
      );
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
    setCurrentPath(folder.key);
    setSelectedFiles([]); // Deseleccionar archivos al cambiar de carpeta
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
      // Abrir imagen y mostrar información
      const file = files.find((f) => f.id === id);
      if (file) {
        setModalImageUrl(file.url);
        setModalImageInfo({
          name: file.name,
          size: file.size,
        });
        setIsModalVisible(true);
      }
    }
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
      });
  
      if (result.canceled === false && result.assets.length > 0) {
        const asset = result.assets[0];
  
        const fileUri = asset.uri;
        const fileName = asset.name;
        const mimeType = asset.mimeType || "application/octet-stream";
  
        // Read the file using fetch
        const response = await fetch(fileUri);
        const blob = await response.blob();
  
        const key = currentPath + fileName;
  
        await uploadFile(currentConnection, currentBucket, {
          name: key,
          content: blob,
          mimeType: mimeType,
        });
  
        Alert.alert("Éxito", "Archivo subido exitosamente.");
        fetchFiles(); // Update the file list
      }
    } catch (error) {
      console.error("Error al subir el archivo:", error);
      Alert.alert("Error", "Error al subir el archivo.");
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

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
                  setModalImageUrl(file.url);
                  setModalImageInfo({
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
        <TouchableOpacity
          style={styles.modalContainer}
          onPress={() => setIsModalVisible(false)}
        >
          <RNImage
            source={{ uri: modalImageUrl }}
            style={styles.fullImage}
            resizeMode="contain"
          />
          {modalImageInfo && (
            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>Nombre: {modalImageInfo.name}</Text>
              <Text style={styles.infoText}>Tamaño: {(modalImageInfo.size / (1024 * 1024)).toFixed(2)} MB</Text>
            </View>
          )}
        </TouchableOpacity>
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
  infoButton: {
    flex: 1,
    marginHorizontal: 8,
  },
  itemContainer: {
    position: 'relative',
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
    bottom: 64, // Ajuste para el menú inferior
  },
  flatListContent: {
    paddingBottom: 80, // Espacio para el menú inferior
  },
});
