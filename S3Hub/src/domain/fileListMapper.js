// Pure domain logic for mapping S3 listings into file/folder list items.
// No React, AWS SDK, or Expo imports — fully unit-testable.

// Extension patterns for each supported mediaType, checked in order.
const MEDIA_TYPE_PATTERNS = [
  ['image', /\.(jpg|jpeg|png|gif|bmp|webp|heic|svg)$/i],
  ['video', /\.(mp4|mov|avi|mkv|webm|m4v)$/i],
  ['audio', /\.(mp3|wav|aac|flac|ogg|m4a)$/i],
  ['document', /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|md|rtf|odt)$/i],
  ['archive', /\.(zip|rar|7z|tar|gz|bz2|tgz)$/i],
];

// Classifies an object key into a broad file-type category, based on its
// extension. Returns 'other' for unrecognized extensions or non-string input.
export const classifyKey = (key) => {
  if (typeof key !== 'string') {
    return 'other';
  }

  const match = MEDIA_TYPE_PATTERNS.find(([, pattern]) => pattern.test(key));
  return match ? match[0] : 'other';
};

// Returns true when a mediaType supports on-demand preview (thumbnail/player).
// Only image and video items get signed preview URLs; other file types are
// rendered with a generic icon instead.
export const isPreviewableMediaType = (mediaType) => {
  return mediaType === 'image' || mediaType === 'video';
};

// Sorts a list of items: folders first (alphabetically), then non-video
// files (images, audio, documents, archives, other — alphabetically), then
// videos (alphabetically).
// Returns a new array without mutating the input.
export const sortFiles = (filesArray) => {
  return [...filesArray].sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    if (a.isFolder && b.isFolder) return a.name.localeCompare(b.name);
    if (a.isVideo && !b.isVideo) return 1;
    if (!a.isVideo && b.isVideo) return -1;
    return a.name.localeCompare(b.name);
  });
};

// Parses a delimiter-based S3 listing into list items (files first, then
// folders), without signed URLs. Callers are responsible for sorting and
// deduping.
// `listing` is `{ contents, commonPrefixes }` as returned by
// `listAllObjects`/`listObjectsPage`: `contents` holds the objects at the
// current level (each element has .Key and .Size) and `commonPrefixes` holds
// the immediate subfolder prefix strings (e.g. "photos/sub/").
export const parseObjects = (listing, currentPath) => {
  const items = [];
  if (!listing) {
    return items;
  }

  const { contents, commonPrefixes } = listing;

  (contents ?? []).forEach((object) => {
    const key = object?.Key;

    // Skip malformed entries (a null/undefined element, or one without a
    // usable Key) instead of throwing: this app lists arbitrary
    // S3-compatible providers (Storj, R2, B2, Wasabi, MinIO via custom
    // endpoints), whose responses are not guaranteed to be as well-formed
    // as AWS's own, and one bad row must never crash the whole listing.
    if (typeof key !== 'string') return;

    // Ignore the S3 "folder marker" object that represents currentPath itself.
    if (key === currentPath) return;

    const mediaType = classifyKey(key);

    items.push({
      id: key, // Unique identifier based on S3 key.
      key: key,
      name: key.substring(currentPath.length),
      size: object.Size,
      isFolder: false,
      isVideo: mediaType === 'video',
      mediaType,
      url: null,
    });
  });

  // Append folders (derived from CommonPrefixes) after the files.
  (commonPrefixes ?? []).forEach((prefix) => {
    // Skip malformed entries, mirroring the contents guard above. The
    // caller (listObjectsPage) has already flattened CommonPrefixes to
    // plain strings, so anything non-string here is a bad row to drop.
    if (typeof prefix !== 'string') return;

    const relative = prefix.substring(currentPath.length);
    const name = relative.endsWith('/') ? relative.slice(0, -1) : relative;
    items.push({
      id: prefix, // Unique identifier for folder.
      key: prefix,
      name,
      isFolder: true,
    });
  });

  return items;
};

// Stamps each item with the connection id and bucket it was fetched from,
// returning a new array of new objects (inputs are never mutated). Existing
// origin fields from an earlier stamp are overwritten.
//
// Why: the media disk cache is namespaced by (connectionId, bucket, key) —
// see domain/cacheKeys.mediaCacheKey. If components derived that namespace
// from the LIVE connection/bucket context instead, a bucket or connection
// switch would leave at least one render where the new context is paired
// with the previous listing's items (whose signed URLs still point at the
// old bucket) — caching the old bucket's bytes under the new bucket's
// namespace. Binding the origin to each item at fetch/hydration time makes
// the cache key derivable from the item alone, immune to stale renders.
export const stampItemOrigin = (items, connectionId, bucket) =>
  (items ?? []).map((item) => ({ ...item, connectionId, bucket }));

// Strips fields that must never be persisted to the (long-TTL) file-list
// AsyncStorage cache. `url` is the motivating case: a presigned URL expires
// in 1h (see services/s3Service.getSignedUrl) while the list cache lives for
// CACHE_EXPIRATION (7 days) — persisting it would let a cache hit resurface
// an expired signature, failing downloads/renders with 403 SignatureExpired,
// and would also leave a signed URL (a bearer credential) sitting in
// unencrypted AsyncStorage. Presigning is a local, network-free HMAC
// operation, so callers cheaply re-derive `url` after hydration instead of
// ever caching it (see hooks/useFileList).
// Returns a new array of new objects; never mutates the input.
export const stripVolatileFields = (items) => (items ?? []).map(({ url, ...rest }) => rest);

// True when an item's stamped fetch-time origin (connectionId, bucket — see
// stampItemOrigin above) matches the given connection id and bucket. Used to
// guard on-demand presigned-URL regeneration for items that were fetched
// without an upfront URL (non-previewable file types — see
// isPreviewableMediaType): an item's origin can lag one render behind the
// live AuthContext during a bucket/connection switch, and signing with the
// wrong connection's credentials would silently mint a URL for the wrong
// account/bucket. Returns false (never match) for an item lacking a stamped
// origin, or for a missing item.
export const matchesOrigin = (item, connectionId, bucket) =>
  Boolean(item) && item.connectionId === connectionId && item.bucket === bucket;

// Ensures unique ids; duplicates get a suffix built from a counter that
// increments per duplicate found, so the same input always produces the
// same output (unlike a Date.now()-based suffix, which varies by wall-clock
// time and can even collide when two duplicates are processed within the
// same millisecond).
export const dedupeById = (items) => {
  const uniqueItemsMap = new Map();
  let duplicateCount = 0;
  items.forEach((item) => {
    if (!uniqueItemsMap.has(item.id)) {
      uniqueItemsMap.set(item.id, item);
    } else {
      // If duplicate key found, append a deterministic incrementing suffix.
      duplicateCount += 1;
      const uniqueId = `${item.id}_${duplicateCount}`;
      uniqueItemsMap.set(uniqueId, { ...item, id: uniqueId });
    }
  });
  return Array.from(uniqueItemsMap.values());
};
