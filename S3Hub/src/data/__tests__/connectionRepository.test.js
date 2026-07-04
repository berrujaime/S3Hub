// Unit tests for the connection repository (data layer).
//
// Storage layout under test:
//   - Legacy (pre-migration): SecureStore 'connections' (full array, secrets
//     included) and SecureStore 'currentConnection' (full object).
//   - Current: AsyncStorage 'connections_meta' (non-secret metadata array),
//     SecureStore 'conn_secret_<id>' (one {accessKey, secretKey} pair per
//     connection), AsyncStorage 'currentConnectionId' (id string only).
//
// Both expo-secure-store and @react-native-async-storage/async-storage are
// mocked with tiny in-memory fakes (keyed Maps) so tests can seed legacy
// state, drive the module through migration, and assert on the resulting
// storage shape realistically instead of chaining `mockResolvedValueOnce`.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as repo from '../connectionRepository';
import { deriveConnectionId } from '../../domain/cacheKeys';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const LEGACY_CONNECTIONS_KEY = 'connections';
const LEGACY_CURRENT_CONNECTION_KEY = 'currentConnection';
const META_KEY = 'connections_meta';
const SECRET_PREFIX = 'conn_secret_';
const CURRENT_CONNECTION_ID_KEY = 'currentConnectionId';

let secureStoreData;
let asyncStorageData;

beforeEach(() => {
  jest.clearAllMocks();
  secureStoreData = new Map();
  asyncStorageData = new Map();

  SecureStore.getItemAsync.mockImplementation(async (key) =>
    secureStoreData.has(key) ? secureStoreData.get(key) : null
  );
  SecureStore.setItemAsync.mockImplementation(async (key, value) => {
    secureStoreData.set(key, value);
  });
  SecureStore.deleteItemAsync.mockImplementation(async (key) => {
    secureStoreData.delete(key);
  });

  AsyncStorage.getItem.mockImplementation(async (key) =>
    asyncStorageData.has(key) ? asyncStorageData.get(key) : null
  );
  AsyncStorage.setItem.mockImplementation(async (key, value) => {
    asyncStorageData.set(key, value);
  });
  AsyncStorage.removeItem.mockImplementation(async (key) => {
    asyncStorageData.delete(key);
  });
});

