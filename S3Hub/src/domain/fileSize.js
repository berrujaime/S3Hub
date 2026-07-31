// Pure formatting of a byte count for display.
// No React, AWS SDK, or Expo imports — fully unit-testable.
//
// Single owner of size formatting in the app. It replaced the same expression
// inlined at four call sites — `(size / (1024 * 1024)).toFixed(2)` + ' MB' —
// which divided by MB unconditionally, so every object below ~5 KB rendered as
// an identical "0.00 MB".
//
// Unit symbols are deliberately NOT routed through i18n: B/KB/MB/GB/TB are
// universal symbols, not prose, and the previous code hardcoded 'MB' the same
// way. Only the number's decimal separator would be locale-dependent, and
// `toFixed` is not locale-aware anyway.
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const STEP = 1024;

/**
 * Formats a byte count with the largest unit that keeps the number >= 1.
 *
 * Bytes render whole (`812 B`); larger units keep at most one decimal and drop
 * a trailing `.0` (`1.5 KB`, `3 MB`). Caps at TB rather than inventing units
 * beyond it. Anything that is not a finite, non-negative number — a missing
 * `Size` in an S3 listing, a string, NaN — returns an empty string, so an
 * unknown size shows nothing instead of `NaN MB`.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';

  let value = bytes;
  let unit = 0;
  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit += 1;
  }

  // Bytes are always whole, so skip the decimal machinery for them entirely;
  // `toFixed(1)` on a sub-KB value would render '812.0 B'.
  const rendered = unit === 0 ? String(value) : String(Number(value.toFixed(1)));
  return `${rendered} ${UNITS[unit]}`;
}
