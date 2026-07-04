// Pure domain logic for mapping S3 listings into file/folder list items.
// No React, AWS SDK, or Expo imports — fully unit-testable.

// Returns true if the key points to a video file.
export const isVideoKey = (key) => {
  return key.match(/\.(mp4|mov|avi|mkv)$/i) ? true : false;
};

// Returns truthy if the key points to a supported media file (image or video).
export const isMediaKey = (key) => {
  return key.match(/\.(jpg|jpeg|png|gif|mp4|mov|avi|mkv)$/i);
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

    // Only include supported media files (see Task 1.3 for full file-type support).
    if (!isMediaKey(key)) return;

    items.push({
      id: key, // Unique identifier based on S3 key.
      key: key,
      name: key.substring(currentPath.length),
      size: object.Size,
      isFolder: false,
      isVideo: isVideoKey(key),
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
