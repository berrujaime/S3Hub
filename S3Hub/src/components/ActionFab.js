// src/components/ActionFab.js
//
// The app's floating action buttons. Every FAB in the app is this one button:
// filled amber (theme.colors.primary), flat, 56dp, differing only by icon.
// Amber is the same accent the active tab (AppNavigator.js) and every
// contained Button already use. Before this component existed the FABs passed
// no color at all, so Paper applied its MD3 default of secondaryContainer --
// pale blue in this theme -- making the most prominent affordance on each
// screen the only one NOT using the action color.
//
// WARNING -- do NOT "simplify" this to <FAB variant="primary">.
// Paper maps that variant to theme.colors.primaryContainer /
// onPrimaryContainer (react-native-paper/src/components/FAB/utils.ts:183,226),
// and this theme overrides NEITHER. They fall back to MD3's defaults, where
// primaryContainer is palette.primary90 = #EADDFF -- a light purple. That is
// the same trap theme.js:50-58 documents for react-navigation's `card`:
// Paper's un-overridden MD3 tokens are tints of ITS own purple primary, not
// this theme's amber. The filled amber therefore comes from explicit style +
// color props, and `variant` is swallowed below so no caller can reach it.
//
// There is deliberately no second, lower-emphasis level. An earlier version
// had one (a 40dp variant="surface" FAB with an amber border) to give the two
// stacked FABs in Files a hierarchy, but on device the two buttons read as
// mismatched rather than ranked, so both are now identical. The border went
// with it: it existed only because the surface background measured 1.11:1
// against the page (invisible AS A BUTTON, WCAG 1.4.11 wants 3:1), whereas
// the filled amber measures 4.35:1 light / 8.03:1 dark on its own.
import React from 'react';
import { FAB, useTheme } from 'react-native-paper';

/**
 * The app's floating action button: filled amber, flat, 56dp.
 * @param {Object} props
 * @param {Object} [props.style] - Positioning, supplied by the caller (screen
 *   layout is not button identity). Merged LAST so it can place the FAB
 *   without dropping its background.
 * @param {string} props.icon - What distinguishes one FAB from another.
 */
export default function ActionFab({ style, variant, color, mode, ...rest }) {
  // `variant`, `color` and `mode` are deliberately destructured out and
  // discarded (never spread via `rest`): they are this component's identity,
  // not a caller's choice. Without this a caller could pass variant="primary"
  // straight through to Paper and hit the purple trap the WARNING above
  // documents -- from ActionFab itself -- or re-add the drop shadow that
  // `mode="flat"` exists to remove.
  const theme = useTheme();

  return (
    // `rest` is spread FIRST so the identity props below always win.
    //
    // mode="flat" is what removes the drop shadow, which read as artificial
    // on device. Paper derives the MD3 elevation as
    // `isFlatMode || disabled ? 0 : 3` (FAB.js:126,138), so this is the
    // supported switch; overriding elevation/shadowOpacity by style would
    // mean fighting Paper's own Surface elevation per platform instead.
    //
    // No `size`: Paper's default is 'medium' (56dp), which is the one size
    // this app uses.
    <FAB
      {...rest}
      mode="flat"
      color={theme.colors.onPrimary}
      style={[{ backgroundColor: theme.colors.primary }, style]}
    />
  );
}
