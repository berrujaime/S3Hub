// Unit tests for the connection repository (data layer).
// SecureStore is mocked so these tests run without a device.

import * as SecureStore from 'expo-secure-store';
import * as repo from '../connectionRepository';

// Mock expo-secure-store: all storage calls are jest mocks we can assert on.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('connectionRepository', () => {
  describe('getConnections', () => {
    it('parses the stored JSON array under the "connections" key', async () => {
      const connections = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }];
      SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(connections));

      const result = await repo.getConnections();

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('connections');
      expect(result).toEqual(connections);
    });

    it('returns an empty array when nothing is stored', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);

      const result = await repo.getConnections();

      expect(result).toEqual([]);
    });
  });

  describe('saveConnections', () => {
    it('JSON-serializes the array under the "connections" key', async () => {
      const connections = [{ id: '1' }];

      await repo.saveConnections(connections);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'connections',
        JSON.stringify(connections),
      );
    });
  });

  describe('getCurrentConnection', () => {
    it('parses the stored JSON object under the "currentConnection" key', async () => {
      const connection = { id: '1', name: 'a' };
      SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(connection));

      const result = await repo.getCurrentConnection();

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('currentConnection');
      expect(result).toEqual(connection);
    });

    it('returns null when nothing is stored', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);

      const result = await repo.getCurrentConnection();

      expect(result).toBeNull();
    });
  });

  describe('saveCurrentConnection', () => {
    it('JSON-serializes the object under the "currentConnection" key', async () => {
      const connection = { id: '1' };

      await repo.saveCurrentConnection(connection);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'currentConnection',
        JSON.stringify(connection),
      );
    });
  });

  describe('clearCurrentConnection', () => {
    it('deletes the "currentConnection" key', async () => {
      await repo.clearCurrentConnection();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('currentConnection');
    });
  });

  describe('getCurrentBucket', () => {
    it('returns the plain string under the "currentBucket" key', async () => {
      SecureStore.getItemAsync.mockResolvedValue('my-bucket');

      const result = await repo.getCurrentBucket();

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('currentBucket');
      expect(result).toBe('my-bucket');
    });

    it('returns null when nothing is stored', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);

      const result = await repo.getCurrentBucket();

      expect(result).toBeNull();
    });
  });

  describe('saveCurrentBucket', () => {
    it('stores the plain string under the "currentBucket" key', async () => {
      await repo.saveCurrentBucket('my-bucket');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('currentBucket', 'my-bucket');
    });
  });

  describe('clearCurrentBucket', () => {
    it('deletes the "currentBucket" key', async () => {
      await repo.clearCurrentBucket();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('currentBucket');
    });
  });

  describe('getLanguage', () => {
    it('returns the plain string under the "appLanguage" key', async () => {
      SecureStore.getItemAsync.mockResolvedValue('es');

      const result = await repo.getLanguage();

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('appLanguage');
      expect(result).toBe('es');
    });

    it('returns null when nothing is stored', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);

      const result = await repo.getLanguage();

      expect(result).toBeNull();
    });
  });

  describe('saveLanguage', () => {
    it('stores the plain string under the "appLanguage" key', async () => {
      await repo.saveLanguage('en');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('appLanguage', 'en');
    });
  });

  describe('getPreview', () => {
    it('returns the plain string under the "preview" key', async () => {
      SecureStore.getItemAsync.mockResolvedValue('true');

      const result = await repo.getPreview();

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('preview');
      expect(result).toBe('true');
    });

    it('returns null when nothing is stored', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);

      const result = await repo.getPreview();

      expect(result).toBeNull();
    });
  });

  describe('savePreview', () => {
    it('stores the plain string under the "preview" key', async () => {
      await repo.savePreview('false');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('preview', 'false');
    });
  });

  describe('getTheme', () => {
    it('returns the plain string under the "appTheme" key', async () => {
      SecureStore.getItemAsync.mockResolvedValue('dark');

      const result = await repo.getTheme();

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('appTheme');
      expect(result).toBe('dark');
    });

    it('returns null when nothing is stored', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);

      const result = await repo.getTheme();

      expect(result).toBeNull();
    });
  });

  describe('saveTheme', () => {
    it('stores the plain string under the "appTheme" key', async () => {
      await repo.saveTheme('light');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('appTheme', 'light');
    });
  });
});
