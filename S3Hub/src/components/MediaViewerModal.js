import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Modal, FlatList, useWindowDimensions } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import CachedImage from './CachedImage';
import CachedVideo from './CachedVideo';
import i18n from '../locales/translations';
import { mediaCacheKey } from '../domain/cacheKeys';
import { formatSize } from '../domain/fileSize';

// Cache namespace derived from the ITEM's own fetch-time origin (stamped in
// useFileList), never from live connection/bucket context: during a
// bucket/connection switch the context updates one render before the items
// do, and a live-context key would cache the old bucket's bytes under the
// new bucket's namespace. An item without origin fields skips disk caching
// entirely (null cacheKey) rather than guessing a namespace.
const itemCacheKey = (item) =>
  item.connectionId && item.bucket ? mediaCacheKey(item.connectionId, item.bucket, item.key) : null;

// Full-screen media viewer with horizontal paging. Extracted verbatim from
// FileListScreen's modal. The parent owns the media list, the current index,
// and the action handlers.
//
// Design exception (Task 4.4): `modalContainer`/`modalHeader`'s
// rgba(0,0,0,...) fills and the `iconColor="white"` header buttons are kept
// as fixed constants rather than theme tokens. This full-screen backdrop and
// its chrome sit on top of arbitrary user photo/video content, not an app
// surface — a themed (light-mode) background/icon color here would fight
// the media itself and could disappear against either a light or dark
// theme, whereas a black scrim + white icons stays legible in both schemes.
// `infoContainer`/`infoText` are NOT part of this exception: that box shows
// app-owned text (file name/size) over a solid theme color
// (secondaryContainer), so it is themed normally below.
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
  // useWindowDimensions (Task 5.7) instead of a module-load Dimensions.get:
  // the latter is read once when this module first loads and never updates,
  // so rotating the device left the paging FlatList's page width/height
  // (getItemLayout, onMomentumScrollEnd's page-index math) and the full-
  // screen media size stuck at the orientation the app started in. All
  // three now derive from this single hook call so they stay consistent
  // with each other and with the live screen size.
  const { width, height } = useWindowDimensions();

  // Keep the paging FlatList in sync with the current media index.
  useEffect(() => {
    if (visible && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index: currentMediaIndex, animated: false });
    }
  }, [visible, currentMediaIndex]);

  // FlatList throws "Changing onViewableItemsChanged on the fly is not
  // supported" if this prop's identity changes after mount, so the value
  // actually passed to FlatList must never change — hence the useRef below
  // instead of a plain function/inline object. `onReachEnd` itself is NOT
  // stabilized by the parent (FileListScreen recreates it every render), so
  // the ref's body reads the latest one indirectly through
  // `onReachEndRef`, kept in sync by the effect beneath it.
  const onReachEndRef = useRef(onReachEnd);
  useEffect(() => {
    onReachEndRef.current = onReachEnd;
  }, [onReachEnd]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length) {
      const lastIndex = viewableItems[viewableItems.length - 1].index;
      onReachEndRef.current(lastIndex);
    }
  }).current;

  // Same "changing on the fly" restriction applies to viewabilityConfig;
  // this value is static anyway, but a literal object still gets a new
  // identity every render, so it's pinned via useRef too.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  if (!(visible && mediaFiles.length > 0)) {
    return null;
  }

  // width-derived: recomputed every render from the live useWindowDimensions
  // value, kept out of the static StyleSheet below (which is evaluated once
  // at module load and would otherwise go stale on rotation).
  const fullMediaStyle = { width: width * 0.9, height: height * 0.6 };
  const modalMediaContainerStyle = [styles.modalMediaContainer, { width, height }];

  return (
    <Modal visible={visible} transparent={true} onRequestClose={onClose}>
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
          viewabilityConfig={viewabilityConfig}
          initialScrollIndex={currentMediaIndex}
          getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item, index }) => (
            <View style={modalMediaContainerStyle}>
              {item.isVideo ? (
                <CachedVideo
                  source={{ uri: item.url }}
                  style={fullMediaStyle}
                  resizeMode="contain"
                  shouldPlay={currentMediaIndex === index && visible}
                  useNativeControls={true}
                  cacheKey={itemCacheKey(item)}
                />
              ) : (
                <CachedImage
                  source={{ uri: item.url }}
                  style={fullMediaStyle}
                  resizeMode="contain"
                  cacheKey={itemCacheKey(item)}
                />
              )}
            </View>
          )}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / width);
            onIndexChange(index);
          }}
          style={{ flex: 1 }}
        />

        {mediaFiles[currentMediaIndex] && (
          <View
            style={[styles.infoContainer, { backgroundColor: theme.colors.secondaryContainer }]}
          >
            <Text style={[styles.infoText, { color: theme.colors.onSecondaryContainer }]}>
              {i18n.t('fileName')}: {mediaFiles[currentMediaIndex].name}
            </Text>
            <Text style={[styles.infoText, { color: theme.colors.onSecondaryContainer }]}>
              {i18n.t('fileSize')}: {formatSize(mediaFiles[currentMediaIndex].size)}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // modalContainer/modalHeader keep fixed rgba(0,0,0,...) scrims — see the
  // "Design exception" comment above the component for why (full-screen
  // backdrop/chrome over arbitrary media, not an app surface).
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
  modalCloseButton: {},
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
  // fullMedia/modalMediaContainer no longer live here: their width/height
  // came from a module-load Dimensions.get('window') that never updated on
  // rotation. They're now computed per-render from useWindowDimensions as
  // fullMediaStyle/modalMediaContainerStyle above the render function; only
  // the dimension-independent properties stay in this static StyleSheet.
  modalMediaContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    // backgroundColor is themed inline (secondaryContainer) at the call
    // site — this box shows app-owned text, not media, so it follows the
    // active scheme instead of the fixed black scrim above.
    padding: 16,
    borderRadius: 8,
  },
  infoText: {
    // color is themed inline (onSecondaryContainer) at the call site.
    fontSize: 16,
    marginBottom: 8,
  },
});

export default MediaViewerModal;
