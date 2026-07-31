// src/domain/__tests__/fileSize.test.js
//
// Before this module existed, four call sites (FileItem's three layouts and
// MediaViewerModal) each inlined `(size / (1024 * 1024)).toFixed(2)` + ' MB'.
// That renders every object under ~5 KB as a flat "0.00 MB", so a 1-byte
// marker and a 4 KB text file were indistinguishable — visible in the store
// screenshots, where a whole listing read "0.00 MB". These tests pin the
// scaling and the small-file cases that the old expression got wrong.
import { formatSize } from '../fileSize';

describe('formatSize', () => {
  it.each([
    [0, '0 B'],
    [1, '1 B'],
    [812, '812 B'],
    [1023, '1023 B'],
  ])('renders %s bytes as %s without a unit jump', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });

  it.each([
    [1024, '1 KB'],
    [4096, '4 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1 MB'],
    [Math.round(2.6 * 1024 * 1024), '2.6 MB'],
    [1024 * 1024 * 1024, '1 GB'],
    [1024 * 1024 * 1024 * 1024, '1 TB'],
  ])('scales %s bytes to %s', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });

  // The whole point of the change: these all collapsed to '0.00 MB' before.
  it('distinguishes small files that the old MB-only formatting flattened', () => {
    const rendered = [1, 900, 4096, 20480].map(formatSize);
    expect(new Set(rendered).size).toBe(4);
    expect(rendered).not.toContain('0.00 MB');
  });

  it('drops a trailing .0 rather than padding decimals', () => {
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3 MB');
  });

  it('caps at TB instead of inventing larger units', () => {
    expect(formatSize(5 * 1024 * 1024 * 1024 * 1024)).toBe('5 TB');
    expect(formatSize(2048 * 1024 * 1024 * 1024 * 1024)).toBe('2048 TB');
  });

  // S3 listings can omit Size, and parseObjects already tolerates malformed
  // entries. An unknown size must render as nothing at all, never 'NaN MB'.
  it.each([[undefined], [null], [NaN], [-1], ['1024'], [{}], [Infinity]])(
    'returns an empty string for the unusable input %p',
    (bad) => {
      expect(formatSize(bad)).toBe('');
    },
  );
});
