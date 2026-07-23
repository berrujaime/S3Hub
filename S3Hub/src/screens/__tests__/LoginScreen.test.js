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
import {
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TextInput as RNTextInput,
} from 'react-native';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import LoginScreen from '../LoginScreen';
import { AuthContext } from '../../context/AuthContext';
import { validateCredentials } from '../../services/authService';
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

// canGoBack defaults to false (the pre-login root-stack case, where
// LoginScreen is the navigator's only screen); pass `{ canGoBack: () => true }`
// for the post-login "add connection from tabs" case.
const renderScreen = (navigationOverrides = {}) => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
    ...navigationOverrides,
  };
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

// Storj (the default selected provider) has a fixed region list and no
// extra fields, so exactly two native TextInputs render: accessKey then
// secretKey, in that declaration order.
const fillCredentials = () => {
  const inputs = screen.UNSAFE_getAllByType(RNTextInput);
  fireEvent.changeText(inputs[0], 'test-access-key');
  fireEvent.changeText(inputs[1], 'test-secret-key');
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

// Regression test for the dead `navigation.navigate('Connections')` call:
// that route only exists in ConnectionsStack (post-login), never in the
// pre-login root stack where LoginScreen is reachable as the sole screen.
// `canGoBack()` is the discriminator between the two cases (see
// AppNavigator.js / ConnectionSelectScreen.js): false in the root stack,
// true when LoginScreen is pushed onto ConnectionsStack via "add connection".
describe('LoginScreen post-login navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateCredentials.mockResolvedValue(true);
  });

  it('does not navigate on first login (root stack, canGoBack() is false) — the conditional root mounts MainTabs once currentConnection is set', async () => {
    const { navigation, addConnection, setActiveConnection } = renderScreen({
      canGoBack: jest.fn(() => false),
    });

    fillCredentials();
    fireEvent.press(screen.getByText(i18n.t('login')));

    await waitFor(() => expect(setActiveConnection).toHaveBeenCalled());
    expect(addConnection).toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('goes back to the Connections list when adding a connection from inside the tabs (canGoBack() is true)', async () => {
    const { navigation } = renderScreen({ canGoBack: jest.fn(() => true) });

    fillCredentials();
    fireEvent.press(screen.getByText(i18n.t('login')));

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

// Task 5.8: the secret-key field gets an eye toggle (show/hide) and both
// credential fields disable autocorrect/autocomplete so the OS never
// suggests, corrects, or stores S3 credentials.
describe('LoginScreen credential field hardening', () => {
  // Storj (the default provider) renders exactly two native TextInputs:
  // accessKey (index 0) then secretKey (index 1) — see fillCredentials.
  const getCredentialInputs = () => screen.UNSAFE_getAllByType(RNTextInput);

  it('masks the secret key by default and reveals it after pressing the eye toggle', async () => {
    renderScreen();

    expect(getCredentialInputs()[1].props.secureTextEntry).toBe(true);

    fireEvent.press(screen.getByLabelText(i18n.t('showSecretKey')));
    await waitFor(() =>
      expect(getCredentialInputs()[1].props.secureTextEntry).toBe(false)
    );

    // The toggle flips back: the label now announces "hide", and pressing it
    // re-masks the field.
    fireEvent.press(screen.getByLabelText(i18n.t('hideSecretKey')));
    await waitFor(() =>
      expect(getCredentialInputs()[1].props.secureTextEntry).toBe(true)
    );
  });

  it('disables autocorrect and autocomplete on both credential fields', () => {
    renderScreen();

    getCredentialInputs().forEach((input) => {
      expect(input.props.autoCorrect).toBe(false);
      expect(input.props.autoComplete).toBe('off');
      expect(input.props.autoCapitalize).toBe('none');
    });
  });
});
