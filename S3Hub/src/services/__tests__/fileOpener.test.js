// src/services/__tests__/fileOpener.test.js
//
// fileOpener hands a already-downloaded local file to another app. The two
// platforms need different mechanisms (Android: an ACTION_VIEW intent over a
// content:// URI; iOS: the share sheet), and getting the Android side wrong is
// silent — the intent just fails — so these tests pin the exact call shape.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import {
  openExternally,
  readTextPreview,
  clearHandOffDir,
  TEXT_PREVIEW_LIMIT_BYTES,
} from '../fileOpener';

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  getContentUriAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
}));

const SHARE_DIR = 'file:///cache/S3HubShare/';
jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const setPlatform = (os) => {
  Platform.OS = os;
};

describe('openExternally on Android', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('android');
    FileSystem.getContentUriAsync.mockResolvedValue('content://provider/share/report.pdf');
    FileSystem.copyAsync.mockResolvedValue(undefined);
  });

  it('views the file through a content:// URI with a read permission grant', async () => {
    const result = await openExternally(
      'file:///cache/S3HubCache/m1a2b3.pdf',
      'application/pdf',
      'report.pdf',
    );

    // file:// URIs cannot be handed to other apps on modern Android
    // (FileUriExposedException) — it must be a content:// URI from the
    // FileProvider, and it must point at the STAGED COPY, not the cache.
    expect(FileSystem.getContentUriAsync).toHaveBeenCalledWith(`${SHARE_DIR}report.pdf`);
    expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith(
      'android.intent.action.VIEW',
      expect.objectContaining({
        data: 'content://provider/share/report.pdf',
        type: 'application/pdf',
        // FLAG_GRANT_READ_URI_PERMISSION (1): without it the receiving app
        // gets a URI it is not allowed to read.
        flags: 1,
      }),
    );
    expect(result).toBe(true);
  });

  it('reports failure instead of throwing when no app can handle the type', async () => {
    // Android throws from the intent when no activity matches; the caller
    // needs a plain false so it can show a translated message.
    IntentLauncher.startActivityAsync.mockRejectedValue(new Error('No Activity found to handle'));

    await expect(openExternally('file:///cache/x.bin', 'application/octet-stream')).resolves.toBe(
      false,
    );
  });

  it('does not fall back to the share sheet on Android', async () => {
    await openExternally('file:///cache/report.pdf', 'application/pdf');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});

// The bug this staging exists for: launching an external viewer backgrounds
// S3Hub, and the AppState listener in hooks/useFileList reacts to 'background'
// by calling mediaCache.clearEntireCache(), which deletes the media cache
// directory RECURSIVELY. Handing the viewer a path inside that directory got
// the file deleted from under it, so the viewer flashed open and closed again,
// returning the user to S3Hub. The bytes must be copied out of the cache
// first.
describe('openExternally hand-off staging', () => {
  const CACHED = 'file:///cache/S3HubCache/m1a2b3.pdf';

  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('android');
    FileSystem.getContentUriAsync.mockResolvedValue('content://provider/share/report.pdf');
    FileSystem.copyAsync.mockResolvedValue(undefined);
  });

  it('copies the file OUT of the media cache before handing it over', async () => {
    await openExternally(CACHED, 'application/pdf', 'report.pdf');

    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: CACHED,
      to: `${SHARE_DIR}report.pdf`,
    });
  });

  it('stages into a directory that is NOT inside the media cache', async () => {
    await openExternally(CACHED, 'application/pdf', 'report.pdf');

    const { to } = FileSystem.copyAsync.mock.calls[0][0];
    // clearEntireCache deletes `${cacheDirectory}S3HubCache/` recursively;
    // the hand-off must live outside it.
    expect(to.startsWith('file:///cache/S3HubCache/')).toBe(false);
    expect(to.startsWith(SHARE_DIR)).toBe(true);
  });

  it('clears the previous hand-off so the directory cannot grow', async () => {
    await openExternally(CACHED, 'application/pdf', 'report.pdf');

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(SHARE_DIR, { idempotent: true });
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(SHARE_DIR, { intermediates: true });
  });

  it("uses the object's real name so the viewer shows it, not the cache hash", async () => {
    await openExternally(CACHED, 'application/pdf', 'Q3 report final.pdf');

    // Spaces are not filesystem-hostile everywhere, but sanitizing keeps the
    // path predictable; the extension must survive either way.
    const { to } = FileSystem.copyAsync.mock.calls[0][0];
    expect(to.endsWith('.pdf')).toBe(true);
    expect(to).toBe(`${SHARE_DIR}Q3_report_final.pdf`);
  });

  it('strips path separators from the name instead of nesting directories', async () => {
    await openExternally(CACHED, 'application/pdf', 'docs/2026/report.pdf');

    expect(FileSystem.copyAsync.mock.calls[0][0].to).toBe(`${SHARE_DIR}report.pdf`);
  });

  it('falls back to a generic name when none is given', async () => {
    await openExternally(CACHED, 'application/octet-stream');

    expect(FileSystem.copyAsync.mock.calls[0][0].to).toBe(`${SHARE_DIR}file`);
  });

  it('reports failure when the copy itself fails, without launching anything', async () => {
    FileSystem.copyAsync.mockRejectedValue(new Error('ENOSPC'));

    await expect(openExternally(CACHED, 'application/pdf', 'report.pdf')).resolves.toBe(false);
    expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  });
});

