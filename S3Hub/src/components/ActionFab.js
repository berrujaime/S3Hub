// src/components/ActionFab.js
//
// The app's floating action buttons. Amber (theme.colors.primary) marks the
// primary action of a screen -- the same accent the active tab
// (AppNavigator.js) and every contained Button already use. Before this,
// the FABs passed no color at all, so Paper applied its MD3 default of
// secondaryContainer: pale blue in this theme, making the most prominent
// affordance on each screen the only one NOT using the action color.
//
// WARNING -- do NOT "simplify" this to <FAB variant="primary">.
// Paper maps that variant to theme.colors.primaryContainer /
// onPrimaryContainer (react-native-paper/src/components/FAB/utils.ts:183,226),
// and this theme overrides NEITHER. They fall back to MD3's defaults, where
// primaryContainer is palette.primary90 = #EADDFF -- a light purple. That is
// the same trap theme.js:50-58 documents for react-navigation's `card`:
// Paper's un-overridden MD3 tokens are tints of ITS own purple primary, not
// this theme's amber. The filled amber therefore comes from explicit style +
// color props.
//
// variant="surface" IS safe and is exactly the secondary treatment: Paper
// maps it to elevation.level3 for the background (utils.ts:195) and
// colors.primary for the icon (utils.ts:238), both defined by this theme in
// light and dark.
import React from 'react';
import { StyleSheet } from 'react-native';
import { FAB, useTheme } from 'react-native-paper';

/**
 * Floating action button at one of two emphasis levels.
 * @param {Object} props
 * @param {'primary'|'secondary'} [props.prominence] - 'primary' (default) is
 *   a 56dp filled amber FAB for the screen's main action; 'secondary' is a
 *   40dp low-emphasis one for a supporting action beside it.
 * @param {Object} [props.style] - Positioning, supplied by the caller (screen
 *   layout is not button identity). Merged LAST so it can place the FAB
 *   without dropping its background.
 */
export default function ActionFab({ prominence = 'primary', style, ...rest }) {
  const theme = useTheme();

  if (prominence === 'secondary') {
    return (
      // `rest` is spread FIRST so a caller can never override the props that
      // define this component's identity (size/variant/border).
      <FAB
        {...rest}
        size="small"
        variant="surface"
        style={[styles.secondary, { borderColor: theme.colors.primary }, style]}
      />
    );
  }

  return (
    <FAB
      {...rest}
      color={theme.colors.onPrimary}
      style={[{ backgroundColor: theme.colors.primary }, style]}
    />
  );
}

const styles = StyleSheet.create({
  secondary: {
    // Load-bearing, not decoration. variant="surface" resolves the background
    // to elevation.level3, which measures 1.11:1 (light) / 1.42:1 (dark)
    // against the page background -- the button is invisible AS A BUTTON and
    // only its icon reads, with the shape carried by a very faint elevation
    // shadow. WCAG 1.4.11 requires 3:1 for a boundary that identifies a
    // control. A colors.primary border measures 4.35:1 / 8.03:1 and doubles
    // as reinforcement that amber means action. (A colors.outline border was
    // measured and rejected: 1.54:1 / 1.83:1, still failing.)
    borderWidth: 1,
  },
});
