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
import { FlatList } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import FileListScreen from '../FileListScreen';
import { AuthContext } from '../../context/AuthContext';
import useFileList from '../../hooks/useFileList';
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
jest.mock('expo-av', () => ({ Video: 'Video' }));
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

const renderScreen = (fetchFiles) => {
  useFileList.mockReturnValue({
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
    addFolderOptimistic: jest.fn(),
    refreshAfterMutation: jest.fn(),
    setMediaFileUrl: jest.fn(),
  });

  render(
    <PaperProvider theme={darkTheme}>
      <AuthContext.Provider
        value={{ currentConnection: CONNECTION, currentBucket: 'bucket-a', preview: 'false' }}
      >
        <FileListScreen />
      </AuthContext.Provider>
    </PaperProvider>
  );
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

  it('tints the refresh spinner from the theme', () => {
    renderScreen(jest.fn().mockResolvedValue(undefined));

    const flatList = screen.UNSAFE_getByType(FlatList);
    expect(flatList.props.refreshControl.props.tintColor).toBe(darkTheme.colors.primary);
  });
});
