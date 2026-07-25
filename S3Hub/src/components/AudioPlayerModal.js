// src/components/AudioPlayerModal.js
//
// In-app audio player for audio objects (mp3, wav, flac…). Built on expo-av's
// `Audio.Sound`, which is already a dependency (CachedVideo uses the same
// library's `Video`), so playing audio adds no new native module.
//
// The player owns the Sound instance for exactly as long as the modal is
// visible: it loads on open and unloads on close/unmount. That matters more
// than usual here — an un-unloaded Sound keeps playing after the modal is
// gone, with no UI left to stop it.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import { Audio } from 'expo-av';
import { ActivityIndicator, IconButton, ProgressBar, Text, useTheme } from 'react-native-paper';
import i18n from '../locales/translations';

/**
 * Formats a millisecond position as m:ss (h:mm:ss past an hour).
 * @param {number} millis
 * @returns {string}
 */
const formatTime = (millis) => {
  if (!Number.isFinite(millis) || millis < 0) {
    return '0:00';
  }
  const totalSeconds = Math.floor(millis / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = Math.floor(totalSeconds / 60);

  if (minutes < 60) {
    return `${minutes}:${seconds}`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${seconds}`;
};

/**
 * Modal audio player with play/pause and a progress readout.
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {string} props.title - File name shown above the controls.
 * @param {string} props.uri - Local (cached) or remote audio URI.
 * @param {() => void} props.onClose
 */
export default function AudioPlayerModal({ visible, title, uri, onClose }) {
  const theme = useTheme();
  const soundRef = useRef(null);
  const [status, setStatus] = useState({
    isLoaded: false,
    isPlaying: false,
    position: 0,
    duration: 0,
  });
  const [failed, setFailed] = useState(false);

  // Mirrors expo-av's playback status into local state. Kept as a ref-stable
  // callback so it can be handed to the Sound at creation time.
  const onPlaybackStatusUpdate = useCallback((playbackStatus) => {
    if (!playbackStatus.isLoaded) {
      return;
    }
    setStatus({
      isLoaded: true,
      isPlaying: playbackStatus.isPlaying,
      position: playbackStatus.positionMillis ?? 0,
      duration: playbackStatus.durationMillis ?? 0,
    });
  }, []);

  useEffect(() => {
    if (!visible || !uri) {
      return undefined;
    }

    let cancelled = false;
    setFailed(false);
    setStatus({ isLoaded: false, isPlaying: false, position: 0, duration: 0 });

    const load = async () => {
      try {
        // Keep playing when the device is in silent mode — a user who taps an
        // audio file is explicitly asking to hear it.
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          onPlaybackStatusUpdate,
        );

        if (cancelled) {
          // The modal closed while this was loading — unload immediately
          // instead of leaking a playing Sound with no UI attached.
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
      } catch (error) {
        console.error('Error loading audio:', error?.name || error?.code, error?.message);
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) {
        sound.unloadAsync().catch(() => {
          // Already unloaded / never fully loaded: nothing to recover from.
        });
      }
    };
  }, [visible, uri, onPlaybackStatusUpdate]);

  const togglePlayback = async () => {
    const sound = soundRef.current;
    if (!sound) {
      return;
    }
    try {
      if (status.isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch (error) {
      console.error('Error toggling playback:', error?.name || error?.code, error?.message);
    }
  };

  const progress = status.duration > 0 ? status.position / status.duration : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.header}>
          <IconButton
            icon="close"
            iconColor={theme.colors.onBackground}
            onPress={onClose}
            accessibilityLabel={i18n.t('close')}
          />
        </View>

        <View style={styles.body}>
          <IconButton
            icon="music-circle"
            size={96}
            iconColor={theme.colors.primary}
            disabled
            style={styles.artwork}
          />
          <Text
            variant="titleMedium"
            numberOfLines={2}
            style={[styles.title, { color: theme.colors.onBackground }]}
          >
            {title}
          </Text>

          {failed ? (
            <Text style={[styles.error, { color: theme.colors.error }]}>
              {i18n.t('audioError')}
            </Text>
          ) : !status.isLoaded ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
          ) : (
            <>
              <ProgressBar
                testID="audio-progress"
                progress={progress}
                color={theme.colors.primary}
                style={styles.progress}
              />
              <View style={styles.times}>
                <Text style={[theme.fonts.mono.regular, { color: theme.colors.onSurfaceVariant }]}>
                  {formatTime(status.position)}
                </Text>
                <Text style={[theme.fonts.mono.regular, { color: theme.colors.onSurfaceVariant }]}>
                  {formatTime(status.duration)}
                </Text>
              </View>
              <IconButton
                testID="audio-toggle"
                icon={status.isPlaying ? 'pause-circle' : 'play-circle'}
                size={72}
                iconColor={theme.colors.primary}
                onPress={togglePlayback}
                accessibilityLabel={i18n.t(status.isPlaying ? 'pause' : 'play')}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  artwork: {
    marginBottom: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 32,
  },
  loader: {
    marginTop: 24,
  },
  error: {
    textAlign: 'center',
    marginTop: 16,
  },
  progress: {
    width: '100%',
    height: 4,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
});
