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

// Sorts a list of items: folders first, then images, then videos, alphabetically.
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
    const key = object.Key;

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

// Ensures unique ids; duplicates get a time-suffixed id.
export const dedupeById = (items) => {
  const uniqueItemsMap = new Map();
  items.forEach((item) => {
    if (!uniqueItemsMap.has(item.id)) {
      uniqueItemsMap.set(item.id, item);
    } else {
      // If duplicate key found, append a unique suffix.
      let uniqueId = `${item.id}_${Date.now()}`;
      uniqueItemsMap.set(uniqueId, { ...item, id: uniqueId });
    }
  });
  return Array.from(uniqueItemsMap.values());
};
