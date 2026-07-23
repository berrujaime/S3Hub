import {
  classifyKey,
  isPreviewableMediaType,
  sortFiles,
  parseObjects,
  dedupeById,
  stampItemOrigin,
  stripVolatileFields,
  matchesOrigin,
} from '../fileListMapper';

describe('classifyKey', () => {
  it('classifies image extensions (case-insensitive)', () => {
    expect(classifyKey('photo.jpg')).toBe('image');
    expect(classifyKey('photo.JPEG')).toBe('image');
    expect(classifyKey('photo.png')).toBe('image');
    expect(classifyKey('photo.gif')).toBe('image');
    expect(classifyKey('photo.webp')).toBe('image');
    expect(classifyKey('path/to/photo.PNG')).toBe('image');
  });

  it('classifies video extensions (case-insensitive)', () => {
    expect(classifyKey('clip.mp4')).toBe('video');
    expect(classifyKey('clip.MOV')).toBe('video');
    expect(classifyKey('clip.avi')).toBe('video');
    expect(classifyKey('clip.MKV')).toBe('video');
    expect(classifyKey('path/to/clip.mov')).toBe('video');
  });

  it('classifies audio extensions (case-insensitive)', () => {
    expect(classifyKey('song.mp3')).toBe('audio');
    expect(classifyKey('song.WAV')).toBe('audio');
    expect(classifyKey('song.flac')).toBe('audio');
    expect(classifyKey('song.m4a')).toBe('audio');
  });

  it('classifies document extensions (case-insensitive)', () => {
    expect(classifyKey('notes.txt')).toBe('document');
    expect(classifyKey('report.PDF')).toBe('document');
    expect(classifyKey('sheet.xlsx')).toBe('document');
    expect(classifyKey('letter.docx')).toBe('document');
  });

  it('classifies archive extensions (case-insensitive)', () => {
    expect(classifyKey('backup.zip')).toBe('archive');
    expect(classifyKey('backup.RAR')).toBe('archive');
    expect(classifyKey('backup.tar')).toBe('archive');
    expect(classifyKey('backup.7z')).toBe('archive');
  });

  it('classifies unknown or missing extensions as other', () => {
    expect(classifyKey('noextension')).toBe('other');
    expect(classifyKey('archive.unknownext')).toBe('other');
    expect(classifyKey('folder/')).toBe('other');
  });

  it('does not match an extension-like substring that is not at the end of the key', () => {
    expect(classifyKey('mp4notattheend.txt')).toBe('document');
  });

  it('guards against non-string input by returning other', () => {
    expect(classifyKey(null)).toBe('other');
    expect(classifyKey(undefined)).toBe('other');
    expect(classifyKey(123)).toBe('other');
    expect(classifyKey({})).toBe('other');
  });
});

