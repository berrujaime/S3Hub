// Pure domain knowledge about object-key file types.
// No React, AWS SDK, or Expo imports — fully unit-testable.
//
// This module is the single owner of extension knowledge in the app:
//  - `classifyKey`   -> broad category, drives list icons and sorting
//                       (re-exported by fileListMapper, its original home).
//  - `openModeForKey`-> HOW a tap should open the object.
//  - `mimeTypeForKey`-> WHAT to tell the OS the bytes are, when handing a
//                       file to an external app.
// Keeping all three here means an extension is added in exactly one place.

// Extension patterns for each supported mediaType, checked in order.
const MEDIA_TYPE_PATTERNS = [
  ['image', /\.(jpg|jpeg|png|gif|bmp|webp|heic|svg)$/i],
  ['video', /\.(mp4|mov|avi|mkv|webm|m4v)$/i],
  ['audio', /\.(mp3|wav|aac|flac|ogg|m4a)$/i],
  ['document', /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|md|rtf|odt)$/i],
  ['archive', /\.(zip|rar|7z|tar|gz|bz2|tgz)$/i],
];

// The subset of keys this app can render itself as text. Deliberately NARROWER
// than the 'document' category: pdf/doc/xls are documents too but are binary,
// so they go to an external viewer instead. `json`/`log`/`xml`/`yml` are not in
// any MEDIA_TYPE_PATTERNS category (they classify as 'other'), yet they are
// perfectly readable text — which is why open mode is decided by its own
// pattern rather than derived from the category.
const TEXT_PATTERN = /\.(txt|md|csv|log|json|xml|ya?ml|ini|conf|tsv|rtf)$/i;

// Extension -> MIME type. Only what an external viewer needs to pick the
// right app; anything absent falls back to a generic binary type.
const MIME_TYPES = {
  // documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  // text
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/x-yaml',
  yml: 'application/x-yaml',
  ini: 'text/plain',
  conf: 'text/plain',
  // archives
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  bz2: 'application/x-bzip2',
  // images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  // video
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  // audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
};

const FALLBACK_MIME_TYPE = 'application/octet-stream';

// Reads the lowercase extension of a key, ignoring any directory names (only
// the segment after the LAST dot of the LAST path segment counts, so
// "folder.zip/inside.txt" is a .txt). Returns '' when there is none.
const extensionOf = (key) => {
  if (typeof key !== 'string') {
    return '';
  }
  const fileName = key.slice(key.lastIndexOf('/') + 1);
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return '';
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
};

/**
 * Classifies an object key into a broad file-type category, based on its
 * extension. Returns 'other' for unrecognized extensions or non-string input.
 * @param {string} key
 * @returns {'image'|'video'|'audio'|'document'|'archive'|'other'}
 */
export const classifyKey = (key) => {
  if (typeof key !== 'string') {
    return 'other';
  }

  const match = MEDIA_TYPE_PATTERNS.find(([, pattern]) => pattern.test(key));
  return match ? match[0] : 'other';
};

/**
 * Decides how tapping an object should open it.
 *
 * 'external' is the DEFAULT rather than a special case: before this existed,
 * FileListScreen only reacted to keys it had a preview URL for (image/video)
 * and tapping anything else did nothing at all.
 * @param {string} key
 * @returns {'image'|'video'|'audio'|'text'|'external'}
 */
export const openModeForKey = (key) => {
  const category = classifyKey(key);

  if (category === 'image' || category === 'video' || category === 'audio') {
    return category;
  }
  if (typeof key === 'string' && TEXT_PATTERN.test(key)) {
    return 'text';
  }
  return 'external';
};

/**
 * MIME type for an object key, for handing the file to an external app.
 * @param {string} key
 * @returns {string} A MIME type; 'application/octet-stream' when unknown.
 */
export const mimeTypeForKey = (key) => {
  return MIME_TYPES[extensionOf(key)] ?? FALLBACK_MIME_TYPE;
};
