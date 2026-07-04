import {
  isVideoKey,
  isMediaKey,
  sortFiles,
  parseObjects,
  dedupeById,
} from '../fileListMapper';

describe('isVideoKey', () => {
  it('returns true for video extensions (case-insensitive)', () => {
    expect(isVideoKey('clip.mp4')).toBe(true);
    expect(isVideoKey('clip.MOV')).toBe(true);
    expect(isVideoKey('clip.avi')).toBe(true);
    expect(isVideoKey('clip.MKV')).toBe(true);
    expect(isVideoKey('path/to/clip.mov')).toBe(true);
  });

  it('returns false for non-video keys', () => {
    expect(isVideoKey('photo.jpg')).toBe(false);
    expect(isVideoKey('photo.png')).toBe(false);
    expect(isVideoKey('document.txt')).toBe(false);
    expect(isVideoKey('noextension')).toBe(false);
    expect(isVideoKey('mp4notattheend.txt')).toBe(false);
  });
});

describe('isMediaKey', () => {
  it('returns truthy for image and video extensions (case-insensitive)', () => {
    expect(isMediaKey('photo.jpg')).toBeTruthy();
    expect(isMediaKey('photo.JPEG')).toBeTruthy();
    expect(isMediaKey('photo.png')).toBeTruthy();
    expect(isMediaKey('photo.gif')).toBeTruthy();
    expect(isMediaKey('clip.mp4')).toBeTruthy();
    expect(isMediaKey('clip.MOV')).toBeTruthy();
    expect(isMediaKey('clip.avi')).toBeTruthy();
    expect(isMediaKey('clip.mkv')).toBeTruthy();
  });

  it('returns falsy for non-media keys', () => {
    expect(isMediaKey('document.txt')).toBeFalsy();
    expect(isMediaKey('archive.zip')).toBeFalsy();
    expect(isMediaKey('noextension')).toBeFalsy();
  });
});