// Helper: read back the parsed meta array currently stored in AsyncStorage.
function readMetas() {
  const raw = asyncStorageData.get(META_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Helper: read back a connection's stored secret from the fake SecureStore.
function readSecret(id) {
  const raw = secureStoreData.get(SECRET_PREFIX + id);
  return raw ? JSON.parse(raw) : null;
}

describe('connectionRepository', () => {
  describe('getConnections — fresh install / already-migrated', () => {
    it('returns an empty array when nothing is stored anywhere', async () => {
      const result = await repo.getConnections();
      expect(result).toEqual([]);
    });

    it('hydrates full connections from already-split storage without touching legacy keys', async () => {
      const meta = { id: 'abc', service: 'aws', region: 'us-east-1', preview: false };
      asyncStorageData.set(META_KEY, JSON.stringify([meta]));
      secureStoreData.set(
        SECRET_PREFIX + 'abc',
        JSON.stringify({ accessKey: 'AK', secretKey: 'SK' })
      );

      const result = await repo.getConnections();

      expect(result).toEqual([{ ...meta, accessKey: 'AK', secretKey: 'SK' }]);
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('returns an empty array when the stored metadata is corrupt, without throwing', async () => {
      asyncStorageData.set(META_KEY, '{not valid json');

      const result = await repo.getConnections();

      expect(result).toEqual([]);
    });

    it('returns an empty array when the stored metadata parses but is not an array', async () => {
      asyncStorageData.set(META_KEY, JSON.stringify({ not: 'an array' }));

      const result = await repo.getConnections();

      expect(result).toEqual([]);
    });

    it('tolerates a meta entry whose secret is missing (returns undefined accessKey/secretKey)', async () => {
      asyncStorageData.set(META_KEY, JSON.stringify([{ id: 'orphan-meta' }]));

      const result = await repo.getConnections();

      expect(result).toHaveLength(1);
      expect(result[0].accessKey).toBeUndefined();
      expect(result[0].secretKey).toBeUndefined();
    });
  });

  describe('legacy single-blob migration', () => {
    it('migrates secrets to per-id SecureStore keys, metadata to AsyncStorage, and deletes the legacy key', async () => {
      const legacy = [
        { id: 'c1', service: 'aws', region: 'us-east-1', accessKey: 'AK1', secretKey: 'SK1' },
        { id: 'c2', service: 'storj', region: 'eu1', accessKey: 'AK2', secretKey: 'SK2' },
      ];
      secureStoreData.set(LEGACY_CONNECTIONS_KEY, JSON.stringify(legacy));

      await repo.getConnections();

      // Legacy blob is gone.
      expect(secureStoreData.has(LEGACY_CONNECTIONS_KEY)).toBe(false);

      // Each connection's secret lives under its own SecureStore key.
      expect(readSecret('c1')).toEqual({ accessKey: 'AK1', secretKey: 'SK1' });
      expect(readSecret('c2')).toEqual({ accessKey: 'AK2', secretKey: 'SK2' });

      // Metadata (no secrets) lives in AsyncStorage.
      const metas = readMetas();
      expect(metas).toHaveLength(2);
      expect(metas.find((m) => m.id === 'c1').accessKey).toBeUndefined();
      expect(metas.find((m) => m.id === 'c1').secretKey).toBeUndefined();
      expect(metas.find((m) => m.id === 'c1').region).toBe('us-east-1');
    });

    it('hydrates full connections (with secrets) via getConnections() after migration', async () => {
      const legacy = [
        { id: 'c1', service: 'aws', region: 'us-east-1', accessKey: 'AK1', secretKey: 'SK1' },
      ];
      secureStoreData.set(LEGACY_CONNECTIONS_KEY, JSON.stringify(legacy));

      const result = await repo.getConnections();

      expect(result).toEqual([
        expect.objectContaining({
          id: 'c1',
          service: 'aws',
          region: 'us-east-1',
          accessKey: 'AK1',
          secretKey: 'SK1',
        }),
      ]);
    });

    it('backfills a stable id for legacy connections stored without one', async () => {
      const legacy = [{ name: 'a', service: 'aws', accessKey: 'AK1', region: 'us-east-1' }];
      secureStoreData.set(LEGACY_CONNECTIONS_KEY, JSON.stringify(legacy));

      const result = await repo.getConnections();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(deriveConnectionId(legacy[0]));
      expect(result[0].accessKey).toBe('AK1');
    });

    it('deduplicates colliding ids by suffixing the second and later occurrences with their array index', async () => {
      const duplicate = { service: 'aws', accessKey: 'AK-dup', region: 'us-east-1' };
      const legacy = [{ ...duplicate }, { ...duplicate }, { ...duplicate }];
      secureStoreData.set(LEGACY_CONNECTIONS_KEY, JSON.stringify(legacy));

      const result = await repo.getConnections();

      const baseId = deriveConnectionId(duplicate);
      expect(result[0].id).toBe(baseId);
      expect(result[1].id).toBe(`${baseId}-1`);
      expect(result[2].id).toBe(`${baseId}-2`);
      expect(new Set(result.map((c) => c.id)).size).toBe(3);
      // Each deduped connection gets its own distinct secret key.
      expect(readSecret(baseId)).toBeTruthy();
      expect(readSecret(`${baseId}-1`)).toBeTruthy();
      expect(readSecret(`${baseId}-2`)).toBeTruthy();
    });

    it('drops a corrupt legacy blob without throwing, and does not populate the split storage', async () => {
      secureStoreData.set(LEGACY_CONNECTIONS_KEY, '{not valid json');

      const result = await repo.getConnections();

      expect(result).toEqual([]);
      expect(secureStoreData.has(LEGACY_CONNECTIONS_KEY)).toBe(false);
      expect(asyncStorageData.has(META_KEY)).toBe(false);
    });

    it('is idempotent: a second getConnections() call performs no further migration work', async () => {
      const legacy = [{ id: 'c1', service: 'aws', accessKey: 'AK1', secretKey: 'SK1' }];
      secureStoreData.set(LEGACY_CONNECTIONS_KEY, JSON.stringify(legacy));

      const first = await repo.getConnections();
      jest.clearAllMocks();
      const second = await repo.getConnections();

      expect(second).toEqual(first);
      // No new writes/deletes happened on the second call — the legacy key
      // is already gone, so migration is a no-op read.
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('is concurrency-safe: two parallel getConnections() calls do not double-migrate', async () => {
      const legacy = [{ id: 'c1', service: 'aws', accessKey: 'AK1', secretKey: 'SK1' }];
      secureStoreData.set(LEGACY_CONNECTIONS_KEY, JSON.stringify(legacy));

      const [a, b] = await Promise.all([repo.getConnections(), repo.getConnections()]);

      expect(a).toEqual(b);
      // The secret must have been written exactly once, not twice.
      const secretWrites = SecureStore.setItemAsync.mock.calls.filter(([key]) =>
        key.startsWith(SECRET_PREFIX)
      );
      expect(secretWrites).toHaveLength(1);
    });
  });

  describe('saveConnections', () => {
    it('writes 20 connections as 20 separate secret keys, each well under the 2048-byte SecureStore limit', async () => {
      const connections = Array.from({ length: 20 }, (_, i) => ({
        id: `id-${i}`,
        service: 'aws',
        region: 'us-east-1',
        accessKey: `AK${i}`,
        secretKey: `SECRETKEY${i}`,
      }));

      await repo.saveConnections(connections);

      const secretWrites = SecureStore.setItemAsync.mock.calls.filter(([key]) =>
        key.startsWith(SECRET_PREFIX)
      );
      expect(secretWrites).toHaveLength(20);
      for (const [, value] of secretWrites) {
        // Every character here is ASCII (JSON of accessKey/secretKey), so
        // JS string length is exactly the UTF-8 byte length.
        expect(value.length).toBeLessThan(2048);
      }
      expect(readMetas()).toHaveLength(20);
    });

    it('removes secrets for connections no longer present in the new list', async () => {
      await repo.saveConnections([
        { id: 'keep', accessKey: 'AK1', secretKey: 'SK1' },
        { id: 'drop', accessKey: 'AK2', secretKey: 'SK2' },
      ]);
      expect(readSecret('keep')).toBeTruthy();
      expect(readSecret('drop')).toBeTruthy();

      await repo.saveConnections([{ id: 'keep', accessKey: 'AK1', secretKey: 'SK1' }]);

      expect(readSecret('keep')).toBeTruthy();
      expect(readSecret('drop')).toBeNull();
      expect(readMetas()).toEqual([expect.objectContaining({ id: 'keep' })]);
    });

    it('does not leak accessKey/secretKey into the AsyncStorage metadata', async () => {
      await repo.saveConnections([{ id: 'c1', accessKey: 'AK', secretKey: 'SK', region: 'r' }]);

      const [, storedMetaJson] = AsyncStorage.setItem.mock.calls.find(([k]) => k === META_KEY);
      expect(storedMetaJson).not.toContain('AK');
      expect(storedMetaJson).not.toContain('SK');
    });
  });

  describe('deleteConnection', () => {
    it('removes both the metadata entry and the secret key for the given id', async () => {
      await repo.saveConnections([
        { id: 'keep', accessKey: 'AK1', secretKey: 'SK1' },
        { id: 'gone', accessKey: 'AK2', secretKey: 'SK2' },
      ]);

      await repo.deleteConnection('gone');

      expect(readMetas()).toEqual([expect.objectContaining({ id: 'keep' })]);
      expect(readSecret('gone')).toBeNull();
      expect(readSecret('keep')).toBeTruthy();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECRET_PREFIX + 'gone');
    });

    it('leaves storage unchanged (aside from the removed entry) when deleting an unknown id', async () => {
      await repo.saveConnections([{ id: 'keep', accessKey: 'AK1', secretKey: 'SK1' }]);

      await repo.deleteConnection('does-not-exist');

      expect(readMetas()).toEqual([expect.objectContaining({ id: 'keep' })]);
      expect(readSecret('keep')).toBeTruthy();
    });
  });

  describe('current connection', () => {
    it('getCurrentConnection returns null when nothing is stored', async () => {
      const result = await repo.getCurrentConnection();
      expect(result).toBeNull();
    });

    it('saveCurrentConnection stores only the id (not the full object) in AsyncStorage', async () => {
      const connection = { id: 'c1', accessKey: 'AK', secretKey: 'SK', region: 'us-east-1' };

      await repo.saveCurrentConnection(connection);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(CURRENT_CONNECTION_ID_KEY, 'c1');
      // The secret must never be duplicated into a second SecureStore value.
      const currentConnectionSecretWrite = SecureStore.setItemAsync.mock.calls.find(
        ([key]) => key === LEGACY_CURRENT_CONNECTION_KEY
      );
      expect(currentConnectionSecretWrite).toBeUndefined();
    });

    it('getCurrentConnection hydrates the full object (with secret) from getConnections()', async () => {
      await repo.saveConnections([{ id: 'c1', accessKey: 'AK', secretKey: 'SK', region: 'r1' }]);
      await repo.saveCurrentConnection({ id: 'c1' });

      const result = await repo.getCurrentConnection();

      expect(result).toEqual(
        expect.objectContaining({ id: 'c1', accessKey: 'AK', secretKey: 'SK', region: 'r1' })
      );
    });

    it('getCurrentConnection returns null when the stored id matches no connection', async () => {
      await repo.saveCurrentConnection({ id: 'ghost' });

      const result = await repo.getCurrentConnection();

      expect(result).toBeNull();
    });

    it('clearCurrentConnection removes the stored current-connection id', async () => {
      await repo.saveCurrentConnection({ id: 'c1' });

      await repo.clearCurrentConnection();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(CURRENT_CONNECTION_ID_KEY);
      expect(await repo.getCurrentConnection()).toBeNull();
    });

    it('migrates a legacy full-object current connection to id-only form and deletes the legacy key', async () => {
      const legacyCurrent = {
        service: 'aws',
        accessKey: 'AK-current',
        region: 'us-east-1',
        secretKey: 'SK-current',
      };
      const legacyConnections = [{ ...legacyCurrent }];
      secureStoreData.set(LEGACY_CONNECTIONS_KEY, JSON.stringify(legacyConnections));
      secureStoreData.set(LEGACY_CURRENT_CONNECTION_KEY, JSON.stringify(legacyCurrent));

      const current = await repo.getCurrentConnection();

      expect(secureStoreData.has(LEGACY_CURRENT_CONNECTION_KEY)).toBe(false);
      const expectedId = deriveConnectionId(legacyCurrent);
      expect(current).toEqual(
        expect.objectContaining({ id: expectedId, accessKey: 'AK-current' })
      );
      expect(asyncStorageData.get(CURRENT_CONNECTION_ID_KEY)).toBe(expectedId);
    });

    it('drops a legacy current connection that matches nothing in the migrated list (resolves to no active connection)', async () => {
      secureStoreData.set(
        LEGACY_CURRENT_CONNECTION_KEY,
        JSON.stringify({ service: 'aws', accessKey: 'stale', region: 'us-east-1' })
      );
      // No legacy 'connections' blob at all — the stale current matches nothing.

      const current = await repo.getCurrentConnection();

      expect(secureStoreData.has(LEGACY_CURRENT_CONNECTION_KEY)).toBe(false);
      expect(current).toBeNull();
    });

    it('drops a corrupt legacy current-connection value without throwing', async () => {
      secureStoreData.set(LEGACY_CURRENT_CONNECTION_KEY, '{not valid json');

      const current = await repo.getCurrentConnection();

      expect(current).toBeNull();
      expect(secureStoreData.has(LEGACY_CURRENT_CONNECTION_KEY)).toBe(false);
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
