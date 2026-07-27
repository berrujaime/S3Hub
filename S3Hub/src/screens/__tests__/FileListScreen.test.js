// src/screens/__tests__/FileListScreen.test.js
//
// Regression/coverage test for Task 5.8's pull-to-refresh: the FlatList's
// RefreshControl must call useFileList's fetchFiles with `forceRefresh: true`
// so a manual pull bypasses the AsyncStorage list cache (see
// hooks/useFileList.js) and actually recovers from e.g. a transient network
// loss, instead of silently re-rendering the same cached items.
//
// useFileList is mocked wholesale (rather than exercised for real): it pulls
// in fileCacheRepository -> AsyncStorage and mediaCache/expo-file-system,
// none of which load outside a device runtime, and the hook's own fetch/cache
// behavior is already covered by hooks/__tests__/useFileList.test.js. This
// test only needs to assert how FileListScreen WIRES the hook's fetchFiles
// into the FlatList's RefreshControl.
import React from 'react';
import { FlatList, Alert, Dimensions } from 'react-native';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import {
  Provider as PaperProvider,
  FAB,
  Button,
  TextInput as PaperTextInput,
} from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import FileListScreen from '../FileListScreen';
import { AuthContext } from '../../context/AuthContext';
import useFileList from '../../hooks/useFileList';
import { getPresignedUploadUrl, uploadEmptyFolder, getSignedUrl } from '../../services/s3Service';
import { getCachedFileUri } from '../../services/mediaCache';
import { openExternally, readTextPreview } from '../../services/fileOpener';
import i18n from '../../locales/translations';
import { darkTheme } from '../../theme/theme';

// Explicit factories (same rationale as BucketSelectScreen.test.js /
// useFileList.test.js): these modules pull in native/AWS SDK dependencies
// that don't load outside a device runtime, and FileItem's CachedVideo pulls
// in expo-av, which throws ("Cannot find native module 'ExponentAV'") at
// import time in Jest.
jest.mock('../../data/connectionRepository', () => ({}));
jest.mock('../../services/s3Service', () => ({
  getSignedUrl: jest.fn(),
  deleteFile: jest.fn(),
  deleteFolderRecursive: jest.fn(),
  listAllUnderPrefix: jest.fn(),
  getPresignedUploadUrl: jest.fn(),
  uploadEmptyFolder: jest.fn(),
}));
jest.mock('../../services/mediaCache', () => ({
  ensureDirectoryExists: jest.fn(),
  getCachedFileUri: jest.fn(),
  initializeMediaCache: jest.fn(),
  clearEntireCache: jest.fn(),
  CACHE_DIR: '/tmp/',
}));
jest.mock('expo-av', () => ({ Video: 'Video', Audio: { Sound: { createAsync: jest.fn() } } }));
// The file-open path (audio/text in-app, everything else to another app) is
// covered for real in services/__tests__/fileOpener.test.js; here we only
// assert how FileListScreen ROUTES a tap into it.
jest.mock('../../services/fileOpener', () => ({
  openExternally: jest.fn(),
  readTextPreview: jest.fn(),
}));
// expo-notifications logs a console.warn about Expo Go / SDK 53 push support
// at import time, polluting the test output. scheduleNotificationAsync is
// the only member FileListScreen calls (the upload-complete notification).
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
}));
// expo-document-picker's native module doesn't load outside a device
// runtime; getDocumentAsync is the only member handleUpload calls.
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));
// Explicit factory (same rationale as the mocks above): expo-file-system's
// native module doesn't load outside a device runtime. Only the members
// FileListScreen's upload/download paths call are provided.
jest.mock('expo-file-system', () => ({
  uploadAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 'BINARY_CONTENT' },
  cacheDirectory: 'file:///cache/',
  createDownloadResumable: jest.fn(),
  deleteAsync: jest.fn(),
}));
// Explicit factory (same rationale as the mocks above): a bare
// `jest.mock('../../hooks/useFileList')` automock still requires the REAL
// module first to introspect its shape, which pulls in fileCacheRepository ->
// AsyncStorage.
jest.mock('../../hooks/useFileList', () => jest.fn());

const CONNECTION = {
  id: 'conn-1',
  service: 'aws',
  region: 'eu-west-1',
  accessKey: 'AKIA-TEST',
};

