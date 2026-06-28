import React, { useState, useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { CACHE_DIR, ensureDirectoryExists } from '../services/mediaCache';

// CachedVideo component to handle video caching
const CachedVideo = ({ source, style, cacheKey, ...props }) => {
  const [videoUri, setVideoUri] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadVideo = async () => {
      const path = `${CACHE_DIR}${cacheKey}`;
      try {
        // Ensure the directory exists
        await ensureDirectoryExists(path);

        const pathInfo = await FileSystem.getInfoAsync(path);

        if (pathInfo.exists) {
          // Video is cached
          if (isMounted) setVideoUri(path);
        } else {
          // Download video to cache
          const result = await FileSystem.downloadAsync(source.uri, path);
          if (isMounted) setVideoUri(result.uri);
        }
      } catch (error) {
        console.error('Error caching video:', error);
        if (isMounted) setVideoUri(source.uri); // Fallback to remote URI
      }
    };

    loadVideo();

    return () => {
      isMounted = false;
    };
  }, [source.uri, cacheKey]);

  if (!videoUri) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  } else {
    return (
      <Video
        source={{ uri: videoUri }}
        style={style}
        {...props}
      />
    );
  }
};

export default CachedVideo;
