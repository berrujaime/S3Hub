// Regression test for Task 5.5: there was no logout affordance anywhere in
// the app. Asserts SettingsScreen renders a logout entry (i18n key
// `logout`) and that pressing it calls AuthContext's `logout` -- which, via
// the AppNavigator's conditional root (currentConnection === null -> Login),
// is what actually signs the user out.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import SettingsScreen from '../SettingsScreen';
import { AuthContext } from '../../context/AuthContext';
import { darkTheme } from '../../theme/theme';
import i18n from '../../locales/translations';

// Explicit factory (same rationale as BucketSelectScreen.test.js /
// LoginScreen.test.js): AuthContext's module-level import of
// connectionRepository pulls in AsyncStorage/SecureStore native modules that
// don't load outside a device runtime. The test only needs the AuthContext
// *object* to provide its own value, never the real provider.
jest.mock('../../data/connectionRepository', () => ({}));

const renderScreen = (overrides = {}) => {
  const logout = jest.fn();
  const value = {
    language: 'en',
    changeLanguage: jest.fn(),
    preview: 'true',
    changePreview: jest.fn(),
    theme: 'system',
    changeTheme: jest.fn(),
    logout,
    ...overrides,
  };
  render(
    <PaperProvider theme={darkTheme}>
      <AuthContext.Provider value={value}>
        <SettingsScreen />
      </AuthContext.Provider>
    </PaperProvider>,
  );
  return { logout };
};

describe('SettingsScreen logout', () => {
  it('renders a logout entry', () => {
    renderScreen();

    expect(screen.getByText(i18n.t('logout'))).toBeTruthy();
  });

  it('calls AuthContext.logout when pressed', () => {
    const { logout } = renderScreen();

    fireEvent.press(screen.getByText(i18n.t('logout')));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