// Returns the mock object handed to useFileList so callers can assert on
// individual hook functions (e.g. refreshAfterMutation) without needing an
// explicit override for every test.
const renderScreen = (fetchFiles, overrides = {}) => {
  const mocks = {
    fullFiles: [],
    displayedFiles: [],
    mediaFiles: [],
    loading: false,
    currentPath: '',
    searchQuery: '',
    setSearchQuery: jest.fn(),
    visibleFiles: [],
    showNoResults: false,
    fetchFiles,
    loadMoreFiles: jest.fn(),
    enterFolder: jest.fn(),
    goBack: jest.fn(),
    refreshAfterMutation: jest.fn().mockResolvedValue(undefined),
    setMediaFileUrl: jest.fn(),
    changeSortCriterion: jest.fn(),
    toggleSortDirection: jest.fn(),
    ...overrides,
  };
  useFileList.mockReturnValue(mocks);

  render(
    <PaperProvider theme={darkTheme}>
      <AuthContext.Provider
        value={{
          currentConnection: CONNECTION,
          currentBucket: 'bucket-a',
          preview: 'false',
          sortCriterion: 'type',
          sortDirection: 'asc',
          changeSortCriterion: mocks.changeSortCriterion,
          toggleSortDirection: mocks.toggleSortDirection,
        }}
      >
        <FileListScreen />
      </AuthContext.Provider>
    </PaperProvider>,
  );

  return mocks;
};

describe('FileListScreen pull-to-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wires the FlatList RefreshControl to a forced, cache-bypassing refetch', async () => {
    const fetchFiles = jest.fn().mockResolvedValue(undefined);
    renderScreen(fetchFiles);

    const flatList = screen.UNSAFE_getByType(FlatList);
    expect(flatList.props.refreshControl).toBeTruthy();
    expect(flatList.props.refreshControl.props.refreshing).toBe(false);

    await act(async () => {
      await flatList.props.refreshControl.props.onRefresh();
    });

    // undefined (not the internal isActive token) plus the forceRefresh
    // option that skips useFileList's cache-hit branch (see
    // hooks/useFileList.js's fetchFiles).
    expect(fetchFiles).toHaveBeenCalledWith(undefined, { forceRefresh: true });
  });

  it('tints the refresh spinner from the theme (iOS tintColor and Android colors)', () => {
    renderScreen(jest.fn().mockResolvedValue(undefined));

    const flatList = screen.UNSAFE_getByType(FlatList);
    expect(flatList.props.refreshControl.props.tintColor).toBe(darkTheme.colors.primary);
    // Android's RefreshControl ignores tintColor entirely and reads `colors`
    // instead -- without this prop the spinner would render Android's
    // hardcoded default color on that platform regardless of theme.
    expect(flatList.props.refreshControl.props.colors).toEqual([darkTheme.colors.primary]);
  });
});

// Routed item (Task 6.1, code review): the Task 5.7 regression where
// getItemLayout mixed up row vs. item indices in grid mode. FlatList itself
// (via VirtualizedList) is responsible for translating the flat `data` array
// into row indices when numColumns > 1 -- it calls getItemLayout with the
// ROW index directly, so gridItemLayout must NOT divide by numColumns again.
// This grabs the actual prop function off the rendered tree (not a
// reimplementation) and calls it exactly as FlatList would, for row indices
// 0, 1, 2.
describe('FileListScreen grid getItemLayout', () => {
  it('computes offset = ROW index * itemSize for row indexes 0, 1, and 2, with numColumns > 1', () => {
    renderScreen(jest.fn().mockResolvedValue(undefined));

    const flatList = screen.UNSAFE_getByType(FlatList);
    const { width } = Dimensions.get('window');
    // Mirrors FileListScreen's own numColumns/itemSize derivation for the
    // default 'grid' viewMode -- see the `numColumns`/`itemSize` consts.
    const numColumns = width >= 1024 ? 4 : width >= 768 ? 3 : 2;
    const itemSize = width / numColumns;

    expect(numColumns).toBeGreaterThan(1);
    expect(flatList.props.numColumns).toBe(numColumns);
    expect(typeof flatList.props.getItemLayout).toBe('function');

    [0, 1, 2].forEach((rowIndex) => {
      expect(flatList.props.getItemLayout(undefined, rowIndex)).toEqual({
        length: itemSize,
        offset: rowIndex * itemSize,
        index: rowIndex,
      });
    });
  });
});

