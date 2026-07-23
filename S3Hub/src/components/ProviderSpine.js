// src/components/ProviderSpine.js
//
// The "provider spine" signature element (Phase 4 design direction): a thin
// left bar tinted with the provider's brand color, so a connection/bucket
// row visually encodes WHICH provider it belongs to at a glance. The color
// itself comes from the provider registry (`domain/providers`), which is
// domain data — not a hardcoded color literal in this component. Unknown/
// custom providers have no `brandColor` in the registry, so this falls back
// to the theme's own `primary` (the single amber signal token), never a
// literal hex value.
//
// Positioning: the bar is absolutely positioned (left/top/bottom: 0) so it
// never participates in row layout/flex and can't shift existing paddings
// or touch targets. Callers must wrap the row in a container with
// `position: 'relative'` (and, ideally, `overflow: 'hidden'` if the row has
// rounded corners) so the bar anchors to that row rather than the whole
// screen.
//
// `RegionTag` is the companion piece of the same signature: a small
// monospace label for the row's region/endpoint, reading
// `theme.fonts.mono.regular` (the JetBrains Mono contract from Task 4.2)
// and colored `onSurfaceVariant` — never a hardcoded font family or color.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { getProvider } from '../domain/providers';

// ~3.5dp: thin enough to read as a structural accent rather than a colored
// block, per the design direction's "thin left spine bar".
const SPINE_WIDTH = 4;

/**
 * Thin left vertical bar tinted with a provider's brand color.
 * @param {Object} props
 * @param {string} [props.providerId] - Registry id (e.g. 'aws', 'r2'). Falls
 *   back to the 'custom' descriptor (brandColor: null) for unknown/missing.
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]
 * @param {string} [props.testID]
 */
export default function ProviderSpine({ providerId, style, testID = 'provider-spine' }) {
  const theme = useTheme();
  const provider = getProvider(providerId);
  const color = provider.brandColor ?? theme.colors.primary;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[styles.spine, { backgroundColor: color }, style]}
    />
  );
}

/**
 * Small monospace region/endpoint tag — the companion of the provider
 * spine. Renders nothing when `value` is falsy, so callers can pass a
 * possibly-missing region/endpoint without an extra guard.
 * @param {Object} props
 * @param {string} [props.value]
 * @param {import('react-native').StyleProp<import('react-native').TextStyle>} [props.style]
 * @param {string} [props.testID]
 */
export function RegionTag({ value, style, testID = 'region-tag' }) {
  const theme = useTheme();

  if (!value) {
    return null;
  }

  return (
    <Text
      testID={testID}
      numberOfLines={1}
      style={[theme.fonts.mono.regular, { color: theme.colors.onSurfaceVariant }, style]}
    >
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SPINE_WIDTH,
    borderRadius: SPINE_WIDTH / 2,
  },
});