describe('openExternally on iOS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('ios');
    Sharing.isAvailableAsync.mockResolvedValue(true);
    // clearAllMocks wipes recorded calls but KEEPS implementations, and the
    // staging suite above leaves copyAsync rejecting.
    FileSystem.copyAsync.mockResolvedValue(undefined);
    Sharing.shareAsync.mockResolvedValue(undefined);
  });

  it('uses the share sheet, which is how iOS opens a file in another app', async () => {
    const result = await openExternally(
      'file:///cache/report.pdf',
      'application/pdf',
      'report.pdf',
    );

    // The staged copy, not the cached path: iOS keeps reading the file after
    // the sheet is dismissed, and the copy carries the object's real name.
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      `${SHARE_DIR}report.pdf`,
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
    expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('reports failure when sharing is unavailable', async () => {
    Sharing.isAvailableAsync.mockResolvedValue(false);

    await expect(openExternally('file:///cache/report.pdf', 'application/pdf')).resolves.toBe(
      false,
    );
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('reports failure when the user dismisses or sharing throws', async () => {
    Sharing.shareAsync.mockRejectedValue(new Error('cancelled'));

    await expect(openExternally('file:///cache/report.pdf', 'application/pdf')).resolves.toBe(
      false,
    );
  });
});

describe('openExternally guards', () => {
  it('reports failure for a missing local URI without calling out', async () => {
    jest.clearAllMocks();
    setPlatform('android');

    await expect(openExternally(null, 'application/pdf')).resolves.toBe(false);
    expect(FileSystem.getContentUriAsync).not.toHaveBeenCalled();
    expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  });
});

// clearHandOffDir is the OTHER half of the SHARE_DIR fix: it is called at
// app/screen startup (hooks/useFileList's mount effect), not on the
// 'background' AppState transition — see the SHARE_DIR comment in
// fileOpener.js for why background is the wrong moment.
describe('clearHandOffDir', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes the hand-off directory idempotently', async () => {
    FileSystem.deleteAsync.mockResolvedValue(undefined);

    await clearHandOffDir();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(SHARE_DIR, { idempotent: true });
  });

  it('is safe to call when the directory does not exist (idempotent option handles it)', async () => {
    FileSystem.deleteAsync.mockResolvedValue(undefined);

    await expect(clearHandOffDir()).resolves.toBeUndefined();
    await expect(clearHandOffDir()).resolves.toBeUndefined();

    expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
  });

  it('swallows a filesystem error instead of throwing', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    FileSystem.deleteAsync.mockRejectedValue(new Error('EPERM'));

    await expect(clearHandOffDir()).resolves.toBeUndefined();

    console.error.mockRestore();
  });
});

describe('readTextPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FileSystem.readAsStringAsync.mockResolvedValue('hello');
  });

  it('reads a small file whole', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ size: 12 });

    await expect(readTextPreview('file:///cache/a.txt')).resolves.toEqual({
      content: 'hello',
      truncated: false,
    });
    // No length option: read it all.
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///cache/a.txt', undefined);
  });

  it('reads only the capped slice of an oversized file and flags it', async () => {
    // A multi-GB log must never be pulled into memory whole just to preview.
    FileSystem.getInfoAsync.mockResolvedValue({ size: TEXT_PREVIEW_LIMIT_BYTES * 40 });

    await expect(readTextPreview('file:///cache/huge.log')).resolves.toEqual({
      content: 'hello',
      truncated: true,
    });
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///cache/huge.log', {
      length: TEXT_PREVIEW_LIMIT_BYTES,
      position: 0,
    });
  });

  it('treats an unknown size as small rather than refusing to read', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({});

    await expect(readTextPreview('file:///cache/a.txt')).resolves.toEqual({
      content: 'hello',
      truncated: false,
    });
  });

  it('returns null when the file cannot be read', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ size: 10 });
    FileSystem.readAsStringAsync.mockRejectedValue(new Error('ENOENT'));

    await expect(readTextPreview('file:///cache/gone.txt')).resolves.toBeNull();
  });

  it('returns null for a missing URI without touching the filesystem', async () => {
    await expect(readTextPreview(null)).resolves.toBeNull();
    expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
  });
});
