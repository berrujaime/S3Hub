// src/components/UploadProgressPopup.js

import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { ProgressBar, Surface, Text, useTheme } from 'react-native-paper';
import PropTypes from 'prop-types';

// Rewritten for Task 4.4: this was the last component reading the static
// default `theme` export (light-only, never the active dark theme) instead
// of Paper's useTheme() hook — so an upload/delete kicked off while the app
// was in dark mode rendered a light-themed popup on top of a dark screen.
// `Surface` (with elevation) replaces the manual shadow/elevation styling so
// the popup's background/shadow follow Paper's own elevation system instead
// of a hardcoded white fill.
const UploadProgressPopup = ({ progress, operation }) => {
  const theme = useTheme();

  return (
    <Surface
      style={[styles.popupContainer, { borderColor: theme.colors.secondaryContainer }]}
      elevation={4}
      accessibilityRole="alert"
    >
      <Text style={styles.popupText}>
        {operation}: {Math.round(progress * 100)}%
      </Text>
      <ProgressBar
        progress={progress}
        color={theme.colors.primary}
        style={styles.progressBar}
      />
    </Surface>
  );
};

UploadProgressPopup.propTypes = {
  progress: PropTypes.number.isRequired,
  operation: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  popupContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 20, // Adjust top offset for safe areas
    alignSelf: 'center',
    width: '90%',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
  },
  popupText: {
    fontSize: 16,
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
  },
});

export default UploadProgressPopup;
