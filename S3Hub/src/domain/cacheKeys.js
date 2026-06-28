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
