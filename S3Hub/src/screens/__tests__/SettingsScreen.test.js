// Tests for SettingsScreen's three preference selects, and for the DELIBERATE
// absence of a logout entry.
//
// History worth keeping: Task 5.5 added a logout button here, on the reasoning
// that the app had no sign-out affordance. It was removed again as redundant —
// deleting a connection is the app's single sign-out path, and
// AuthContext.deleteConnection already clears the active connection/bucket
// (in memory and persisted) when the deleted one was active and none remain.
// The last test below keeps it from creeping back.
//
// The selects themselves were `@react-native-picker/picker` until its Android
// popup proved untheme-able (white native popup + near-white themed text =
// invisible options in dark mode); they are `ThemedSelect` now.
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
  const changeLanguage = jest.fn();
  const changePreview = jest.fn();
  const changeTheme = jest.fn();
  const value = {
    language: 'en',
    changeLanguage,
    preview: 'true',
    changePreview,
    theme: 'system',
    changeTheme,
    ...overrides,
  };
  render(
    <PaperProvider theme={darkTheme}>
      <AuthContext.Provider value={value}>
        <SettingsScreen />
      </AuthContext.Provider>
    </PaperProvider>,
  );
  return { changeLanguage, changePreview, changeTheme };
};

describe('SettingsScreen preference selects', () => {
  it('renders all three selects showing their current values', () => {
    renderScreen();

    expect(screen.getByTestId('language-select')).toBeTruthy();
    expect(screen.getByTestId('preview-select')).toBeTruthy();
    expect(screen.getByTestId('theme-select')).toBeTruthy();

    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText(i18n.t('optionYes'))).toBeTruthy();
    expect(screen.getByText(i18n.t('themeSystem'))).toBeTruthy();
  });

  it('reports a language change', () => {
    const { changeLanguage } = renderScreen();

    fireEvent.press(screen.getByTestId('language-select'));
    fireEvent.press(screen.getByText('Español'));

    expect(changeLanguage).toHaveBeenCalledWith('es');
  });

  it('reports a theme change', () => {
    const { changeTheme } = renderScreen();

    fireEvent.press(screen.getByTestId('theme-select'));
    fireEvent.press(screen.getByText(i18n.t('themeDark')));

    expect(changeTheme).toHaveBeenCalledWith('dark');
  });

  it('reports a preview toggle', () => {
    const { changePreview } = renderScreen();

    fireEvent.press(screen.getByTestId('preview-select'));
    fireEvent.press(screen.getByText(i18n.t('optionNo')));

    expect(changePreview).toHaveBeenCalledWith('false');
  });
});

describe('SettingsScreen has no logout entry', () => {
  it('offers no sign-out affordance separate from deleting a connection', () => {
    renderScreen();

    // Neither the removed i18n key's English text nor its Spanish text.
    expect(screen.queryByText('Log out')).toBeNull();
    expect(screen.queryByText('Cerrar sesión')).toBeNull();
  });
});
