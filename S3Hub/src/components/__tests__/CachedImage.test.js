// src/components/__tests__/CachedImage.test.js
//
// CachedImage used to destructure only { source, style, cacheKey } and drop
// every other prop, so MediaViewerModal's resizeMode="contain" never reached
// the Image and React Native's default "cover" cropped every preview. The
// first test below is the regression guard for that. The rest pin the four
// cache branches so the prop-forwarding change cannot quietly alter them.
import React from 'react';
import { Image } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system';
import CachedImage from '../CachedImage';

jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn(),
  downloadAsync: jest.fn(),
}));

// Mocked so the test exercises CachedImage alone: the real module computes
// CACHE_DIR from FileSystem.cacheDirectory and pulls in AsyncStorage.
jest.mock('../../services/mediaCache', () => ({
  CACHE_DIR: 'file:///cache/S3HubCache/',
  ensureDirectoryExists: jest.fn().mockResolvedValue(undefined),
}));

const REMOTE_URI = 'https://example.com/photo.jpg?X-Amz-Signature=abc';
const CACHE_KEY = 'conn__bucket__photo.jpg';
const CACHED_PATH = 'file:///cache/S3HubCache/conn__bucket__photo.jpg';

const renderImage = (props = {}) =>
  render(
    <CachedImage
      source={{ uri: REMOTE_URI }}
      style={{ width: 90, height: 60 }}
      cacheKey={CACHE_KEY}
      {...props}
    />,
  );

const renderedImage = () => screen.UNSAFE_getByType(Image);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CachedImage', () => {
  it('forwards resizeMode to the underlying Image so previews are not cropped', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    renderImage({ resizeMode: 'contain' });

    await waitFor(() => expect(renderedImage()).toBeTruthy());
    expect(renderedImage().props.resizeMode).toBe('contain');
  });

  it('forwards arbitrary extra props, not just resizeMode', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    renderImage({ accessibilityLabel: 'photo.jpg' });

    await waitFor(() => expect(renderedImage()).toBeTruthy());
    expect(renderedImage().props.accessibilityLabel).toBe('photo.jpg');
  });

  it('renders the cached file when it already exists on disk', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    renderImage();

    await waitFor(() => expect(renderedImage().props.source).toEqual({ uri: CACHED_PATH }));
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it('downloads into the cache when the file is not cached yet', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    FileSystem.downloadAsync.mockResolvedValue({ uri: CACHED_PATH });

    renderImage();

    await waitFor(() => expect(renderedImage().props.source).toEqual({ uri: CACHED_PATH }));
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(REMOTE_URI, CACHED_PATH);
  });

  it('falls back to the remote URI when caching fails', async () => {
    FileSystem.getInfoAsync.mockRejectedValue(new Error('disk full'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderImage();

    await waitFor(() => expect(renderedImage().props.source).toEqual({ uri: REMOTE_URI }));
    consoleError.mockRestore();
  });

  it('skips the disk cache entirely when there is no cache key', async () => {
    renderImage({ cacheKey: null });

    await waitFor(() => expect(renderedImage().props.source).toEqual({ uri: REMOTE_URI }));
    expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
  });
});