describe('FileListScreen upload (DocumentPicker)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows no error alert when the user cancels the document picker ({canceled: true, assets: null})', async () => {
    DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen(jest.fn().mockResolvedValue(undefined));

    const uploadFab = screen.UNSAFE_getAllByType(FAB).find((fab) => fab.props.icon === 'upload');
    expect(uploadFab).toBeTruthy();

    await act(async () => {
      await uploadFab.props.onPress();
    });

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

// Important I-1 (whole-branch review): both the upload FAB and create-folder
// dialog must invalidate the AsyncStorage file-list cache, not just refresh
// in-memory state -- otherwise the next cache-served load (e.g. leaving and
// re-entering the folder) resurrects the pre-mutation snapshot and the
// newly-uploaded file/folder appears to have vanished. refreshAfterMutation
// (hooks/useFileList.js) drops the cache entry before refetching; a plain
// fetchFiles() call (the pre-fix upload path) or a local-state-only
// addFolderOptimistic (the pre-fix folder path, since removed as dead code)
// does not.
describe('FileListScreen cache invalidation after mutations (Important I-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls refreshAfterMutation (not just fetchFiles) after a successful upload', async () => {
    DocumentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/test.txt', name: 'test.txt', mimeType: 'text/plain' }],
    });
    getPresignedUploadUrl.mockResolvedValue('https://upload.example/url');
    FileSystem.uploadAsync.mockResolvedValue({ status: 200 });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const mocks = renderScreen(jest.fn().mockResolvedValue(undefined));

    const uploadFab = screen.UNSAFE_getAllByType(FAB).find((fab) => fab.props.icon === 'upload');
    await act(async () => {
      await uploadFab.props.onPress();
    });

    expect(mocks.refreshAfterMutation).toHaveBeenCalledTimes(1);
    // The pre-fix code called fetchFiles() directly here instead, which
    // leaves a still-fresh AsyncStorage cache entry in place -- the very
    // next cache-served load would serve the stale (pre-upload) snapshot.
    // See hooks/useFileList.js's fetchFiles cache-hit branch.
    expect(mocks.fetchFiles).not.toHaveBeenCalled();
  });

  it('calls refreshAfterMutation after a successful folder creation', async () => {
    uploadEmptyFolder.mockResolvedValue({});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const mocks = renderScreen(jest.fn().mockResolvedValue(undefined));

    const createFolderFab = screen
      .UNSAFE_getAllByType(FAB)
      .find((fab) => fab.props.icon === 'folder-plus');
    await act(async () => {
      createFolderFab.props.onPress();
    });

    const folderNameInput = screen.UNSAFE_getByType(PaperTextInput);
    await act(async () => {
      folderNameInput.props.onChangeText('New Folder');
    });

    const createButton = screen
      .UNSAFE_getAllByType(Button)
      .find((button) => button.props.children === i18n.t('create'));
    expect(createButton).toBeTruthy();

    await act(async () => {
      await createButton.props.onPress();
    });

    expect(uploadEmptyFolder).toHaveBeenCalledWith(CONNECTION, 'bucket-a', 'New Folder/');
    expect(mocks.refreshAfterMutation).toHaveBeenCalledTimes(1);
  });
});

