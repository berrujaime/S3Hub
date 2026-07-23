// src/theme/theme.js
//
// "Deep storage" design system: a cool slate foundation with a single warm
// amber signal accent, replacing the old blanket Material default
// (#6200EE primary, background ~= surface). Two distinct token themes —
// lightTheme and darkTheme — are built on top of Paper's MD3LightTheme /
// MD3DarkTheme so every unset token (primaryContainer, tertiary, fonts,
// etc.) still falls back to sane MD3 defaults; only the tokens explicitly
// called out below are overridden.
//
// Token values are taken verbatim from the Phase 4 design direction
// EXCEPT lightTheme.colors.primary — see the comment at
// LIGHT_PRIMARY_AA_FIXED below for why it was nudged one step darker.
import { MD3LightTheme, MD3DarkTheme, configureFonts } from 'react-native-paper';

// The design direction specifies `primary #B4650F` for light ("deepened
// amber so white or dark labels pass AA") paired with `onPrimary #FFFFFF`.
// Measured with the WCAG formula (src/domain/colorContrast.js), that exact
// pair is only ~4.37:1 — just under the 4.5:1 AA threshold it was
// deliberately deepened to reach. Nudging the shade one notch darker
// (#B4650F -> #AD610E, a ~4% per-channel reduction) restores a real AA
// margin (~4.67:1) while staying visually indistinguishable from the
// intended amber. Flagged for the design direction doc to be corrected.
const LIGHT_PRIMARY_AA_FIXED = '#AD610E';

const lightColors = {
  ...MD3LightTheme.colors,
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceVariant: '#E7ECF2',
  onBackground: '#10151C',
  onSurface: '#10151C',
  onSurfaceVariant: '#55606E',
  primary: LIGHT_PRIMARY_AA_FIXED,
  onPrimary: '#FFFFFF',
  secondary: '#2A6FB0',
  // secondaryContainer/onSecondaryContainer are not given by the design
  // direction; derived here as a pale, high-value tint of `secondary`
  // (20% secondary blended into white) with a dark navy "on" color (20%
  // secondary blended into onSurface), matching MD3's light-container
  // convention. Verified >=4.5:1 (measured ~11.5:1) via colorContrast.js.
  secondaryContainer: '#D4E2EF',
  onSecondaryContainer: '#15273A',
  error: '#BA1A1A',
  // onError is not given by the design direction; white matches MD3's
  // standard "light text on saturated error red" convention and measures
  // ~6.5:1 against #BA1A1A (verified via colorContrast.js).
  onError: '#FFFFFF',
  outline: '#C2CAD4',
  // Elevation is intentionally NOT overridden here: the design direction
  // only specifies a dark-theme elevation.level2 value (dark is "the
  // primary experience"). Paper's default MD3LightTheme elevation ramp
  // (near-white tints spread in via ...MD3LightTheme.colors above) already
  // sits close to this theme's near-white surface/background and needs no
  // bespoke values for this task.
  // TODO(4.4): temporary compatibility shim. MediaViewerModal.js and
  // UploadProgressPopup.js still read theme.colors.accent directly (the
  // legacy token this theme removes). Alias it to secondaryContainer so
  // those two consumers keep a sensible color until Task 4.4 rewires them
  // onto real tokens.
  accent: '#D4E2EF',
};

