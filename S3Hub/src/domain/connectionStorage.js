// Pure helpers that split a connection object into non-secret metadata and
// its secret pair (accessKey/secretKey), and reassemble the two back into a
// full connection. No React, AWS SDK, or Expo imports — fully unit-testable.
//
// This is what lets the data layer store metadata in AsyncStorage and each
// connection's secret under its own SecureStore key
// (see data/connectionRepository.js), instead of one oversized SecureStore
// blob holding every connection's secrets together.

// Non-secret fields copied verbatim from the connection into its metadata,
// when present. `accountId` is not in the Step-1 brief's list but IS a
// non-secret field: it's the public account identifier some providers (e.g.
// Cloudflare R2, see domain/providers.js `buildEndpoint`) need to rebuild
// their endpoint, so it must survive the metadata/secret split.
const META_FIELDS = [
  'id',
  'service',
  'provider',
  'region',
  'endpoint',
  'bucket',
  'label',
  'accountId',
];

// Splits a connection into `{ meta, secret }`. `meta` carries every
// META_FIELDS entry present on the connection plus a normalized boolean
// `preview` (legacy connections stored it as the string 'true'/'false', or
// omitted it entirely). `secret` always carries `accessKey`/`secretKey`
// (possibly undefined) so callers don't need to special-case their absence.
export function toStorageEntry(connection) {
  const meta = {};
  for (const field of META_FIELDS) {
    if (connection[field] !== undefined) meta[field] = connection[field];
  }
  meta.preview = connection.preview === true || connection.preview === 'true';
  return {
    meta,
    secret: { accessKey: connection.accessKey, secretKey: connection.secretKey },
  };
}

// Reassembles a full connection object from its metadata and secret parts.
export function fromStorageEntry(meta, secret) {
  return { ...meta, accessKey: secret.accessKey, secretKey: secret.secretKey };
}
