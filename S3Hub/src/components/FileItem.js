import React from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { Checkbox, IconButton } from 'react-native-paper';
import CachedImage from './CachedImage';
import CachedVideo from './CachedVideo';

// Renders a single file-list row/cell (folder, video, or image) in either grid
// or list view. Extracted verbatim from FileListScreen's renderItem.
// The parent decides folder-vs-item behavior: onPress(item) and onLongPress(item).
const FileItem = ({
  item,
  index,
  viewMode,
  itemSize,
  isSelected,
  preview,
  currentMediaIndex,
  isModalVisible,
  onPress,
  onLongPress,
}) => {
  if (item.isFolder) {
    // Render folder
    return (
      <TouchableOpacity
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)}
        style={[
          viewMode === 'grid' ? styles.itemContainer : styles.listItemContainer,
          {
            width: viewMode === 'grid' ? itemSize - 16 : '100%',
            height: viewMode === 'grid' ? itemSize - 16 : 60,
            margin: viewMode === 'grid' ? 8 : 0,
            justifyContent: viewMode === 'grid' ? 'center' : 'flex-start',
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
    if (viewMode === 'grid') {
      return (
        <TouchableOpacity
          onPress={() => onPress(item)}
          onLongPress={() => onLongPress(item)}
          style={[
            styles.itemContainer,
            { width: itemSize - 16, height: itemSize - 16, margin: 8 },
          ]}
        >
          {(preview === 'true') ? (
            item.url ? (
              <View style={styles.videoContainer}>
                <CachedVideo
                  source={{ uri: item.url }}
                  style={styles.videoThumbnail}
                  resizeMode="cover"
                  isMuted
                  shouldPlay={currentMediaIndex === index && isModalVisible && item.isVideo}
                  useNativeControls={false}
                  cacheKey={item.key}
                />
                <View style={styles.playIconContainer}>
                  <IconButton icon="play-circle-outline" size={50} color="#fff" />
                </View>
              </View>
            ) : (
              <ActivityIndicator style={{ flex: 1 }} />
            )
          ) : (
            // When preview is off: show placeholder icon + file name (grid only)
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <IconButton icon="video-outline" size={50} />
              <Text style={{ textAlign: 'center' }}>{item.name}</Text>
            </View>
          )}
          {isSelected && (
            <View style={styles.checkboxContainer}>
              <Checkbox status="checked" style={styles.checkbox} />
            </View>
          )}
        </TouchableOpacity>
      );
    } else {
      // List view for video items
      return (
        <TouchableOpacity
          onPress={() => onPress(item)}
          onLongPress={() => onLongPress(item)}
          style={styles.listItemContainer}
        >
          {(preview === 'true') ? (
            item.url ? (
              <View style={styles.listVideoContainer}>
                <CachedVideo
                  source={{ uri: item.url }}
                  style={styles.listVideo}
                  resizeMode="cover"
                  isMuted
                  shouldPlay={currentMediaIndex === index && isModalVisible && item.isVideo}
                  useNativeControls={false}
                  cacheKey={item.key}
                />
                <View style={styles.playIconContainerList}>
                  <IconButton icon="play-circle-outline" size={30} color="#fff" />
                </View>
              </View>
            ) : (
              <ActivityIndicator style={styles.listVideo} />
            )
          ) : (
            // In list view, only the placeholder icon is shown
            <View style={[styles.listVideoContainer, { justifyContent: 'center', alignItems: 'center' }]}>
              <IconButton icon="video-outline" size={30} />
            </View>
          )}
          <View style={styles.listTextContainer}>
            <Text style={styles.listText}>{item.name}</Text>
            <Text style={styles.listSubText}>
              {(item.size / (1024 * 1024)).toFixed(2)} MB
            </Text>
          </View>
          {isSelected && <Checkbox status="checked" style={styles.listCheckbox} />}
        </TouchableOpacity>
      );
    }
  } else {
    // Render file
    if (viewMode === 'grid') {
      return (
        <TouchableOpacity
          onPress={() => onPress(item)}
          onLongPress={() => onLongPress(item)}
          style={[
            styles.itemContainer,
            { width: itemSize - 16, height: itemSize - 16, margin: 8 },
          ]}
        >
          {(preview === 'true') ? (
            item.url ? (
              <CachedImage
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
                cacheKey={item.key}
              />
            ) : (
              <ActivityIndicator style={{ flex: 1 }} />
            )
          ) : (
            // When preview is off: show placeholder icon + file name (grid only)
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <IconButton icon="image-outline" size={50} />
              <Text style={{ textAlign: 'center' }}>{item.name}</Text>
            </View>
          )}
          {isSelected && (
            <View style={styles.checkboxContainer}>
              <Checkbox status="checked" style={styles.checkbox} />
            </View>
          )}
        </TouchableOpacity>
      );
    } else {
      // List view for image items
      return (
        <TouchableOpacity
          onPress={() => onPress(item)}
          onLongPress={() => onLongPress(item)}
          style={styles.listItemContainer}
        >
          {(preview === 'true') ? (
            item.url ? (
              <CachedImage
                style={styles.listImage}
                source={{ uri: item.url }}
                cacheKey={item.key}
              />
            ) : (
              <ActivityIndicator style={styles.listImage} />
            )
          ) : (
            // In list view, only the placeholder icon is shown
            <View style={[styles.listImage, { justifyContent: 'center', alignItems: 'center' }]}>
              <IconButton icon="image-outline" size={30} />
            </View>
          )}
          <View style={styles.listTextContainer}>
            <Text style={styles.listText}>{item.name}</Text>
            <Text style={styles.listSubText}>
              {(item.size / (1024 * 1024)).toFixed(2)} MB
            </Text>
          </View>
          {isSelected && <Checkbox status="checked" style={styles.listCheckbox} />}
        </TouchableOpacity>
      );
    }
  }
};

const styles = StyleSheet.create({
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
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
  checkboxContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  checkbox: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
});

export default FileItem;
