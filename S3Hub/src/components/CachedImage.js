import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Image as RNImage } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { CACHE_DIR, ensureDirectoryExists } from '../services/mediaCache';

// CachedImage component to handle image caching
const CachedImage = ({ source, style, cacheKey }) => {
  const [imgUri, setImgUri] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadImage = async () => {
      const path = `${CACHE_DIR}${cacheKey}`;
      try {
        // Ensure the directory exists
        await ensureDirectoryExists(path);

        const pathInfo = await FileSystem.getInfoAsync(path);

        if (pathInfo.exists) {
          // Image is cached
          if (isMounted) setImgUri(path);
        } else {
          // Download image to cache
          const result = await FileSystem.downloadAsync(source.uri, path);
          if (isMounted) setImgUri(result.uri);
        }
      } catch (error) {
        console.error('Error caching image:', error);
        if (isMounted) setImgUri(source.uri); // Fallback to remote URI
      }
    };

    loadImage();

    return () => {
      isMounted = false;
    };
  }, [source.uri, cacheKey]);

  if (!imgUri) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  } else {
    return <RNImage style={style} source={{ uri: imgUri }} />;
  }
};

export default CachedImage;
