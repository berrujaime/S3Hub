// src/components/TextViewerModal.js
//
// In-app viewer for the text formats this app can render itself (txt, md, csv,
// json, log…). Purely presentational: the parent downloads the object, reads
// it through `services/fileOpener.readTextPreview` and passes the string in,
// so this component needs no filesystem access and is trivially testable.
//
// Body text renders in the theme's mono family — the same JetBrains Mono
// contract the region tags use. Log lines, CSV columns and JSON indentation
// only line up in a monospace face, and it matches the "storage vernacular"
// the design direction assigns to keys and byte sizes.
import React from 'react';
import { View, StyleSheet, Modal, ScrollView } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
import i18n from '../locales/translations';

/**
 * Full-screen scrollable text viewer.
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {string} props.title - File name shown in the header.
 * @param {string} props.content - The (possibly truncated) file text.
 * @param {boolean} [props.truncated] - Shows a "showing only the first part"
 *   notice when the file exceeded the read cap.
 * @param {() => void} props.onClose
 */
export default function TextViewerModal({ visible, title, content, truncated = false, onClose }) {
  const theme = useTheme();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.outline }]}>
          <Text
            variant="titleMedium"
            numberOfLines={1}
            style={[styles.title, { color: theme.colors.onBackground }]}
          >
            {title}
          </Text>
          <IconButton
            icon="close"
            iconColor={theme.colors.onBackground}
            onPress={onClose}
            accessibilityLabel={i18n.t('close')}
          />
        </View>

        {truncated ? (
          <Text
            variant="bodySmall"
            style={[
              styles.notice,
              {
                color: theme.colors.onSecondaryContainer,
                backgroundColor: theme.colors.secondaryContainer,
              },
            ]}
          >
            {i18n.t('textTruncated')}
          </Text>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          // Long log lines are more readable scrolled sideways than wrapped.
          horizontal={false}
        >
          <Text
            testID="text-viewer-content"
            selectable
            style={[theme.fonts.mono.regular, { color: theme.colors.onSurface }]}
          >
            {content}
          </Text>
        </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    marginRight: 8,
  },
  notice: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
});
