import { lightTheme, darkTheme } from '../theme';
import { contrastRatio } from '../../domain/colorContrast';

describe('lightTheme / darkTheme (Deep storage palette)', () => {
  it('gives the light theme an AA-compliant onPrimary/primary pair (>= 4.5:1)', () => {
    expect(
      contrastRatio(lightTheme.colors.onPrimary, lightTheme.colors.primary)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('gives the dark theme an AA-compliant onPrimary/primary pair (>= 4.5:1)', () => {
    expect(
      contrastRatio(darkTheme.colors.onPrimary, darkTheme.colors.primary)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('gives the light theme an AA-compliant onSurface/surface pair (>= 4.5:1)', () => {
    expect(
      contrastRatio(lightTheme.colors.onSurface, lightTheme.colors.surface)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('gives the dark theme an AA-compliant onSurface/surface pair (>= 4.5:1)', () => {
    expect(
      contrastRatio(darkTheme.colors.onSurface, darkTheme.colors.surface)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('gives the dark theme an AA-compliant onSurfaceVariant/surfaceVariant pair (>= 4.5:1)', () => {
    expect(
      contrastRatio(
        darkTheme.colors.onSurfaceVariant,
        darkTheme.colors.surfaceVariant
      )
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('gives the light theme an AA-compliant onSurfaceVariant/surfaceVariant pair (>= 4.5:1)', () => {
    expect(
      contrastRatio(
        lightTheme.colors.onSurfaceVariant,
        lightTheme.colors.surfaceVariant
      )
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps surface and background distinct in the dark theme (the missing layering)', () => {
    expect(darkTheme.colors.surface).not.toBe(darkTheme.colors.background);
  });

  it('keeps surface and background distinct in the light theme', () => {
    expect(lightTheme.colors.surface).not.toBe(lightTheme.colors.background);
  });

  it('does not share a blanket primary color across the two schemes', () => {
    expect(lightTheme.colors.primary).not.toBe(darkTheme.colors.primary);
  });

  it('uses the exact dark "Deep storage" token values from the design direction', () => {
    expect(darkTheme.colors.background).toBe('#0E1116');
    expect(darkTheme.colors.surface).toBe('#161B22');
    expect(darkTheme.colors.surfaceVariant).toBe('#1E2530');
    expect(darkTheme.colors.onBackground).toBe('#E7ECF3');
    expect(darkTheme.colors.onSurface).toBe('#E7ECF3');
    expect(darkTheme.colors.onSurfaceVariant).toBe('#9AA6B4');
    expect(darkTheme.colors.primary).toBe('#E8973A');
    expect(darkTheme.colors.onPrimary).toBe('#241800');
    expect(darkTheme.colors.secondary).toBe('#6FA8DC');
    expect(darkTheme.colors.error).toBe('#FF6B6B');
    expect(darkTheme.colors.onError).toBe('#2A0000');
    expect(darkTheme.colors.outline).toBe('#38414D');
    expect(darkTheme.colors.elevation.level2).toBe('#232B37');
  });

  it('uses the exact light "Deep storage" token values that do not require an AA adjustment', () => {
    expect(lightTheme.colors.background).toBe('#F5F7FA');
    expect(lightTheme.colors.surface).toBe('#FFFFFF');
    expect(lightTheme.colors.surfaceVariant).toBe('#E7ECF2');
    expect(lightTheme.colors.onBackground).toBe('#10151C');
    expect(lightTheme.colors.onSurface).toBe('#10151C');
    expect(lightTheme.colors.onSurfaceVariant).toBe('#55606E');
    expect(lightTheme.colors.onPrimary).toBe('#FFFFFF');
    expect(lightTheme.colors.secondary).toBe('#2A6FB0');
    expect(lightTheme.colors.error).toBe('#BA1A1A');
    expect(lightTheme.colors.outline).toBe('#C2CAD4');
  });

  it('exposes a real, visible elevation ramp (dark) that is monotonically lighter than the base surface', () => {
    const { elevation, surface } = darkTheme.colors;
    const levels = [
      elevation.level1,
      elevation.level2,
      elevation.level3,
      elevation.level4,
      elevation.level5,
    ];
    // Every solid level must be strictly lighter (higher luminance) than the
    // previous one, and lighter than the base surface it sits on top of.
    const luminanceOf = (hex) => contrastRatio(hex, '#000000');
    expect(luminanceOf(levels[0])).toBeGreaterThan(luminanceOf(surface));
    for (let i = 1; i < levels.length; i += 1) {
      expect(luminanceOf(levels[i])).toBeGreaterThan(luminanceOf(levels[i - 1]));
    }
  });

  it('exposes secondary/secondaryContainer tokens instead of the legacy accent', () => {
    expect(lightTheme.colors.secondary).toBeTruthy();
    expect(lightTheme.colors.secondaryContainer).toBeTruthy();
    expect(darkTheme.colors.secondary).toBeTruthy();
    expect(darkTheme.colors.secondaryContainer).toBeTruthy();
    expect(lightTheme.colors.secondaryContainer).not.toBe(
      darkTheme.colors.secondaryContainer
    );
  });

  it('keeps a temporary accent alias (= secondaryContainer) so pre-Task-4.4 consumers do not break', () => {
    // MediaViewerModal and UploadProgressPopup still read theme.colors.accent
    // directly; Task 4.4 rewires them onto secondaryContainer. Until then,
    // accent is not a real design token, just a compatibility shim.
    expect(lightTheme.colors.accent).toBe(lightTheme.colors.secondaryContainer);
    expect(darkTheme.colors.accent).toBe(darkTheme.colors.secondaryContainer);
  });
});

describe('lightTheme / darkTheme fonts (Task 4.2 type scale)', () => {
  // These family-name strings are the exact keys App.js registers via
  // expo-font's useFonts() -- see the comment above `fontConfig` in
  // src/theme/theme.js for why they must stay in sync.
  const SPACE_GROTESK_BOLD = 'SpaceGrotesk_700Bold';
  const SPACE_GROTESK_MEDIUM = 'SpaceGrotesk_500Medium';
  const INTER_REGULAR = 'Inter_400Regular';
  const INTER_MEDIUM = 'Inter_500Medium';
  const JETBRAINS_MONO_REGULAR = 'JetBrainsMono_400Regular';
  const JETBRAINS_MONO_MEDIUM = 'JetBrainsMono_500Medium';

  it('maps display/headline roles to the Space Grotesk bold weight in both themes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const role of ['displayLarge', 'displayMedium', 'displaySmall', 'headlineLarge', 'headlineMedium', 'headlineSmall']) {
        expect(theme.fonts[role].fontFamily).toBe(SPACE_GROTESK_BOLD);
      }
    }
  });

  it('maps title roles to the Space Grotesk medium weight in both themes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const role of ['titleLarge', 'titleMedium', 'titleSmall']) {
        expect(theme.fonts[role].fontFamily).toBe(SPACE_GROTESK_MEDIUM);
      }
    }
  });

  it('maps body roles to Inter regular and label roles to Inter medium in both themes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const role of ['bodyLarge', 'bodyMedium', 'bodySmall']) {
        expect(theme.fonts[role].fontFamily).toBe(INTER_REGULAR);
      }
      for (const role of ['labelLarge', 'labelMedium', 'labelSmall']) {
        expect(theme.fonts[role].fontFamily).toBe(INTER_MEDIUM);
      }
    }
  });

  it('does not pair a per-weight fontFamily with a numeric fontWeight (Android double-bold risk)', () => {
    for (const theme of [lightTheme, darkTheme]) {
      for (const role of [
        'displayLarge', 'displayMedium', 'displaySmall',
        'headlineLarge', 'headlineMedium', 'headlineSmall',
        'titleLarge', 'titleMedium', 'titleSmall',
        'labelLarge', 'labelMedium', 'labelSmall',
        'bodyLarge', 'bodyMedium', 'bodySmall',
      ]) {
        expect(theme.fonts[role].fontWeight).toBe('normal');
      }
    }
  });

  it('exposes a mono theme extension (regular + medium) for keys/regions/sizes/endpoints', () => {
    for (const theme of [lightTheme, darkTheme]) {
      expect(theme.fonts.mono.regular.fontFamily).toBe(JETBRAINS_MONO_REGULAR);
      expect(theme.fonts.mono.medium.fontFamily).toBe(JETBRAINS_MONO_MEDIUM);
      // Sized to match bodyMedium so mono text lines up with surrounding copy.
      expect(theme.fonts.mono.regular.fontSize).toBe(theme.fonts.bodyMedium.fontSize);
      expect(theme.fonts.mono.regular.lineHeight).toBe(theme.fonts.bodyMedium.lineHeight);
    }
  });

  it('shares the exact same fonts config object between light and dark themes', () => {
    expect(lightTheme.fonts).toBe(darkTheme.fonts);
  });
});
