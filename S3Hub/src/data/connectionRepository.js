// Data-layer repository for connection persistence.
//
// Storage layout: a connection's SECRET (accessKey/secretKey) is stored
// under its own expo-secure-store key (`conn_secret_<id>`), while its
// non-secret METADATA (service, region, endpoint, ...) lives in a single
// array in AsyncStorage (`connections_meta`). This fixes a bug in the
// previous single-blob format, where the entire connections array
// (including every secret) was serialized into ONE SecureStore value:
// SecureStore warns/fails once a value exceeds ~2048 bytes, so around
// 8-12 saved connections would silently fail to persist. Each
// `conn_secret_<id>` value is only ~150-250 bytes, always comfortably under
// the limit, no matter how many connections are saved.
//
// A one-time, transparent migration (see migrateIfNeeded below) converts
// any pre-existing single-blob storage — both the legacy 'connections' key
// and the legacy standalone 'currentConnection' key — into this format the
// first time either is read, then deletes the legacy keys. This module is
// the single source of truth for all of these key names and formats;
// AuthContext and screens must go through the functions below instead of
// touching SecureStore/AsyncStorage directly.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deriveConnectionId, reconcileCurrentConnection } from '../domain/cacheKeys';
import { toStorageEntry, fromStorageEntry } from '../domain/connectionStorage';

// Legacy (pre-refactor) SecureStore keys. Each held a full JSON blob,
// secrets included. Read once by migrateIfNeeded(), then deleted.
const LEGACY_CONNECTIONS_KEY = 'connections';
const LEGACY_CURRENT_CONNECTION_KEY = 'currentConnection';

// Current storage keys.
const META_KEY = 'connections_meta'; // AsyncStorage: array of non-secret metadata.
const SECRET_PREFIX = 'conn_secret_'; // SecureStore: one {accessKey, secretKey} per connection.
const CURRENT_CONNECTION_ID_KEY = 'currentConnectionId'; // AsyncStorage: id string only.

// Other SecureStore keys, unaffected by this refactor.
const KEYS = {
  CURRENT_BUCKET: 'currentBucket',
  LANGUAGE: 'appLanguage',
  PREVIEW: 'preview',
  THEME: 'appTheme',
  // Two keys rather than one composite 'modified:desc' value: one key per
  // preference is this file's existing convention, each value validates
  // independently (see domain/fileSorting's resolvers), and there is no
  // packed format to migrate later.
  SORT_CRITERION: 'sortCriterion',
  SORT_DIRECTION: 'sortDirection',
};

// Backfills a missing or duplicate `id` on each connection. Connections
// stored by the pre-refactor app version have `id === undefined`, which
// causes cache-namespace collisions (see domain/cacheKeys.getCacheKey) and
// breaks delete/active-highlight (both compare by `id`); it would also make
// two such connections collide on the same `conn_secret_<id>` key.
//
// If two connections end up with the same id (either two legacy connections
// with identical service/accessKey/region/endpoint, or — in principle — a
// stored duplicate explicit id), the id would no longer be unique. We keep
// ids deterministic AND unique by suffixing the second and later occurrences
// with their array index (e.g. `<derivedId>-1`, `<derivedId>-2`). This is
// stable across reloads as long as the stored array order doesn't change.
function backfillConnectionIds(connections) {
  const seenIds = new Set();
  return connections.map((connection, index) => {
    const source = connection || {};
    let id = source.id || deriveConnectionId(source);
    if (seenIds.has(id)) {
      id = `${id}-${index}`;
    }
    seenIds.add(id);
    return { ...source, id };
  });
}