describe('sortFiles', () => {
  it('returns a new array (does not mutate input)', () => {
    const input = [{ name: 'b', isFolder: false }, { name: 'a', isFolder: false }];
    const result = sortFiles(input);
    expect(result).not.toBe(input);
    expect(input.map(i => i.name)).toEqual(['b', 'a']);
  });

  it('places folders before files', () => {
    const input = [
      { name: 'file.jpg', isFolder: false, isVideo: false },
      { name: 'folder', isFolder: true },
    ];
    const result = sortFiles(input);
    expect(result[0].name).toBe('folder');
    expect(result[1].name).toBe('file.jpg');
  });

  it('sorts folders alphabetically among themselves', () => {
    const input = [
      { name: 'zeta', isFolder: true },
      { name: 'alpha', isFolder: true },
      { name: 'beta', isFolder: true },
    ];
    expect(sortFiles(input).map(i => i.name)).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('places images before videos', () => {
    const input = [
      { name: 'clip.mp4', isFolder: false, isVideo: true },
      { name: 'photo.jpg', isFolder: false, isVideo: false },
    ];
    const result = sortFiles(input);
    expect(result[0].name).toBe('photo.jpg');
    expect(result[1].name).toBe('clip.mp4');
  });

  it('sorts images alphabetically among themselves', () => {
    const input = [
      { name: 'c.jpg', isFolder: false, isVideo: false },
      { name: 'a.jpg', isFolder: false, isVideo: false },
      { name: 'b.jpg', isFolder: false, isVideo: false },
    ];
    expect(sortFiles(input).map(i => i.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('sorts videos alphabetically among themselves', () => {
    const input = [
      { name: 'z.mp4', isFolder: false, isVideo: true },
      { name: 'a.mp4', isFolder: false, isVideo: true },
    ];
    expect(sortFiles(input).map(i => i.name)).toEqual(['a.mp4', 'z.mp4']);
  });

  it('orders folders, then images, then videos overall', () => {
    const input = [
      { name: 'video.mp4', isFolder: false, isVideo: true },
      { name: 'image.jpg', isFolder: false, isVideo: false },
      { name: 'folderB', isFolder: true },
      { name: 'folderA', isFolder: true },
    ];
    expect(sortFiles(input).map(i => i.name)).toEqual([
      'folderA',
      'folderB',
      'image.jpg',
      'video.mp4',
    ]);
  });
});

describe('parseObjects', () => {
  it('returns [] for a null or undefined listing', () => {
    expect(parseObjects(null, '')).toEqual([]);
    expect(parseObjects(undefined, 'some/path/')).toEqual([]);
  });

  it('returns [] when contents and commonPrefixes are missing from the listing', () => {
    expect(parseObjects({}, '')).toEqual([]);
  });

  it('skips the currentPath itself when it appears as an object key (S3 folder marker)', () => {
    const listing = { contents: [{ Key: 'photos/', Size: 0 }], commonPrefixes: [] };
    expect(parseObjects(listing, 'photos/')).toEqual([]);
  });

  it('derives folder rows from commonPrefixes, stripping the current prefix', () => {
    const listing = { contents: [], commonPrefixes: ['sub/'] };
    const result = parseObjects(listing, '');
    expect(result).toEqual([
      { id: 'sub/', key: 'sub/', name: 'sub', isFolder: true },
    ]);
  });

  it('builds folder rows relative to a non-root currentPath', () => {
    const listing = { contents: [], commonPrefixes: ['root/sub/'] };
    const result = parseObjects(listing, 'root/');
    expect(result).toEqual([
      { id: 'root/sub/', key: 'root/sub/', name: 'sub', isFolder: true },
    ]);
  });

  it('preserves the given commonPrefixes order for multiple folders', () => {
    const listing = { contents: [], commonPrefixes: ['b/', 'a/'] };
    const result = parseObjects(listing, '');
    expect(result.map((i) => i.name)).toEqual(['b', 'a']);
    expect(result.every((i) => i.isFolder)).toBe(true);
  });

  it('builds file rows only from contents (current level), including media files and skipping non-media files', () => {
    const listing = {
      contents: [
        { Key: 'photo.jpg', Size: 100 },
        { Key: 'notes.txt', Size: 50 },
        { Key: 'clip.mp4', Size: 200 },
      ],
      commonPrefixes: [],
    };
    const result = parseObjects(listing, '');
    expect(result).toEqual([
      { id: 'photo.jpg', key: 'photo.jpg', name: 'photo.jpg', size: 100, isFolder: false, isVideo: false, url: null },
      { id: 'clip.mp4', key: 'clip.mp4', name: 'clip.mp4', size: 200, isFolder: false, isVideo: true, url: null },
    ]);
  });

  it('does not infer folders from contents (folders come only from commonPrefixes)', () => {
    // With delimiter-based listing, contents never holds nested keys, but the
    // mapper must not fall back to scanning contents for "/" like before.
    const listing = { contents: [{ Key: 'photo.jpg', Size: 1 }], commonPrefixes: [] };
    const result = parseObjects(listing, '');
    expect(result.some((i) => i.isFolder)).toBe(false);
  });

  it('strips the currentPath prefix to compute the file display name while keeping the full Key', () => {
    const listing = { contents: [{ Key: 'album/photo.jpg', Size: 100 }], commonPrefixes: [] };
    const result = parseObjects(listing, 'album/');
    expect(result[0].name).toBe('photo.jpg');
    expect(result[0].key).toBe('album/photo.jpg');
    expect(result[0].id).toBe('album/photo.jpg');
  });

  it('orders file rows (encounter order) before folder rows', () => {
    const listing = {
      contents: [
        { Key: 'b.jpg', Size: 2 },
        { Key: 'a.jpg', Size: 3 },
      ],
      commonPrefixes: ['sub/'],
    };
    const result = parseObjects(listing, '');
    expect(result.map((i) => i.name)).toEqual(['b.jpg', 'a.jpg', 'sub']);
    expect(result[0].isFolder).toBe(false);
    expect(result[1].isFolder).toBe(false);
    expect(result[2].isFolder).toBe(true);
  });

  it('does not attach a url for files (url is null)', () => {
    const listing = { contents: [{ Key: 'photo.jpg', Size: 1 }], commonPrefixes: [] };
    const result = parseObjects(listing, '');
    expect(result[0].url).toBeNull();
  });

  it('handles file keys with spaces, unicode, and + characters', () => {
    const listing = {
      contents: [{ Key: 'álbum/résumé + notes (v1).jpg', Size: 10 }],
      commonPrefixes: [],
    };
    const result = parseObjects(listing, 'álbum/');
    expect(result).toEqual([
      {
        id: 'álbum/résumé + notes (v1).jpg',
        key: 'álbum/résumé + notes (v1).jpg',
        name: 'résumé + notes (v1).jpg',
        size: 10,
        isFolder: false,
        isVideo: false,
        url: null,
      },
    ]);
  });

  it('handles folder prefixes with spaces, unicode, and + characters', () => {
    const listing = { contents: [], commonPrefixes: ['My Photos + Vidéos/'] };
    const result = parseObjects(listing, '');
    expect(result).toEqual([
      { id: 'My Photos + Vidéos/', key: 'My Photos + Vidéos/', name: 'My Photos + Vidéos', isFolder: true },
    ]);
  });
});

describe('dedupeById', () => {
  it('passes through items with unique ids unchanged', () => {
    const items = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    const result = dedupeById(items);
    expect(result).toEqual(items);
  });

  it('suffixes duplicate ids with a unique suffix', () => {
    const now = 1234567890;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const items = [
      { id: 'dup', name: 'first' },
      { id: 'dup', name: 'second' },
    ];
    const result = dedupeById(items);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'dup', name: 'first' });
    expect(result[1]).toEqual({ id: `dup_${now}`, name: 'second' });
    Date.now.mockRestore();
  });

  it('returns an empty array for empty input', () => {
    expect(dedupeById([])).toEqual([]);
  });
});
