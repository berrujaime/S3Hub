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

// FNV-1a seeds for the two hash passes in deriveConnectionId.
// SEED_A is the standard 32-bit FNV-1a offset basis. SEED_B is a distinct,
// arbitrary constant (the high 32 bits of the 64-bit FNV offset basis
// 0xcbf29ce484222325) so the second pass starts from a genuinely different
// internal state — two different hash functions from the FNV family, rather
// than the same function over a trivially modified input.
const FNV_SEED_A = 0x811c9dc5;
const FNV_SEED_B = 0xcbf29ce4;

// FNV-1a: a small, deterministic, non-cryptographic string hash. Used only to
// derive a stable identifier from connection attributes — never for security.
// Same (seed, string) input always produces the same 32-bit unsigned integer
// output, in every JS engine (only relies on 32-bit integer arithmetic).
const fnv1a = (seed, str) => {
  let hash = seed;
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
// The id concatenates two 32-bit FNV-1a values computed over the same
// signature but from DIFFERENT seeds (FNV_SEED_A / FNV_SEED_B above), giving
// roughly 64 bits of hash material. This is still a non-cryptographic hash:
// collisions between different connections are astronomically unlikely for a
// personal connection list but not impossible — the repository's
// index-suffix dedup (connectionRepository.backfillConnectionIds) is the
// hard uniqueness guarantee. The result is alphanumeric-only, so it is safe
// to use as part of a storage key (e.g. a future `conn_secret_<id>` key).
export const deriveConnectionId = (connection) => {
  const conn = connection || {};
  const parts = [conn.service, conn.accessKey, conn.region, conn.endpoint].map((value) =>
    value === undefined || value === null ? '' : String(value)
  );
  const signature = JSON.stringify(parts);
  const h1 = fnv1a(FNV_SEED_A, signature).toString(36);
  const h2 = fnv1a(FNV_SEED_B, signature).toString(36);
  return `c${h1}${h2}`;
};

// Reconciles the separately-stored current connection against the (already
// id-backfilled) connections list. The stored current connection is NOT
// backfilled by the repository, so a legacy one still has `id === undefined`
// and would never match any list entry by id (breaking the active-connection
// highlight and delete logic, which compare `currentConnection.id ===
// item.id`).
//
// Resolution: use the stored id if present, otherwise derive it with the
// same derivation the backfill used; then prefer the MATCHING LIST ENTRY
// over the stored object. Returning the list entry itself (whole-object
// substitution, not just patching the id) is intentional: it keeps the
// current connection's object identity — and any duplicate-suffixed id —
// consistent with the `connections` list the UI renders. `Array.find`
// naturally resolves a duplicated account to its first occurrence. If
// nothing matches (e.g. a stale current pointing at a deleted entry), the
// stored connection is returned with its id filled in.
//
// Returns null when there is no stored current connection.
export const reconcileCurrentConnection = (storedCurrentConnection, connections) => {
  if (!storedCurrentConnection) {
    return null;
  }
  const id = storedCurrentConnection.id || deriveConnectionId(storedCurrentConnection);
  const matched = (connections || []).find((conn) => conn.id === id);
  return matched || { ...storedCurrentConnection, id };
};
