// Tests for AuthContext: logout and safe active-connection deletion.
//
// Covers two regressions fixed in this task:
//  (a) deleting the ACTIVE connection while other connections remain no
//      longer nulls out currentConnection (which would swap the navigator
//      root from MainTabs to Login mid-interaction) -- it activates another
//      remaining connection instead. Deleting the LAST connection still
//      falls through to `currentConnection = null`.
//  (b) `logout` clears both the in-memory and the persisted current
//      connection (and current bucket), without deleting any connection, so
//      a restart doesn't auto-sign back in but every saved connection is
//      still there afterwards.
//
// connectionRepository is mocked with explicit jest.fn() stubs (same
// rationale as BucketSelectScreen.test.js / LoginScreen.test.js: it wraps
// AsyncStorage/expo-secure-store, native modules that don't load outside a
// device runtime) so each test can assert on exactly which persistence calls
// AuthContext makes. data/deviceLocale (expo-localization) is mocked the
// same way -- see the "startup locale resolution" tests below for the
// device-locale-as-default behavior itself; domain/__tests__/localeResolver
// covers the underlying decision's branches exhaustively.

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthContext, AuthProvider } from '../AuthContext';
import * as connectionRepository from '../../data/connectionRepository';
import { getDeviceLocale } from '../../data/deviceLocale';

jest.mock('../../data/connectionRepository', () => ({
  getConnections: jest.fn(),
  saveConnections: jest.fn(),
  deleteConnection: jest.fn(),
  getCurrentConnection: jest.fn(),
  saveCurrentConnection: jest.fn(),
  clearCurrentConnection: jest.fn(),
  getCurrentBucket: jest.fn(),
  saveCurrentBucket: jest.fn(),
  clearCurrentBucket: jest.fn(),
  getLanguage: jest.fn(),
  saveLanguage: jest.fn(),
  getPreview: jest.fn(),
  savePreview: jest.fn(),
  getTheme: jest.fn(),
  saveTheme: jest.fn(),
}));

jest.mock('../../data/deviceLocale', () => ({
  getDeviceLocale: jest.fn(),
}));

const CONNECTION_A = { id: 'connA', service: 'aws', accessKey: 'AKIA-A' };
const CONNECTION_B = { id: 'connB', service: 'aws', accessKey: 'AKIA-B' };

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

const renderAuthContext = () =>
  renderHook(() => React.useContext(AuthContext), { wrapper });

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectionRepository.getConnections.mockResolvedValue([]);
    connectionRepository.getCurrentConnection.mockResolvedValue(null);
    connectionRepository.getCurrentBucket.mockResolvedValue(null);
    connectionRepository.getLanguage.mockResolvedValue('en');
    getDeviceLocale.mockReturnValue('en');
    connectionRepository.getPreview.mockResolvedValue('true');
    connectionRepository.getTheme.mockResolvedValue('system');
    connectionRepository.saveConnections.mockResolvedValue(undefined);
    connectionRepository.deleteConnection.mockResolvedValue(undefined);
    connectionRepository.saveCurrentConnection.mockResolvedValue(undefined);
    connectionRepository.clearCurrentConnection.mockResolvedValue(undefined);
    connectionRepository.saveCurrentBucket.mockResolvedValue(undefined);
    connectionRepository.clearCurrentBucket.mockResolvedValue(undefined);
  });

  describe('deleteConnection: safe active-connection deletion', () => {
    it('activates another remaining connection when the active one is deleted', async () => {
      connectionRepository.getConnections.mockResolvedValue([CONNECTION_A, CONNECTION_B]);
      connectionRepository.getCurrentConnection.mockResolvedValue(CONNECTION_A);

      const { result } = renderAuthContext();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.currentConnection.id).toBe('connA');

      await act(async () => {
        await result.current.deleteConnection('connA');
      });

      // The other remaining connection becomes active -- the navigator root
      // (which swaps to Login on currentConnection === null) never sees a
      // null in between, so the Files/Buckets tabs the user was on stay put.
      expect(result.current.currentConnection?.id).toBe('connB');
      expect(result.current.connections.map((c) => c.id)).toEqual(['connB']);
      expect(connectionRepository.deleteConnection).toHaveBeenCalledWith('connA');
      expect(connectionRepository.saveCurrentConnection).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'connB' })
      );
      expect(connectionRepository.clearCurrentConnection).not.toHaveBeenCalled();
    });

    it('falls through to no active connection when the last connection is deleted', async () => {
      connectionRepository.getConnections.mockResolvedValue([CONNECTION_A]);
      connectionRepository.getCurrentConnection.mockResolvedValue(CONNECTION_A);

      const { result } = renderAuthContext();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.deleteConnection('connA');
      });

      expect(result.current.currentConnection).toBeNull();
      expect(result.current.connections).toEqual([]);
      expect(connectionRepository.clearCurrentConnection).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears the in-memory and persisted current connection/bucket without deleting any connection', async () => {
      connectionRepository.getConnections.mockResolvedValue([CONNECTION_A, CONNECTION_B]);
      connectionRepository.getCurrentConnection.mockResolvedValue(CONNECTION_A);
      connectionRepository.getCurrentBucket.mockResolvedValue('my-bucket');

      const { result } = renderAuthContext();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.currentConnection?.id).toBe('connA');
      expect(result.current.currentBucket).toBe('my-bucket');

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.currentConnection).toBeNull();
      expect(result.current.currentBucket).toBeNull();
      // The stored connections themselves are untouched: logging out never
      // deletes a connection, it only deactivates the current one.
      expect(result.current.connections.map((c) => c.id)).toEqual(['connA', 'connB']);
      expect(connectionRepository.deleteConnection).not.toHaveBeenCalled();
      expect(connectionRepository.saveConnections).not.toHaveBeenCalled();
      expect(connectionRepository.clearCurrentConnection).toHaveBeenCalled();
      expect(connectionRepository.clearCurrentBucket).toHaveBeenCalled();
    });
  });

  describe('startup locale resolution', () => {
    it('uses the device locale as the default on a fresh install (no stored preference)', async () => {
      // Fresh install on an es-device: nothing stored yet, so the device
      // locale (which is supported) becomes the language, and is persisted
      // so it becomes the user's explicit preference from here on.
      connectionRepository.getLanguage.mockResolvedValue(null);
      getDeviceLocale.mockReturnValue('es');

      const { result } = renderAuthContext();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.language).toBe('es');
      expect(connectionRepository.saveLanguage).toHaveBeenCalledWith('es');
    });

    it('falls back to en on a fresh install when the device locale is unsupported', async () => {
      // Fresh install on an fr-device: the app only ships en/es, so it
      // falls back to the default rather than an untranslated locale.
      connectionRepository.getLanguage.mockResolvedValue(null);
      getDeviceLocale.mockReturnValue('fr');

      const { result } = renderAuthContext();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.language).toBe('en');
      expect(connectionRepository.saveLanguage).toHaveBeenCalledWith('en');
    });

    it('keeps the stored preference even when the device locale differs', async () => {
      // Existing user with a stored 'es' preference on an en-device: the
      // stored choice must win, and nothing gets re-persisted.
      connectionRepository.getLanguage.mockResolvedValue('es');
      getDeviceLocale.mockReturnValue('en');

      const { result } = renderAuthContext();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.language).toBe('es');
      expect(connectionRepository.saveLanguage).not.toHaveBeenCalled();
    });
  });
});
