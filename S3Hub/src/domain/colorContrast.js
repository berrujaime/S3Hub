// Pure domain module: WCAG 2.x relative-luminance contrast ratio.
// No React, AWS SDK, or Expo imports — fully unit-testable.
//
// Used by the theme layer (and its tests) to verify that foreground/
// background token pairs meet the WCAG AA threshold (>= 4.5:1 for normal
// text) instead of trusting the palette by eye.

const HEX_PATTERN = /^#?([0-9a-f]{6})$/i;

/**
 * Parse a 6-digit hex color string (with or without a leading '#') into its
 * [r, g, b] channel values in the 0-255 range.
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function parseHex(hex) {
  const match = typeof hex === 'string' ? hex.match(HEX_PATTERN) : null;
  if (!match) {
    throw new Error(`contrastRatio: invalid hex color "${hex}"`);
  }
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

// WCAG channel linearization: sRGB -> linear RGB.
function linearizeChannel(channel8bit) {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// WCAG relative luminance: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance([r, g, b]) {
  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

/**
 * WCAG contrast ratio between two colors, in the range [1, 21].
 * Symmetric: contrastRatio(a, b) === contrastRatio(b, a).
 * @param {string} hexA - 6-digit hex color, with or without leading '#'.
 * @param {string} hexB - 6-digit hex color, with or without leading '#'.
 * @returns {number}
 */
export function contrastRatio(hexA, hexB) {
  const luminanceA = relativeLuminance(parseHex(hexA));
  const luminanceB = relativeLuminance(parseHex(hexB));
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}
