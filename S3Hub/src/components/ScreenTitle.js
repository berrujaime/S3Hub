// src/components/ScreenTitle.js
//
// The single screen-heading treatment for every top-level screen.
//
// Before this component each screen rolled its own heading, and they drifted:
// FileListScreen used Paper's `headlineSmall` variant, ConnectionSelectScreen
// and SettingsScreen used `headlineLarge` (one of them overriding fontSize
// back down to 24), and BucketSelectScreen used a PLAIN `Text` with
// `fontSize: 24`. That last one was the visible bug: without a Paper variant
// the heading falls back to the BODY font (Inter) instead of the display font
// (Space Grotesk) the type scale assigns to headline roles, so "Select a
// bucket" and "Files in <bucket>" — two headings one tap apart — rendered in
// different typefaces.
//
// `headlineSmall` (24dp display) is the shared choice: it matches what
// FileListScreen already showed and keeps long titles like
// "Files in a-very-long-bucket-name" from wrapping on narrow screens the way
// headlineLarge (32dp) does.
import React from 'react';
import { StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

/**
 * Themed, centered screen heading with the correct accessibility role.
 * @param {Object} props
 * @param {React.ReactNode} props.children - The title text.
 * @param {import('react-native').StyleProp<import('react-native').TextStyle>} [props.style]
 *   Merged last, so callers can tune spacing (e.g. a tighter marginBottom
 *   above a searchbar) without restating the typography.
 * @param {string} [props.testID]
 */
export default function ScreenTitle({ children, style, testID = 'screen-title' }) {
  const theme = useTheme();

  return (
    <Text
      testID={testID}
      variant="headlineSmall"
      accessibilityRole="header"
      style={[styles.title, { color: theme.colors.onBackground }, style]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
});