describe('isPreviewableMediaType', () => {
  it('returns true for image and video mediaTypes', () => {
    expect(isPreviewableMediaType('image')).toBe(true);
    expect(isPreviewableMediaType('video')).toBe(true);
  });

  it('returns false for audio, document, archive, and other mediaTypes', () => {
    expect(isPreviewableMediaType('audio')).toBe(false);
    expect(isPreviewableMediaType('document')).toBe(false);
    expect(isPreviewableMediaType('archive')).toBe(false);
    expect(isPreviewableMediaType('other')).toBe(false);
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

  it('builds file rows from contents (current level), including every object type instead of dropping non-media files', () => {
    const listing = {
      contents: [
        { Key: 'photo.jpg', Size: 100 },
        { Key: 'notes.txt', Size: 50 },
        { Key: 'clip.mp4', Size: 200 },
        { Key: 'archive.zip', Size: 300 },
      ],
      commonPrefixes: [],
    };
    const result = parseObjects(listing, '');
    expect(result).toEqual([
      { id: 'photo.jpg', key: 'photo.jpg', name: 'photo.jpg', size: 100, isFolder: false, isVideo: false, mediaType: 'image', url: null },
      { id: 'notes.txt', key: 'notes.txt', name: 'notes.txt', size: 50, isFolder: false, isVideo: false, mediaType: 'document', url: null },
      { id: 'clip.mp4', key: 'clip.mp4', name: 'clip.mp4', size: 200, isFolder: false, isVideo: true, mediaType: 'video', url: null },
      { id: 'archive.zip', key: 'archive.zip', name: 'archive.zip', size: 300, isFolder: false, isVideo: false, mediaType: 'archive', url: null },
    ]);
  });

  it('tags each item with a mediaType derived from classifyKey, including non-media types', () => {
    const listing = {
      contents: [
        { Key: 'song.mp3', Size: 1 },
        { Key: 'report.pdf', Size: 2 },
        { Key: 'weird.xyz', Size: 3 },
      ],
      commonPrefixes: [],
    };
    const result = parseObjects(listing, '');
    expect(result.map((i) => i.mediaType)).toEqual(['audio', 'document', 'other']);
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
        mediaType: 'image',
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

describe('stampItemOrigin', () => {
  it('stamps connectionId and bucket on every item', () => {
    const items = [
      { id: 'a.jpg', key: 'a.jpg', name: 'a.jpg' },
      { id: 'sub/', key: 'sub/', name: 'sub', isFolder: true },
    ];
    const result = stampItemOrigin(items, 'conn1', 'bucket1');
    expect(result).toHaveLength(2);
    result.forEach((item) => {
      expect(item.connectionId).toBe('conn1');
      expect(item.bucket).toBe('bucket1');
    });
  });

  it('preserves all pre-existing item fields', () => {
    const items = [
      { id: 'a.jpg', key: 'a.jpg', name: 'a.jpg', size: 10, mediaType: 'image', url: 'https://x' },
    ];
    const [stamped] = stampItemOrigin(items, 'conn1', 'bucket1');
    expect(stamped).toEqual({
      id: 'a.jpg',
      key: 'a.jpg',
      name: 'a.jpg',
      size: 10,
      mediaType: 'image',
      url: 'https://x',
      connectionId: 'conn1',
      bucket: 'bucket1',
    });
  });

  it('returns a new array with new item objects and never mutates the input', () => {
    const original = { id: 'a.jpg', key: 'a.jpg', name: 'a.jpg' };
    const items = [original];
    const result = stampItemOrigin(items, 'conn1', 'bucket1');
    expect(result).not.toBe(items);
    expect(result[0]).not.toBe(original);
    expect(original).toEqual({ id: 'a.jpg', key: 'a.jpg', name: 'a.jpg' });
    expect(items).toHaveLength(1);
  });

  it('overwrites stale origin fields from a previous stamp', () => {
    const items = [
      { id: 'a.jpg', key: 'a.jpg', connectionId: 'oldConn', bucket: 'oldBucket' },
    ];
    const [stamped] = stampItemOrigin(items, 'newConn', 'newBucket');
    expect(stamped.connectionId).toBe('newConn');
    expect(stamped.bucket).toBe('newBucket');
  });

  it('returns an empty array for empty or missing input', () => {
    expect(stampItemOrigin([], 'conn1', 'bucket1')).toEqual([]);
    expect(stampItemOrigin(null, 'conn1', 'bucket1')).toEqual([]);
    expect(stampItemOrigin(undefined, 'conn1', 'bucket1')).toEqual([]);
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

  it('suffixes duplicate ids with a deterministic incrementing suffix', () => {
    const items = [
      { id: 'dup', name: 'first' },
      { id: 'dup', name: 'second' },
      { id: 'dup', name: 'third' },
    ];
    const result = dedupeById(items);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 'dup', name: 'first' });
    expect(result[1]).toEqual({ id: 'dup_1', name: 'second' });
    expect(result[2]).toEqual({ id: 'dup_2', name: 'third' });
  });

  it('returns an empty array for empty input', () => {
    expect(dedupeById([])).toEqual([]);
  });

  it('produces the same output on repeated calls with the same input, even if the wall clock changes between calls', () => {
    // Guards against the old Date.now()-based suffix, which made the output
    // depend on the exact millisecond dedupeById was called — two calls with
    // identical input could legitimately produce different ids.
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now++);
    const items = [
      { id: 'dup', name: 'first' },
      { id: 'dup', name: 'second' },
    ];

    const first = dedupeById(items);
    const second = dedupeById(items);

    expect(second).toEqual(first);
    Date.now.mockRestore();
  });
});

describe('stripVolatileFields', () => {
  it('removes the url field from an item', () => {
    const items = [
      { id: 'a.jpg', key: 'a.jpg', name: 'a.jpg', mediaType: 'image', url: 'https://signed-url' },
    ];
    const [result] = stripVolatileFields(items);
    expect(result).toEqual({ id: 'a.jpg', key: 'a.jpg', name: 'a.jpg', mediaType: 'image' });
    expect(result).not.toHaveProperty('url');
  });

  it('leaves items without a url field unchanged (folders, non-media items)', () => {
    const items = [
      { id: 'sub/', key: 'sub/', name: 'sub', isFolder: true },
      { id: 'notes.txt', key: 'notes.txt', name: 'notes.txt', mediaType: 'document', url: null },
    ];
    const result = stripVolatileFields(items);
    expect(result[0]).toEqual({ id: 'sub/', key: 'sub/', name: 'sub', isFolder: true });
    expect(result[1]).toEqual({ id: 'notes.txt', key: 'notes.txt', name: 'notes.txt', mediaType: 'document' });
  });

  it('returns a new array with new item objects and never mutates the input', () => {
    const original = { id: 'a.jpg', key: 'a.jpg', url: 'https://signed-url' };
    const items = [original];
    const result = stripVolatileFields(items);
    expect(result).not.toBe(items);
    expect(result[0]).not.toBe(original);
    expect(original).toEqual({ id: 'a.jpg', key: 'a.jpg', url: 'https://signed-url' });
  });

  it('returns an empty array for empty or missing input', () => {
    expect(stripVolatileFields([])).toEqual([]);
    expect(stripVolatileFields(null)).toEqual([]);
    expect(stripVolatileFields(undefined)).toEqual([]);
  });
});

describe('matchesOrigin', () => {
  it('returns true when both connectionId and bucket match', () => {
    const item = { id: 'a.jpg', connectionId: 'conn1', bucket: 'bucket1' };
    expect(matchesOrigin(item, 'conn1', 'bucket1')).toBe(true);
  });

  it('returns false when the connectionId differs', () => {
    const item = { id: 'a.jpg', connectionId: 'conn1', bucket: 'bucket1' };
    expect(matchesOrigin(item, 'conn2', 'bucket1')).toBe(false);
  });

  it('returns false when the bucket differs', () => {
    const item = { id: 'a.jpg', connectionId: 'conn1', bucket: 'bucket1' };
    expect(matchesOrigin(item, 'conn1', 'bucket2')).toBe(false);
  });

  it('returns false when the item has no stamped origin', () => {
    const item = { id: 'a.jpg' };
    expect(matchesOrigin(item, 'conn1', 'bucket1')).toBe(false);
  });

  it('returns false for a null or undefined item', () => {
    expect(matchesOrigin(null, 'conn1', 'bucket1')).toBe(false);
    expect(matchesOrigin(undefined, 'conn1', 'bucket1')).toBe(false);
  });
});