// Reads the metadata array from AsyncStorage, tolerating a missing or
// corrupt value by returning an empty array instead of throwing.
async function readMetas() {
  let raw;
  try {
    raw = await AsyncStorage.getItem(META_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Hydrates full connection objects (metadata + secret) from a metadata
// array, reading each connection's secret from its own SecureStore key. A
// missing or corrupt secret degrades to `{}` (accessKey/secretKey
// undefined) rather than throwing, so one bad entry can't break the rest.
async function hydrateFromMetas(metas) {
  const result = [];
  for (const meta of metas) {
    let secret = {};
    try {
      const raw = await SecureStore.getItemAsync(SECRET_PREFIX + meta.id);
      secret = raw ? JSON.parse(raw) : {};
    } catch {
      secret = {};
    }
    result.push(fromStorageEntry(meta, secret));
  }
  return result;
}

// Backfills ids, then writes each connection's secret under its own
// SecureStore key and the full metadata array to AsyncStorage. Returns the
// written metas (with backfilled ids) so callers can reconcile against them.
//
// A connection carrying NO secret material at all (neither accessKey nor
// secretKey) is almost always the product of a degraded hydration — a
// transient SecureStore read failure that hydrateFromMetas absorbed as {}.
// Its on-disk secret is most likely still healthy, so the secret write is
// SKIPPED for such a connection: an existing stored secret must never be
// clobbered with an empty one (that would be permanent credential loss the
// next time any caller re-saves the full list, e.g. AuthContext.addConnection).
async function writeSplit(connections) {
  const withIds = backfillConnectionIds(connections);
  const metas = [];
  for (const conn of withIds) {
    const { meta, secret } = toStorageEntry(conn);
    metas.push(meta);
    const hasSecretMaterial = secret.accessKey !== undefined || secret.secretKey !== undefined;
    if (hasSecretMaterial) {
      await SecureStore.setItemAsync(SECRET_PREFIX + meta.id, JSON.stringify(secret));
    }
  }
  await AsyncStorage.setItem(META_KEY, JSON.stringify(metas));
  return metas;
}

// --- One-time migration from the legacy single-blob format ---
//
// Two module-level guards:
// - `migrationInFlight`: an in-flight promise so that two concurrent
//   getConnections()/getCurrentConnection() calls (e.g. both fired from
//   AuthContext's startup load) never run the migration twice. Cleared once
//   the run settles.
// - `migrationCompleted`: set after a SUCCESSFUL run, so every later call in
//   the session skips the legacy-key reads entirely (otherwise each
//   repository call would keep paying two no-op SecureStore/keychain reads
//   forever). Deliberately NOT set on failure: a transient storage error
//   must not permanently skip the migration — the next call retries.
let migrationInFlight = null;
let migrationCompleted = false;

function migrateIfNeeded() {
  if (migrationCompleted) {
    return Promise.resolve();
  }
  if (!migrationInFlight) {
    migrationInFlight = runMigration()
      .then(() => {
        migrationCompleted = true;
      })
      .finally(() => {
        migrationInFlight = null;
      });
  }
  return migrationInFlight;
}

// Test-only: resets the module-level migration guards so unit tests can
// exercise the migration path repeatedly within a single module instance.
// Never call this from application code.
export function __resetMigrationStateForTests() {
  migrationInFlight = null;
  migrationCompleted = false;
}

async function runMigration() {
  await migrateLegacyConnections();
  await migrateLegacyCurrentConnection();
}

async function migrateLegacyConnections() {
  const legacy = await SecureStore.getItemAsync(LEGACY_CONNECTIONS_KEY);
  if (!legacy) return; // already migrated or fresh install

  let parsed;
  try {
    parsed = JSON.parse(legacy);
  } catch {
    await SecureStore.deleteItemAsync(LEGACY_CONNECTIONS_KEY); // corrupt: drop, don't crash
    return;
  }

  const list = Array.isArray(parsed) ? parsed : [];
  await writeSplit(list);
  await SecureStore.deleteItemAsync(LEGACY_CONNECTIONS_KEY);
}

async function migrateLegacyCurrentConnection() {
  const legacy = await SecureStore.getItemAsync(LEGACY_CURRENT_CONNECTION_KEY);
  if (!legacy) return; // already migrated or never set

  let parsed;
  try {
    parsed = JSON.parse(legacy);
  } catch {
    parsed = null; // corrupt: drop, don't crash
  }

  if (parsed) {
    // Match the legacy full object (which has no stable id of its own) to
    // the already-migrated connections list, the same way AuthContext used
    // to reconcile it in memory. If nothing matches (e.g. it pointed at a
    // since-deleted connection), there is no secret left to hydrate it
    // from, so it intentionally resolves to "no active connection" instead
    // of a synthesized, secret-less stand-in.
    const connections = await hydrateFromMetas(await readMetas());
    const reconciled = reconcileCurrentConnection(parsed, connections);
    if (reconciled && connections.some((c) => c.id === reconciled.id)) {
      await AsyncStorage.setItem(CURRENT_CONNECTION_ID_KEY, reconciled.id);
    }
  }
  await SecureStore.deleteItemAsync(LEGACY_CURRENT_CONNECTION_KEY);
}

// --- Connections (metadata in AsyncStorage, secrets in SecureStore) ---

// Returns the stored connections (secrets included, hydrated from
// SecureStore), or an empty array if none are stored. Triggers the one-time
// legacy migration on first call.
export async function getConnections() {
  await migrateIfNeeded();
  const metas = await readMetas();
  return hydrateFromMetas(metas);
}

// Persists the full list of connections: each secret under its own
// SecureStore key, metadata in AsyncStorage. Also removes the secret of any
// connection that was previously stored but is absent from `connections`,
// so deleting a connection via a full re-save never leaves an orphaned
// `conn_secret_*` key behind.
export async function saveConnections(connections) {
  await migrateIfNeeded();
  const previousIds = (await readMetas()).map((m) => m.id);
  const metas = await writeSplit(connections);
  const nextIds = new Set(metas.map((m) => m.id));
  for (const id of previousIds) {
    if (!nextIds.has(id)) {
      await SecureStore.deleteItemAsync(SECRET_PREFIX + id);
    }
  }
}

// Removes a single connection: its metadata entry and its secret key.
// Cheaper than saveConnections(withoutId) for the common single-delete case
// since it never re-touches the other connections' secrets.
export async function deleteConnection(id) {
  await migrateIfNeeded();
  const metas = await readMetas();
  const next = metas.filter((m) => m.id !== id);
  await AsyncStorage.setItem(META_KEY, JSON.stringify(next));
  await SecureStore.deleteItemAsync(SECRET_PREFIX + id);
}

// --- Current connection (id-only in AsyncStorage; full object hydrated
// from getConnections() — no secret is duplicated into a second value) ---

// Returns the current connection (secrets included, hydrated from the
// connections list), or null if none is stored or it matches no connection.
export async function getCurrentConnection() {
  await migrateIfNeeded();
  const id = await AsyncStorage.getItem(CURRENT_CONNECTION_ID_KEY);
  if (!id) return null;
  const connections = await getConnections();
  return connections.find((c) => c.id === id) || null;
}

// Persists the current connection by storing only its id.
export async function saveCurrentConnection(connection) {
  await migrateIfNeeded();
  const id = connection && (connection.id || deriveConnectionId(connection));
  if (!id) return;
  await AsyncStorage.setItem(CURRENT_CONNECTION_ID_KEY, id);
}

// Removes the current connection id.
export async function clearCurrentConnection() {
  await migrateIfNeeded();
  await AsyncStorage.removeItem(CURRENT_CONNECTION_ID_KEY);
}

// --- Current bucket (plain string) ---

// Returns the current bucket name, or null if none is stored.
export async function getCurrentBucket() {
  return SecureStore.getItemAsync(KEYS.CURRENT_BUCKET);
}

// Persists the current bucket name.
export async function saveCurrentBucket(name) {
  await SecureStore.setItemAsync(KEYS.CURRENT_BUCKET, name);
}

// Removes the current bucket name.
export async function clearCurrentBucket() {
  await SecureStore.deleteItemAsync(KEYS.CURRENT_BUCKET);
}

// --- Language (plain string) ---

// Returns the stored app language, or null if none is stored.
export async function getLanguage() {
  return SecureStore.getItemAsync(KEYS.LANGUAGE);
}

// Persists the app language.
export async function saveLanguage(lang) {
  await SecureStore.setItemAsync(KEYS.LANGUAGE, lang);
}

// --- Preview flag (plain string: 'true' / 'false') ---

// Returns the stored preview flag, or null if none is stored.
export async function getPreview() {
  return SecureStore.getItemAsync(KEYS.PREVIEW);
}

// Persists the preview flag.
export async function savePreview(value) {
  await SecureStore.setItemAsync(KEYS.PREVIEW, value);
}

// --- Theme (plain string; for upcoming dark mode) ---

// Returns the stored theme, or null if none is stored.
export async function getTheme() {
  return SecureStore.getItemAsync(KEYS.THEME);
}

// Persists the theme.
export async function saveTheme(value) {
  await SecureStore.setItemAsync(KEYS.THEME, value);
}

// --- Sort preference (plain strings; global, applies to every bucket) ---
//
// Neither getter validates: a stored-but-unknown value is resolved by
// domain/fileSorting.resolveSortCriterion / resolveSortDirection at the point
// of use, which is also where the per-criterion default direction lives.

// Returns the stored sort criterion, or null if none is stored.
export async function getSortCriterion() {
  return SecureStore.getItemAsync(KEYS.SORT_CRITERION);
}

// Persists the sort criterion.
export async function saveSortCriterion(value) {
  await SecureStore.setItemAsync(KEYS.SORT_CRITERION, value);
}

// Returns the stored sort direction, or null if none is stored.
export async function getSortDirection() {
  return SecureStore.getItemAsync(KEYS.SORT_DIRECTION);
}

// Persists the sort direction.
export async function saveSortDirection(value) {
  await SecureStore.setItemAsync(KEYS.SORT_DIRECTION, value);
}
