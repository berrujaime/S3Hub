// Tests for FileItem: the static accessibility contract every row variant
// (folder/video/image/generic) must expose, regardless of viewMode or
// mediaType.
//
// expo-av is mocked (same rationale as FileListScreen.test.js): CachedVideo
// imports `{ Video } from 'expo-av'`, which throws ("Cannot find native
// module 'ExponentAV'") at import time in Jest. FileItem imports CachedVideo
// unconditionally at module scope, so the mock is required even for the
// folder/document fixtures below that never render a CachedVideo instance.
//
// services/mediaCache is mocked wholesale (same rationale as
// FileListScreen.test.js): CachedImage/CachedVideo import CACHE_DIR/
// ensureDirectoryExists from it, and the real module pulls in
// @react-native-async-storage/async-storage, a native module that throws
// ("NativeModule: AsyncStorage is null") outside a device/native runtime.
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import FileItem from '../FileItem';
import { darkTheme } from '../../theme/theme';

jest.mock('expo-av', () => ({ Video: 'Video' }));
jest.mock('../../services/mediaCache', () => ({
  ensureDirectoryExists: jest.fn(),
  CACHE_DIR: '/tmp/',
}));

const baseProps = {
  index: 0,
  viewMode: 'grid',
  itemSize: 120,
  preview: 'false',
  currentMediaIndex: 0,
  isModalVisible: false,
  onPress: jest.fn(),
  onLongPress: jest.fn(),
};

const renderItem = (item, isSelected) =>
  render(
    <PaperProvider theme={darkTheme}>
      <FileItem item={item} isSelected={isSelected} {...baseProps} />
    </PaperProvider>
  );

describe('FileItem accessibility', () => {
  // Every assertion below is wrapped in `waitFor` rather than read
  // synchronously right after `render`: react-native-paper's IconButton (the
  // folder glyph) mounts an @expo/vector-icons Icon, which loads its font
  // and calls setState in a microtask AFTER the initial synchronous render.
  // A bare synchronous read leaves that follow-up update outside any act()
  // boundary and floods the output with "not wrapped in act(...)" warnings;
  // waitFor flushes it inside act (same idiom as ConnectionSelectScreen.test.js).
  it('exposes accessibilityRole="button", accessibilityLabel=item.name, and accessibilityState.selected=false for an unselected folder', async () => {
    renderItem({ id: 'sub/', key: 'sub/', name: 'sub', isFolder: true }, false);

    await waitFor(() => {
      const touchable = screen.UNSAFE_getByType(TouchableOpacity);
      expect(touchable.props.accessibilityRole).toBe('button');
      expect(touchable.props.accessibilityLabel).toBe('sub');
      expect(touchable.props.accessibilityState).toEqual({ selected: false });
    });
  });

  it('reflects accessibilityState.selected=true when the item is selected', async () => {
    renderItem(
      {
        id: 'notes.txt',
        key: 'notes.txt',
        name: 'notes.txt',
        size: 100,
        isFolder: false,
        isVideo: false,
        mediaType: 'document',
      },
      true
    );

    await waitFor(() => {
      const touchable = screen.UNSAFE_getByType(TouchableOpacity);
      expect(touchable.props.accessibilityRole).toBe('button');
      expect(touchable.props.accessibilityLabel).toBe('notes.txt');
      expect(touchable.props.accessibilityState).toEqual({ selected: true });
    });
  });

  it('uses item.name as the label even for a non-previewable "other"-category file type (archive)', async () => {
    renderItem(
      {
        id: 'archive.zip',
        key: 'archive.zip',
        name: 'archive.zip',
        size: 1000,
        isFolder: false,
        isVideo: false,
        mediaType: 'archive',
      },
      false
    );

    await waitFor(() => {
      const touchable = screen.UNSAFE_getByType(TouchableOpacity);
      expect(touchable.props.accessibilityLabel).toBe('archive.zip');
      expect(touchable.props.accessibilityState).toEqual({ selected: false });
    });
  });
});