const darkColors = {
  ...MD3DarkTheme.colors,
  background: '#0E1116',
  surface: '#161B22',
  surfaceVariant: '#1E2530',
  onBackground: '#E7ECF3',
  onSurface: '#E7ECF3',
  onSurfaceVariant: '#9AA6B4',
  primary: '#E8973A',
  onPrimary: '#241800',
  secondary: '#6FA8DC',
  // secondaryContainer/onSecondaryContainer are not given by the design
  // direction; derived here as a muted, low-value blend of `secondary`
  // into `surfaceVariant` (25% secondary / 75% surfaceVariant) so the
  // container reads as part of the slate family, with a light "on" color
  // (40% secondary blended into onSurface). Verified >=4.5:1 (measured
  // ~6.2:1) via colorContrast.js.
  secondaryContainer: '#32465B',
  onSecondaryContainer: '#B7D1EA',
  error: '#FF6B6B',
  onError: '#2A0000',
  outline: '#38414D',
  // A real, visible elevation ramp (the "missing layering" the design
  // direction calls out) instead of Paper's default near-transparent
  // overlay tints. level2 (#232B37) is the exact value given by the
  // design direction. The rest are derived to keep a single monotonic
  // lightening ramp with background/surface/surfaceVariant/level2:
  //  - level0: 'transparent' — matches Paper's own MD3 convention; a
  //    Surface with no elevation shows whatever is beneath it (usually
  //    `background`) rather than duplicating a color.
  //  - level1: reuses `surfaceVariant` (#1E2530). The design direction's
  //    own wording lists background -> surface -> surfaceVariant ->
  //    elevation.level2 as one continuous "real, visible ramp", i.e.
  //    surfaceVariant already occupies the level1 slot in that sequence.
  //  - level3/4/5: continue the same per-channel lightening trend from
  //    background(+8,+10,+12) -> surface(+8,+10,+14) -> surfaceVariant
  //    (+5,+6,+7) -> level2, tapering the increment further (roughly
  //    +4/+5/+6, then +3/+4/+5, then +3/+3/+4 per step) so elevation
  //    keeps rising but with diminishing steps, mirroring how real
  //    overlay-based elevation systems (including Paper's own MD2
  //    overlay alpha table) approach a ceiling rather than climbing
  //    linearly forever.
  elevation: {
    level0: 'transparent',
    level1: '#1E2530',
    level2: '#232B37',
    level3: '#27303D',
    level4: '#2A3442',
    level5: '#2D3746',
  },
  // TODO(4.4): temporary compatibility shim, see lightColors.accent above.
  accent: '#32465B',
};

// --- Typography (Task 4.2) ---------------------------------------------
//
// Bundled via `expo-font`'s `useFonts` in App.js — NO native module/plugin
// involved (see App.js for the full list of imports/registrations). The
// string literals below MUST exactly match the keys App.js registers
// (they are the exported member names of the @expo-google-fonts/*
// packages, e.g. `import { SpaceGrotesk_700Bold } from
// '@expo-google-fonts/space-grotesk'` then `useFonts({ SpaceGrotesk_700Bold, ... })`).
// If a weight is ever added/renamed here, update App.js's useFonts() call
// to match, and vice versa.
//
// Per the Phase 4 design direction: display **Space Grotesk** for
// headers/titles (technical character), body **Inter** for legible UI
// text, mono **JetBrains Mono** for the storage vernacular (object keys,
// region codes, byte sizes, endpoints).
const SPACE_GROTESK_BOLD = 'SpaceGrotesk_700Bold';
const SPACE_GROTESK_MEDIUM = 'SpaceGrotesk_500Medium';
const INTER_REGULAR = 'Inter_400Regular';
const INTER_MEDIUM = 'Inter_500Medium';
const JETBRAINS_MONO_REGULAR = 'JetBrainsMono_400Regular';
const JETBRAINS_MONO_MEDIUM = 'JetBrainsMono_500Medium';

