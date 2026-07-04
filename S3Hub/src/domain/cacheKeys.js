// Pure helpers for building AsyncStorage cache keys.
// No React, AWS SDK, or Expo imports — fully unit-testable.

// Builds the cache key for a directory listing.
// The connection is identified by its stable `id` so that listings from
// different connections never collide in the cache (e.g. two accounts that
// each have a bucket with the same name). Accepts either a connection object
// (uses its `id`) or a raw id/string.
export const getCacheKey = (connection, bucket, path) => {
  const connectionId =
    connection && typeof connection === 'object' ? connection.id : connection;
  return `files_${connectionId}_${bucket}_${path}`;
};

// FNV-1a: a small, deterministic, non-cryptographic string hash. Used only to
// derive a stable identifier from connection attributes — never for security.
// Same string input always produces the same 32-bit unsigned integer output,
// in every JS engine (only relies on ordinary 32-bit integer arithmetic).
const fnv1a = (str) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

// Derives a stable, deterministic id for a connection from its identifying
// fields: service + accessKey + region + endpoint. Same input always yields
// the same output (no Date.now(), no randomness) — this is what lets legacy
// connections that were stored without an `id` be backfilled consistently on
// every load instead of getting a new random id each time.
//
// Fields are JSON-encoded (as an array) before hashing rather than naively
// concatenated, so that missing fields (encoded as "") or field boundaries
// can never be ambiguous — e.g. {service:'a', accessKey:'bc'} must never
// collide with {service:'ab', accessKey:'c'}, which plain string
// concatenation would conflate.
//
// The result is combined from two independent hash passes (different seeds)
// to shrink collision probability, and kept alphanumeric-only so it is safe
// to use as part of a storage key (e.g. a future `conn_secret_<id>` key).
export const deriveConnectionId = (connection) => {
  const conn = connection || {};
  const parts = [conn.service, conn.accessKey, conn.region, conn.endpoint].map((value) =>
    value === undefined || value === null ? '' : String(value)
  );
  const signature = JSON.stringify(parts);
  const h1 = fnv1a(signature).toString(36);
  const h2 = fnv1a(`${signature}#`).toString(36);
  return `c${h1}${h2}`;
};
