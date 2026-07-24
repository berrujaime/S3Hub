// src/data/deviceLocale.js
//
// Thin adapter over expo-localization: the only place in the app that
// touches the native locale API directly, so domain/localeResolver.js can
// stay a pure function and every consumer mocks this one call instead of
// reaching into expo-localization's shape directly.
//
// Uses the current SDK 53 API (`getLocales()`) -- the legacy
// `Localization.locale`/`Localization.languageCode` constants are
// deprecated in favor of it.

import { getLocales } from 'expo-localization';

// Returns the device's current language code (e.g. 'en', 'es'), or null if
// unavailable. `getLocales()` is documented to always return at least one
// entry with a non-null `languageCode` on native platforms, but the
// optional chain keeps this safe under test doubles/web edge cases that
// don't uphold that guarantee.
export function getDeviceLocale() {
  return getLocales()[0]?.languageCode || null;
}
