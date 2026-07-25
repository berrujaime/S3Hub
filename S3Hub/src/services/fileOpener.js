// src/services/fileOpener.js
//
// Hands an already-downloaded local file to another app on the device.
//
// The two platforms do this differently and neither is a fallback for the
// other:
//  - Android has a real "open with" intent (ACTION_VIEW). It must be given a
//    `content://` URI from expo-file-system's FileProvider — passing a
//    `file://` URI raises FileUriExposedException on API 24+ — plus
//    FLAG_GRANT_READ_URI_PERMISSION so the receiving app may actually read it.
//  - iOS has no equivalent intent; the share sheet IS the way a file reaches
//    another app there.
//
// Every failure path resolves to `false` rather than throwing: the caller's
// job is to show one translated message, and "no installed app handles .bin"
// is an ordinary outcome, not an exception worth a stack trace.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';

// android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const ACTION_VIEW = 'android.intent.action.VIEW';

// Hand-off directory for files given to OTHER apps. Deliberately a sibling of
// the media cache, NOT inside it.
//
// Why: launching an external viewer sends S3Hub to the background, and the
// AppState listener in hooks/useFileList reacts to 'background' by calling
// mediaCache.clearEntireCache(), which deletes the whole cache directory
// recursively. Handing the viewer a path inside that directory meant the file
// was deleted a moment after the intent was fired — usually before the viewer
// had finished opening it — so the viewer appeared for an instant and closed
// again, dropping the user back in S3Hub. Copying the bytes out first makes
// the hand-off immune to our own cache clearing.
const SHARE_DIR = `${FileSystem.cacheDirectory}S3HubShare/`;

// Keeps a filename safe for the filesystem while preserving its extension —
// Android viewers key off the extension as much as the MIME type.
const safeFileName = (fileName) => {
  const fallback = 'file';
  if (typeof fileName !== 'string' || !fileName) {
    return fallback;
  }
  const base = fileName.slice(fileName.lastIndexOf('/') + 1);
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  return cleaned && cleaned !== '.' ? cleaned : fallback;
};

/**
 * Copies a cached file into the hand-off directory and returns the copy's URI.
 *
 * The previous hand-off is cleared first: only one file is ever being viewed
 * externally, so the directory holds at most one entry and cannot grow.
 * Using the object's REAL name (rather than the hashed cache name) also means
 * the receiving app shows "report.pdf" instead of "m1a2b3c4.pdf".
 */
const stageForHandOff = async (localUri, fileName) => {
  await FileSystem.deleteAsync(SHARE_DIR, { idempotent: true });
  await FileSystem.makeDirectoryAsync(SHARE_DIR, { intermediates: true });
  const target = `${SHARE_DIR}${safeFileName(fileName)}`;
  await FileSystem.copyAsync({ from: localUri, to: target });
  return target;
};

// Ceiling for the in-app text viewer. A text object in a bucket can be a
// multi-GB log; reading it whole would hold the entire string in JS memory
// (and then hand it to a Text node). 256 KB is far more than anyone scrolls
// in a preview, and the viewer says so when it truncates.
export const TEXT_PREVIEW_LIMIT_BYTES = 256 * 1024;

/**
 * Opens a local file in whichever installed app handles its type.
 * @param {string} localUri - A `file://` URI on this device.
 * @param {string} mimeType - From `domain/fileTypes.mimeTypeForKey`.
 * @param {string} [fileName] - The object's display name, used for the copy
 *   handed to the other app so it shows a real filename.
 * @returns {Promise<boolean>} true when an app was handed the file.
 */
export const openExternally = async (localUri, mimeType, fileName) => {
  if (!localUri) {
    return false;
  }

  try {
    // Never hand out the cached path itself — see SHARE_DIR above.
    const handOffUri = await stageForHandOff(localUri, fileName);

    if (Platform.OS === 'android') {
      const contentUri = await FileSystem.getContentUriAsync(handOffUri);
      await IntentLauncher.startActivityAsync(ACTION_VIEW, {
        data: contentUri,
        type: mimeType,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
      return true;
    }

    if (!(await Sharing.isAvailableAsync())) {
      return false;
    }
    // The staged copy here too: iOS keeps reading the file after the share
    // sheet is dismissed, and it carries the object's real name.
    await Sharing.shareAsync(handOffUri, { mimeType });
    return true;
  } catch (error) {
    // Identity only — a local cache path is not sensitive, but keeping the
    // shape consistent with the rest of the app's logging (never full error
    // objects, which elsewhere carry presigned URLs).
    console.error('Error opening file externally:', error?.name || error?.code, error?.message);
    return false;
  }
};

/**
 * Reads a local text file for the in-app viewer, capped at
 * TEXT_PREVIEW_LIMIT_BYTES.
 *
 * The cap is applied by reading the file's size FIRST and then reading only
 * the allowed slice, so an oversized file is never fully loaded into memory.
 * @param {string} localUri - A `file://` URI on this device.
 * @returns {Promise<{content: string, truncated: boolean}|null>} null when the
 *   file cannot be read.
 */
export const readTextPreview = async (localUri) => {
  if (!localUri) {
    return null;
  }

  try {
    const info = await FileSystem.getInfoAsync(localUri);
    const size = info?.size ?? 0;
    const truncated = size > TEXT_PREVIEW_LIMIT_BYTES;

    const content = await FileSystem.readAsStringAsync(
      localUri,
      truncated ? { length: TEXT_PREVIEW_LIMIT_BYTES, position: 0 } : undefined,
    );

    return { content, truncated };
  } catch (error) {
    console.error('Error reading text file:', error?.name || error?.code, error?.message);
    return null;
  }
};
