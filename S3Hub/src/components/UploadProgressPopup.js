// src/components/UploadProgressPopup.js

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { ProgressBar } from 'react-native-paper';

const UploadProgressPopup = ({ progress }) => {
  return (
    <View style={styles.popupContainer}>
      <Text style={styles.popupText}>Uploading Files: {Math.round(progress * 100)}%</Text>
      <ProgressBar progress={progress} color="#6200ee" style={styles.progressBar} />
    </View>
  );
};

const styles = StyleSheet.create({
  popupContainer: {
    position: 'absolute',
    top: 0,
    width: Dimensions.get('window').width,
    padding: 16,
    backgroundColor: '#ffffffee',
    alignItems: 'center',
    zIndex: 1,
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
