// src/domain/__tests__/fileTypes.test.js
//
// fileTypes owns ALL extension knowledge in the app: the broad category used
// for icons/sorting (classifyKey, which fileListMapper re-exports) plus the
// two things opening a file needs — how to open it (openModeForKey) and what
// to tell the OS it is (mimeTypeForKey).
import { classifyKey, openModeForKey, mimeTypeForKey } from '../fileTypes';

describe('classifyKey', () => {
  it.each([
    ['photo.JPG', 'image'],
    ['clip.mp4', 'video'],
    ['song.mp3', 'audio'],
    ['report.pdf', 'document'],
    ['notes.txt', 'document'],
    ['bundle.zip', 'archive'],
    ['binary.xyz', 'other'],
    ['no-extension', 'other'],
  ])('classifies %s as %s', (key, expected) => {
    expect(classifyKey(key)).toBe(expected);
  });

  it('returns other for non-string input', () => {
    expect(classifyKey(undefined)).toBe('other');
    expect(classifyKey(null)).toBe('other');
    expect(classifyKey(42)).toBe('other');
  });

  it('matches on the extension, not on the same letters mid-key', () => {
    // A folder named "mp3" must not make a key audio.
    expect(classifyKey('mp3/readme.bin')).toBe('other');
  });
});

describe('openModeForKey', () => {
  it('opens images and video in the in-app media viewer', () => {
    expect(openModeForKey('a.png')).toBe('image');
    expect(openModeForKey('a.mov')).toBe('video');
  });

  it('opens audio in the in-app player', () => {
    expect(openModeForKey('a.flac')).toBe('audio');
  });

  it('opens plain-text formats in the in-app text viewer', () => {
    // Text is split out of the broader 'document' category: these are the
    // ones this app can render itself, unlike pdf/docx/xlsx.
    expect(openModeForKey('a.txt')).toBe('text');
    expect(openModeForKey('a.md')).toBe('text');
    expect(openModeForKey('data.csv')).toBe('text');
    expect(openModeForKey('config.json')).toBe('text');
    expect(openModeForKey('log.LOG')).toBe('text');
  });

  it('hands binary documents and archives to an external app', () => {
    expect(openModeForKey('a.pdf')).toBe('external');
    expect(openModeForKey('a.docx')).toBe('external');
    expect(openModeForKey('a.xlsx')).toBe('external');
    expect(openModeForKey('a.zip')).toBe('external');
  });

  it('hands unknown types to an external app rather than doing nothing', () => {
    // The reported bug was that tapping such a file did nothing at all.
    expect(openModeForKey('firmware.bin')).toBe('external');
    expect(openModeForKey('no-extension')).toBe('external');
    expect(openModeForKey(undefined)).toBe('external');
  });
});

describe('mimeTypeForKey', () => {
  it.each([
    ['a.pdf', 'application/pdf'],
    ['a.zip', 'application/zip'],
    ['a.txt', 'text/plain'],
    ['a.csv', 'text/csv'],
    ['a.json', 'application/json'],
    ['a.mp3', 'audio/mpeg'],
    ['a.MP4', 'video/mp4'],
    ['a.jpeg', 'image/jpeg'],
    ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('maps %s to %s', (key, expected) => {
    expect(mimeTypeForKey(key)).toBe(expected);
  });

  it('falls back to a generic binary type for unknown or missing extensions', () => {
    // Android's chooser still offers "open with" for octet-stream, so this is
    // a usable fallback rather than a dead end.
    expect(mimeTypeForKey('firmware.bin')).toBe('application/octet-stream');
    expect(mimeTypeForKey('no-extension')).toBe('application/octet-stream');
    expect(mimeTypeForKey(null)).toBe('application/octet-stream');
  });

  it('ignores case and directory names when reading the extension', () => {
    expect(mimeTypeForKey('folder.zip/inside.txt')).toBe('text/plain');
  });
});