// Only `fontFamily` (and `fontWeight: 'normal'`) are overridden per role;
// fontSize/lineHeight/letterSpacing keep Paper's MD3 defaults, which
// `configureFonts` merges in automatically for any role not fully
// specified here (see react-native-paper/src/styles/fonts.tsx).
//
// `fontWeight` is deliberately set to 'normal' rather than left as
// Paper's stock numeric value (or set to match the family's actual
// weight): these are static, single-weight font files (not variable
// fonts), so the weight is already baked into the fontFamily string
// itself (e.g. `SpaceGrotesk_700Bold`). Pairing a bold-weight fontFamily
// with `fontWeight: '700'` risks Android synthesizing a second, fake
// bold pass on top of the already-bold glyphs. This matches the official
// @expo-google-fonts usage pattern, which never sets `fontWeight`
// alongside a per-weight `fontFamily`.
const fontConfig = {
  displayLarge: { fontFamily: SPACE_GROTESK_BOLD, fontWeight: 'normal' },
  displayMedium: { fontFamily: SPACE_GROTESK_BOLD, fontWeight: 'normal' },
  displaySmall: { fontFamily: SPACE_GROTESK_BOLD, fontWeight: 'normal' },
  headlineLarge: { fontFamily: SPACE_GROTESK_BOLD, fontWeight: 'normal' },
  headlineMedium: { fontFamily: SPACE_GROTESK_BOLD, fontWeight: 'normal' },
  headlineSmall: { fontFamily: SPACE_GROTESK_BOLD, fontWeight: 'normal' },
  titleLarge: { fontFamily: SPACE_GROTESK_MEDIUM, fontWeight: 'normal' },
  titleMedium: { fontFamily: SPACE_GROTESK_MEDIUM, fontWeight: 'normal' },
  titleSmall: { fontFamily: SPACE_GROTESK_MEDIUM, fontWeight: 'normal' },
  labelLarge: { fontFamily: INTER_MEDIUM, fontWeight: 'normal' },
  labelMedium: { fontFamily: INTER_MEDIUM, fontWeight: 'normal' },
  labelSmall: { fontFamily: INTER_MEDIUM, fontWeight: 'normal' },
  bodyLarge: { fontFamily: INTER_REGULAR, fontWeight: 'normal' },
  bodyMedium: { fontFamily: INTER_REGULAR, fontWeight: 'normal' },
  bodySmall: { fontFamily: INTER_REGULAR, fontWeight: 'normal' },
};

const fonts = configureFonts({ config: fontConfig });

// `mono` is a theme extension (not a stock MD3 typescale role) for the
// storage vernacular the design direction calls out: object keys, region
// codes, byte sizes, endpoints. Consumers (Task 4.5 onward) read it via
// `useTheme().fonts.mono`:
//   - `mono.regular` (JetBrains Mono, 400) — inline values: object keys,
//     byte sizes.
//   - `mono.medium` (JetBrains Mono, 500) — the slightly-emphasized
//     region/endpoint tag described in the "provider spine" signature
//     element.
// Both share bodyMedium's fontSize/lineHeight/letterSpacing so mono text
// lines up with surrounding body copy; only family/weight differ. Do NOT
// hardcode 'JetBrainsMono_...' family strings in components — read this
// object off the theme instead, so a future font swap only touches this
// file.
fonts.mono = {
  regular: {
    fontFamily: JETBRAINS_MONO_REGULAR,
    fontWeight: 'normal',
    fontSize: fonts.bodyMedium.fontSize,
    lineHeight: fonts.bodyMedium.lineHeight,
    letterSpacing: fonts.bodyMedium.letterSpacing,
  },
  medium: {
    fontFamily: JETBRAINS_MONO_MEDIUM,
    fontWeight: 'normal',
    fontSize: fonts.bodyMedium.fontSize,
    lineHeight: fonts.bodyMedium.lineHeight,
    letterSpacing: fonts.bodyMedium.letterSpacing,
  },
};

export const lightTheme = {
  ...MD3LightTheme,
  dark: false,
  colors: lightColors,
  fonts,
};

export const darkTheme = {
  ...MD3DarkTheme,
  dark: true,
  colors: darkColors,
  fonts,
};

// Default export kept for backward compatibility with the one remaining
// static (non-useTheme()) consumer, UploadProgressPopup.js, which does
// `import theme from '../theme/theme'` instead of using Paper's useTheme()
// hook. App.js already imports the named lightTheme/darkTheme exports and
// picks between them based on the active scheme. lightTheme preserves the
// pre-existing default (which scheme is default belongs to Tasks 4.2/4.3);
// Task 4.4 rewires UploadProgressPopup onto useTheme(), after which this
// export can be removed.
export default lightTheme;
