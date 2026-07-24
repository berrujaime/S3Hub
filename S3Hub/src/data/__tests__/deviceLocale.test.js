// Unit tests for the device-locale adapter (data layer). expo-localization
// is mocked so the module can be exercised without a device runtime -- see
// domain/__tests__/localeResolver.test.js for the actual locale-selection
// decision this adapter feeds into.

import { getLocales } from 'expo-localization';
import { getDeviceLocale } from '../deviceLocale';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(),
}));

describe('getDeviceLocale', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns the first locale's language code", () => {
    getLocales.mockReturnValue([{ languageCode: 'es', languageTag: 'es-MX' }]);
    expect(getDeviceLocale()).toBe('es');
  });

  it('returns null when the language code is null', () => {
    getLocales.mockReturnValue([{ languageCode: null, languageTag: 'und' }]);
    expect(getDeviceLocale()).toBeNull();
  });

  it('returns null when getLocales() returns an empty array', () => {
    getLocales.mockReturnValue([]);
    expect(getDeviceLocale()).toBeNull();
  });
});
