// src/screens/__tests__/ConnectionSelectScreen.test.js
//
// Regression test for Task 5.6: the selection handler used to compare
// connections by `accessKey` with a dead conditional (both branches
// navigated) and an unguarded `currentConnection` (crashed when null). It
// now compares by the stable `id` (Tasks 1.5/1.6) and, crucially, skips
// re-calling `setActiveConnection` when the tapped connection is already
// active -- setActiveConnection() unconditionally resets `currentBucket` to
// null, so calling it for a no-op selection would needlessly kick the user
// out of an already-selected bucket.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import ConnectionSelectScreen from '../ConnectionSelectScreen';
import { AuthContext } from '../../context/AuthContext';
import { darkTheme } from '../../theme/theme';
import i18n from '../../locales/translations';

// Explicit factory (same rationale as BucketSelectScreen.test.js /
// SettingsScreen.test.js): AuthContext's module-level import of
// connectionRepository pulls in AsyncStorage/SecureStore native modules that
// don't load outside a device runtime. The test only needs the AuthContext
// *object* to provide its own value, never the real provider.
jest.mock('../../data/connectionRepository', () => ({}));

const ACTIVE_CONNECTION = {
  id: 'conn-1',
  service: 'aws',
  region: 'eu-west-1',
  accessKey: 'AKIA-ACTIVE',
};

const OTHER_CONNECTION = {
  id: 'conn-2',
  service: 'storj',
  region: 'us1',
  accessKey: 'AKIA-OTHER',
};

const renderScreen = ({
  currentConnection = ACTIVE_CONNECTION,
  connections = [ACTIVE_CONNECTION, OTHER_CONNECTION],
} = {}) => {
  const navigation = { navigate: jest.fn() };
  const setActiveConnection = jest.fn().mockResolvedValue(undefined);
  const deleteConnection = jest.fn();
  render(
    <PaperProvider theme={darkTheme}>
      <AuthContext.Provider
        value={{
          connections,
          currentConnection,
          setActiveConnection,
          deleteConnection,
        }}
      >
        <ConnectionSelectScreen navigation={navigation} />
      </AuthContext.Provider>
    </PaperProvider>
  );
  return { navigation, setActiveConnection };
};

describe('ConnectionSelectScreen connection selection', () => {
  it('does not call setActiveConnection when selecting the already-active connection, but still navigates', async () => {
    const { navigation, setActiveConnection } = renderScreen();

    fireEvent.press(screen.getByText('AWS S3'));
    // waitFor (rather than a bare await Promise.resolve()) flushes the
    // async handler INSIDE act(), which also covers Paper icons' own
    // font-load state update — a bare microtask await leaves that update
    // outside act() and floods the output with act() warnings.
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('BucketsTab'));

    expect(setActiveConnection).not.toHaveBeenCalled();
  });

  it('calls setActiveConnection when selecting a different connection', async () => {
    const { navigation, setActiveConnection } = renderScreen();

    fireEvent.press(screen.getByText('Storj'));
    await waitFor(() => expect(setActiveConnection).toHaveBeenCalledWith(OTHER_CONNECTION));

    expect(navigation.navigate).toHaveBeenCalledWith('BucketsTab');
  });

  it('does not crash and calls setActiveConnection when there is no active connection yet', async () => {
    const { navigation, setActiveConnection } = renderScreen({ currentConnection: null });

    fireEvent.press(screen.getByText('AWS S3'));
    await waitFor(() => expect(setActiveConnection).toHaveBeenCalledWith(ACTIVE_CONNECTION));

    expect(navigation.navigate).toHaveBeenCalledWith('BucketsTab');
  });
});

// Task 5.8: on first run (no saved connections) the screen used to render a
// blank list under the title, with nothing pointing the user at the add FAB.
describe('ConnectionSelectScreen first-run empty state', () => {
  it('shows the empty-state title and hint when there are no connections', () => {
    renderScreen({ currentConnection: null, connections: [] });

    expect(screen.getByText(i18n.t('noConnectionsTitle'))).toBeTruthy();
    expect(screen.getByText(i18n.t('noConnectionsHint'))).toBeTruthy();
  });

  it('does not show the empty state when connections exist', () => {
    renderScreen();

    expect(screen.queryByText(i18n.t('noConnectionsTitle'))).toBeNull();
    expect(screen.queryByText(i18n.t('noConnectionsHint'))).toBeNull();
  });
});