// The reported bug: tapping a zip / txt / mp3 / pdf did NOTHING. handleItemPress
// only reacted to items present in `mediaFiles` (the previewable image/video
// subset), so every other type was inert — invisible to the user as anything
// but a dead row. These tests pin each branch of the new routing.
describe('FileListScreen opening non-media files', () => {
  const fileItem = (name, key) => ({
    id: key,
    name,
    key,
    isFolder: false,
    // itemCacheKey needs the item's fetch-time origin, or it refuses to cache
    // (and the open path bails with a download error).
    connectionId: CONNECTION.id,
    bucket: 'bucket-a',
  });

  // Grabs the onPress FileListScreen hands each row and fires it for `item`,
  // exactly as the FlatList would.
  const pressItem = async (item) => {
    const flatList = screen.UNSAFE_getByType(FlatList);
    const row = flatList.props.renderItem({ item, index: 0 });
    await act(async () => {
      await row.props.onPress(item);
    });
  };

  const renderWithFile = (item) =>
    renderScreen(jest.fn().mockResolvedValue(undefined), {
      visibleFiles: [item],
      displayedFiles: [item],
      fullFiles: [item],
      // Deliberately empty: this item is NOT previewable media, which is the
      // whole point.
      mediaFiles: [],
    });

  beforeEach(() => {
    jest.clearAllMocks();
    getSignedUrl.mockResolvedValue('https://signed.example/object');
    getCachedFileUri.mockResolvedValue('file:///cache/object');
  });

  it('hands a pdf to another app with the right MIME type', async () => {
    openExternally.mockResolvedValue(true);
    const item = fileItem('report.pdf', 'docs/report.pdf');
    renderWithFile(item);

    await pressItem(item);

    expect(getSignedUrl).toHaveBeenCalledWith(CONNECTION, 'bucket-a', 'docs/report.pdf');
    // Third arg: the object's display name, used for the staged copy handed
    // to the other app so it shows "report.pdf", not the cache hash.
    expect(openExternally).toHaveBeenCalledWith(
      'file:///cache/object',
      'application/pdf',
      'report.pdf',
    );
  });

  it('hands an archive to another app', async () => {
    openExternally.mockResolvedValue(true);
    const item = fileItem('bundle.zip', 'bundle.zip');
    renderWithFile(item);

    await pressItem(item);

    expect(openExternally).toHaveBeenCalledWith(
      'file:///cache/object',
      'application/zip',
      'bundle.zip',
    );
  });

  it('explains itself when no installed app handles the type', async () => {
    openExternally.mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const item = fileItem('firmware.bin', 'firmware.bin');
    renderWithFile(item);

    await pressItem(item);

    expect(alertSpy).toHaveBeenCalledWith(i18n.t('error'), i18n.t('cannotOpenFile'));
    alertSpy.mockRestore();
  });

  it('renders a text file in the in-app viewer instead of leaving the screen', async () => {
    readTextPreview.mockResolvedValue({ content: 'line one\nline two', truncated: false });
    const item = fileItem('notes.txt', 'notes.txt');
    renderWithFile(item);

    await pressItem(item);

    expect(readTextPreview).toHaveBeenCalledWith('file:///cache/object');
    expect(openExternally).not.toHaveBeenCalled();
    expect(screen.getByTestId('text-viewer-content')).toBeTruthy();
    expect(screen.getByText('line one\nline two')).toBeTruthy();
  });

  it('warns that a truncated text preview is partial', async () => {
    readTextPreview.mockResolvedValue({ content: 'first chunk', truncated: true });
    const item = fileItem('huge.log', 'huge.log');
    renderWithFile(item);

    await pressItem(item);

    expect(screen.getByText(i18n.t('textTruncated'))).toBeTruthy();
  });

  it('opens audio in the in-app player rather than another app', async () => {
    const item = fileItem('song.mp3', 'music/song.mp3');
    renderWithFile(item);

    await pressItem(item);

    expect(openExternally).not.toHaveBeenCalled();
    expect(readTextPreview).not.toHaveBeenCalled();
    // The player mounts only while open; its close button carries the label.
    expect(screen.getByLabelText(i18n.t('close'))).toBeTruthy();
  });

  it('reports a download failure instead of opening an empty viewer', async () => {
    getCachedFileUri.mockResolvedValue(null);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const item = fileItem('report.pdf', 'report.pdf');
    renderWithFile(item);

    await pressItem(item);

    expect(alertSpy).toHaveBeenCalledWith(i18n.t('error'), i18n.t('downloadError'));
    expect(openExternally).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('maps a signing/network failure through the shared error mapper', async () => {
    getSignedUrl.mockRejectedValue(Object.assign(new Error('nope'), { name: 'AccessDenied' }));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const item = fileItem('report.pdf', 'report.pdf');
    renderWithFile(item);

    await pressItem(item);

    expect(alertSpy).toHaveBeenCalledWith(i18n.t('error'), i18n.t('errorAccessDenied'));
    alertSpy.mockRestore();
  });

  it('still toggles selection instead of opening while in selection mode', async () => {
    const item = fileItem('report.pdf', 'report.pdf');
    renderWithFile(item);

    // Enter selection mode via long-press, then tap.
    const flatList = screen.UNSAFE_getByType(FlatList);
    const row = flatList.props.renderItem({ item, index: 0 });
    await act(async () => {
      row.props.onLongPress(item);
    });
    await pressItem(item);

    expect(openExternally).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});

describe('FileListScreen sort control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    i18n.locale = 'en';
  });

  it('reaches the context action when a new criterion is chosen', () => {
    const mocks = renderScreen();

    fireEvent.press(screen.getByTestId('sort-menu'));
    fireEvent.press(screen.getByText('Date modified'));

    expect(mocks.changeSortCriterion).toHaveBeenCalledWith('modified');
  });

  it('reaches the context toggle when the active criterion is re-picked', () => {
    const mocks = renderScreen();

    fireEvent.press(screen.getByTestId('sort-menu'));
    fireEvent.press(screen.getByText('File type'));

    expect(mocks.toggleSortDirection).toHaveBeenCalledTimes(1);
  });

  it('passes the active preference down to useFileList', () => {
    renderScreen();

    expect(useFileList).toHaveBeenCalledWith(expect.anything(), 'bucket-a', 'type', 'asc');
  });
});
