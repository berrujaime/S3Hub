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

// Parses S3 response Contents into list items (files first, then folders),
// without signed URLs. Callers are responsible for sorting and deduping.
// `contents` is response.Contents (each element has .Key and .Size).
export const parseObjects = (contents, currentPath) => {
  const items = [];
  if (!contents) {
    return items;
  }

  const directories = new Set();

  contents.forEach((object) => {
    const key = object.Key;

    // Remove the 'currentPath' prefix from the key to get the relative path.
    const relativeKey = key.substring(currentPath.length);

    // Ignore the 'currentPath' itself.
    if (relativeKey === '') return;

    // Check if it is a directory or a file.
    const index = relativeKey.indexOf('/');
    if (index !== -1) {
      // It is a directory.
      const dirName = relativeKey.substring(0, index);
      directories.add(dirName);
    } else {
      // It is a file — only include supported media files.
      if (isMediaKey(key)) {
        items.push({
          id: key, // Unique identifier based on S3 key.
          key: key,
          name: relativeKey,
          size: object.Size,
          isFolder: false,
          isVideo: isVideoKey(key),
          url: null,
        });
      }
    }
  });

  // Append folders after the files.
  directories.forEach((dir) => {
    const folderKey = currentPath + dir + '/';
    items.push({
      id: folderKey, // Unique identifier for folder.
      key: folderKey,
      name: dir,
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
