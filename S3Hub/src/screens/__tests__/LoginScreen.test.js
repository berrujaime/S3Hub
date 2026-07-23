// src/screens/__tests__/LoginScreen.test.js
//
// Regression test for the reported bug where the keyboard covers the lower
// fields and the Login button. Keyboard-open geometry can't be asserted in
// jsdom/react-test-renderer (there's no real keyboard, so nothing actually
// shrinks the viewport) — so this test instead asserts the structural fix
// that makes reachability possible: the form is wrapped in a
// KeyboardAvoidingView, which in turn wraps a ScrollView configured with the
// props that keep it scrollable and keep Paper's Menu anchors tappable while
// the keyboard is up (`keyboardShouldPersistTaps="handled"`,
// `contentContainerStyle={{ flexGrow: 1 }}`).
import React from 'react';
import { StyleSheet, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import LoginScreen from '../LoginScreen';
import { AuthContext } from '../../context/AuthContext';
import { darkTheme } from '../../theme/theme';
import i18n from '../../locales/translations';

// Explicit factories (same rationale as BucketSelectScreen.test.js):
// authService pulls in @aws-sdk/client-s3, and AuthContext's module-level
// import of connectionRepository pulls in AsyncStorage/SecureStore native
// modules — none of which load outside a device runtime. The test never
// calls validateCredentials or the repository, it only needs LoginScreen to
// render and the AuthContext *object* to provide its own value.
jest.mock('../../services/authService', () => ({
  validateCredentials: jest.fn(),
}));
jest.mock('../../data/connectionRepository', () => ({}));

const renderScreen = () => {
  const navigation = { navigate: jest.fn() };
  const addConnection = jest.fn().mockResolvedValue(undefined);
  const setActiveConnection = jest.fn().mockResolvedValue(undefined);
  render(
    <PaperProvider theme={darkTheme}>
      <AuthContext.Provider value={{ addConnection, setActiveConnection }}>
        <LoginScreen navigation={navigation} />
      </AuthContext.Provider>
    </PaperProvider>
  );
  return { navigation, addConnection, setActiveConnection };
};

describe('LoginScreen keyboard avoidance', () => {
  it('wraps the form in a KeyboardAvoidingView using the platform-appropriate behavior', () => {
    renderScreen();

    const keyboardAvoidingView = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(keyboardAvoidingView.props.behavior).toBe(
      Platform.OS === 'ios' ? 'padding' : 'height'
    );
  });

  it('nests a ScrollView inside the KeyboardAvoidingView configured to stay scrollable and keep taps working with the keyboard open', () => {
    renderScreen();

    const keyboardAvoidingView = screen.UNSAFE_getByType(KeyboardAvoidingView);
    const scrollView = keyboardAvoidingView.findByType(ScrollView);

    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled');
    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle).flexGrow).toBe(1);
  });

  it('keeps the credential inputs and the Login button reachable inside the scrollable area', () => {
    renderScreen();

    const scrollView = screen.UNSAFE_getByType(ScrollView);
    const scoped = within(scrollView);

    // Paper's TextInput renders the label twice (floating label + the
    // input's own accessibility text), so assert presence via
    // getAllByText rather than the single-match getByText.
    expect(scoped.getAllByText(i18n.t('accessKey')).length).toBeGreaterThan(0);
    expect(scoped.getAllByText(i18n.t('secretKey')).length).toBeGreaterThan(0);
    expect(scoped.getByText(i18n.t('login'))).toBeTruthy();
  });
});
