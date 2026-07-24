// src/domain/localeResolver.js
//
// Pure decision of which locale the app should use at startup. A
// previously-stored user preference always wins; absent one, the device's
// current locale is used as the default, as long as it is one of the
// locales the app ships translations for -- otherwise fall back to
// `DEFAULT_LOCALE`.
//
// No React/Expo/AWS imports: callers at the boundary (see
// data/deviceLocale.js, which wraps expo-localization) are responsible for
// reading the actual stored preference and device locale and passing them
// in here as plain strings, so this decision stays 100% unit-testable
// without a device runtime.

export const SUPPORTED_LOCALES = ['en', 'es'];
export const DEFAULT_LOCALE = 'en';

// `storedLocale`/`deviceLocale` may be a full BCP 47 tag (e.g. 'es-MX') or
// just a bare language code ('es'); only the language subtag before any
// '-' is compared against `supportedLocales`, case-insensitively.
function toSupportedLanguageCode(locale, supportedLocales) {
  if (!locale) return null;
  const languageCode = String(locale).split('-')[0].toLowerCase();
  return supportedLocales.includes(languageCode) ? languageCode : null;
}

export function resolveLocale({
  storedLocale,
  deviceLocale,
  supportedLocales = SUPPORTED_LOCALES,
  defaultLocale = DEFAULT_LOCALE,
} = {}) {
  const stored = toSupportedLanguageCode(storedLocale, supportedLocales);
  if (stored) return stored;

  const device = toSupportedLanguageCode(deviceLocale, supportedLocales);
  if (device) return device;

  return defaultLocale;
}
