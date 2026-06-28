// Data-layer repository wrapping expo-secure-store for connection persistence.
// This module is the single source of truth for SecureStore key names and the
// serialization format used for each value. AuthContext should delegate all
// storage to these functions instead of touching SecureStore directly.

import * as SecureStore from 'expo-secure-store';

// SecureStore key names. Defined once, here only.
const KEYS = {
  CONNECTIONS: 'connections',
  CURRENT_CONNECTION: 'currentConnection',
  CURRENT_BUCKET: 'currentBucket',
  LANGUAGE: 'appLanguage',
  PREVIEW: 'preview',
  THEME: 'appTheme',
};

// --- Connections (array of connection objects, JSON-serialized) ---

// Returns the stored connections, or an empty array if none are stored.
export async function getConnections() {
  const stored = await SecureStore.getItemAsync(KEYS.CONNECTIONS);
  return stored ? JSON.parse(stored) : [];
}

// Persists the full list of connections.
export async function saveConnections(connections) {
  await SecureStore.setItemAsync(KEYS.CONNECTIONS, JSON.stringify(connections));
}

// --- Current connection (single connection object, JSON-serialized) ---

// Returns the current connection, or null if none is stored.
export async function getCurrentConnection() {
  const stored = await SecureStore.getItemAsync(KEYS.CURRENT_CONNECTION);
  return stored ? JSON.parse(stored) : null;
}

// Persists the current connection.
export async function saveCurrentConnection(connection) {
  await SecureStore.setItemAsync(KEYS.CURRENT_CONNECTION, JSON.stringify(connection));
}

// Removes the current connection.
export async function clearCurrentConnection() {
  await SecureStore.deleteItemAsync(KEYS.CURRENT_CONNECTION);
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
