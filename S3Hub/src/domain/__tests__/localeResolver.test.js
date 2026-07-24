import { resolveLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../localeResolver';

describe('resolveLocale', () => {
  describe('stored preference wins', () => {
    it('returns the stored locale when it is supported, regardless of device locale', () => {
      expect(
        resolveLocale({ storedLocale: 'es', deviceLocale: 'en-US' })
      ).toBe('es');
    });

    it('returns the stored locale even when there is no device locale at all', () => {
      expect(resolveLocale({ storedLocale: 'es', deviceLocale: null })).toBe('es');
    });

    it('falls through to device locale when the stored locale is unsupported', () => {
      // Defends against a corrupted/legacy stored value; the stored
      // preference is trusted only if it is one we actually ship.
      expect(
        resolveLocale({ storedLocale: 'fr', deviceLocale: 'es-MX' })
      ).toBe('es');
    });
  });

  describe('no stored preference: device locale is the default', () => {
    it('uses the device language code when it is supported', () => {
      expect(resolveLocale({ storedLocale: null, deviceLocale: 'es-ES' })).toBe('es');
    });

    it('matches on the base language subtag, ignoring region', () => {
      expect(resolveLocale({ storedLocale: null, deviceLocale: 'en-GB' })).toBe('en');
    });

    it('is case-insensitive', () => {
      expect(resolveLocale({ storedLocale: null, deviceLocale: 'ES-mx' })).toBe('es');
    });

    it('falls back to the default locale when the device locale is unsupported', () => {
      expect(resolveLocale({ storedLocale: null, deviceLocale: 'fr-FR' })).toBe('en');
    });

    it('falls back to the default locale when there is no device locale', () => {
      expect(resolveLocale({ storedLocale: null, deviceLocale: null })).toBe('en');
    });
  });

  it('accepts a custom supported list and default locale', () => {
    expect(
      resolveLocale({
        storedLocale: null,
        deviceLocale: 'de-DE',
        supportedLocales: ['de', 'fr'],
        defaultLocale: 'fr',
      })
    ).toBe('de');

    expect(
      resolveLocale({
        storedLocale: null,
        deviceLocale: 'it-IT',
        supportedLocales: ['de', 'fr'],
        defaultLocale: 'fr',
      })
    ).toBe('fr');
  });

  it('exports the app-wide supported locales and default locale', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'es']);
    expect(DEFAULT_LOCALE).toBe('en');
  });
});
