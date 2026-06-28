import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Modal, FlatList, Text, Dimensions } from 'react-native';
import { IconButton } from 'react-native-paper';
import CachedImage from './CachedImage';
import CachedVideo from './CachedVideo';
import i18n from '../locales/translations';

// Full-screen media viewer with horizontal paging. Extracted verbatim from
// FileListScreen's modal. The parent owns the media list, the current index,
// and the action handlers.
const MediaViewerModal = ({
  visible,
  mediaFiles,
  currentMediaIndex,
  onClose,
  onDelete,
  onDownload,
  onShare,
  onIndexChange,
  onReachEnd,
  theme,
}) => {
  const flatListRef = useRef(null);

  // Keep the paging FlatList in sync with the current media index.
  useEffect(() => {
    if (visible && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index: currentMediaIndex, animated: false });
    }
  }, [visible, currentMediaIndex]);

  const onViewableItemsChanged = ({ viewableItems }) => {
    if (viewableItems.length) {
      const lastIndex = viewableItems[viewableItems.length - 1].index;
      onReachEnd(lastIndex);
    }
  };

  if (!(visible && mediaFiles.length > 0)) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <IconButton
            icon="close"
            iconColor="white"
            size={24}
            onPress={onClose}
            style={styles.modalCloseButton}
            accessibilityLabel={i18n.t('close')}
          />
          <View style={styles.modalRightButtons}>
            <IconButton
              icon="trash-can-outline"
              iconColor="white"
              size={24}
              onPress={onDelete}
              style={styles.modalDeleteButton}
              accessibilityLabel={i18n.t('delete')}
            />
            <IconButton
              icon="download"
              iconColor="white"
              size={24}
              onPress={onDownload}
              style={styles.modalDownloadButton}
              accessibilityLabel={i18n.t('download')}
            />
            <IconButton
              icon="share-variant"
              iconColor="white"
              size={24}
              onPress={onShare}
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
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          initialScrollIndex={currentMediaIndex}
          getItemLayout={(data, index) => (
            {length: Dimensions.get('window').width, offset: Dimensions.get('window').width * index, index}
          )}
          renderItem={({ item, index }) => (
            <View style={styles.modalMediaContainer}>
              {item.isVideo ? (
                <CachedVideo
                  source={{ uri: item.url }}
                  style={styles.fullMedia}
                  resizeMode="contain"
                  shouldPlay={currentMediaIndex === index && visible}
                  useNativeControls={true}
                  cacheKey={item.key}
                />
              ) : (
                <CachedImage
                  source={{ uri: item.url }}
                  style={styles.fullMedia}
                  resizeMode="contain"
                  cacheKey={item.key}
                />
              )}
            </View>
          )}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(
              event.nativeEvent.contentOffset.x / Dimensions.get('window').width
            );
            onIndexChange(index);
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
  );
};

const styles = StyleSheet.create({
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
  modalDeleteButton: {
    marginRight: 16,
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

export default MediaViewerModal;
