// src/components/UploadProgressPopup.js

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { ProgressBar } from 'react-native-paper';
import PropTypes from 'prop-types';
import theme from '../theme/theme';

const UploadProgressPopup = ({ progress, operation = 'Procesando' }) => {
  return (
    <View style={styles.popupContainer} accessibilityRole="alert">
      <Text style={styles.popupText}>
        {operation}: {Math.round(progress * 100)}%
      </Text>
      <ProgressBar progress={progress} color="#6200ee" style={styles.progressBar} />
    </View>
  );
};

UploadProgressPopup.propTypes = {
  progress: PropTypes.number.isRequired,
  operation: PropTypes.string,
};

const styles = StyleSheet.create({
  popupContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 20, // Adjust top offset for safe areas
    alignSelf: 'center',
    width: '90%',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    zIndex: 10,
    // Border styling
    borderWidth: 1,
    borderColor: theme.colors.accent,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    // Android shadow
    elevation: 5,
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
