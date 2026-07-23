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
