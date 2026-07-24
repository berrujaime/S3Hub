// Tests for src/locales/translations.js.
//
// (Important I-3, whole-branch review): `i18n.fallbacks = true` is a v3
// i18n-js property. The installed i18n-js 4.5.3 reads `enableFallback`
// instead (defaults to false -- see
// node_modules/i18n-js/dist/import/I18n.js's DEFAULT_I18N_OPTIONS and
// constructor), so the old assignment silently did nothing: a key missing
// from the active locale rendered as a raw "[missing ... translation]"
// string instead of falling back to the English string. This file asserts
// the real flag is set, and formalizes the manual en/es key-parity check
// (69/69 keys at the time of the Task 4 audit) as an automated test so a
// future key added to only one locale fails CI instead of shipping silently.
import { I18n } from 'i18n-js';
import i18n from '../translations';

// Recursively collects every leaf key path (dot-joined) of a translations
// object, e.g. { a: { b: 'x' } } -> ['a.b']. Every value in this app's en/es
// objects is currently a flat string, but walking recursively (rather than a
// plain Object.keys(...)) keeps the parity check correct if a nested group
// is ever introduced, instead of only comparing the top level.
function collectKeyPaths(obj, prefix = '') {
  return Object.keys(obj).flatMap((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === 'object') {
      return collectKeyPaths(value, path);
    }
    return [path];
  });
}

describe('translations', () => {
  it('ships an identical set of keys for en and es (locale parity)', () => {
    // Read off the shared i18n singleton's own store (i18n.translations),
    // rather than re-importing private `en`/`es` objects, so the test
    // exercises exactly what the app ships without requiring new exports
    // from translations.js.
    const enKeys = collectKeyPaths(i18n.translations.en).sort();
    const esKeys = collectKeyPaths(i18n.translations.es).sort();

    expect(enKeys.length).toBeGreaterThan(0);
    expect(esKeys).toEqual(enKeys);
  });

  it('enables the i18n-js v4 fallback flag (enableFallback), not the dead v3 `fallbacks` property', () => {
    expect(i18n.enableFallback).toBe(true);
  });

  it('falls back to the defaultLocale (en) string when a key is missing from the active locale', () => {
    // A fresh, throwaway I18n instance -- not the shared app singleton --
    // so this never mutates the real, shipped en/es objects with a
    // test-only key.
    const testI18n = new I18n(
      { en: { onlyInEnglish: 'English only' }, es: {} },
      { defaultLocale: 'en', enableFallback: true, locale: 'es' },
    );

    expect(testI18n.t('onlyInEnglish')).toBe('English only');
  });
});
