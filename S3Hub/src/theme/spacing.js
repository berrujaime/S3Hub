// src/theme/spacing.js
//
// Every screen in AppNavigator.js renders with `headerShown: false` (see
// AppNavigator.js), so there is no navigation header to push content below
// the status bar — each screen's own top-level container is responsible for
// that clearance. Combine this token with `useSafeAreaInsets().top` (from
// react-native-safe-area-context) instead of a hardcoded per-screen
// `marginTop`: a fixed number is only ever correct for the one device it was
// eyeballed on and either leaves content under the status bar (notch/camera
// cutout devices, most Android phones) or over-spaces it (older/no-notch
// devices).

/**
 * Breathing room to add on top of the safe-area top inset for screens with
 * no navigation header. A single named constant so every screen uses the
 * same value instead of independently-chosen magic numbers.
 */
export const SCREEN_TOP_SPACING = 16;
