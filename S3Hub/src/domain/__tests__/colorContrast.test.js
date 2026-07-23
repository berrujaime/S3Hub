import { contrastRatio } from '../colorContrast';

describe('contrastRatio', () => {
  it('returns 21 for black on white (the maximum possible contrast)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('returns 21 regardless of argument order', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });

  it('returns 1 when both colors are identical', () => {
    expect(contrastRatio('#6200EE', '#6200EE')).toBeCloseTo(1, 5);
  });

  it('returns 1 for any color against itself, not just black/white', () => {
    expect(contrastRatio('#E8973A', '#E8973A')).toBeCloseTo(1, 5);
    expect(contrastRatio('#161B22', '#161B22')).toBeCloseTo(1, 5);
  });

  it('accepts hex strings without a leading #', () => {
    expect(contrastRatio('000000', 'FFFFFF')).toBeCloseTo(21, 1);
  });

  it('is case-insensitive for hex digits', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('computes a known intermediate ratio (WCAG mid-gray #767676 on white ~= 4.54)', () => {
    // This is the well-known "just barely passes AA for normal text" gray.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 1);
  });

  it('computes the design system onPrimary/primary pair above the AA threshold (dark theme)', () => {
    expect(contrastRatio('#241800', '#E8973A')).toBeGreaterThanOrEqual(4.5);
  });
});
