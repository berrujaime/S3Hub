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
  it('returns [] for null or undefined contents', () => {
    expect(parseObjects(null, '')).toEqual([]);
    expect(parseObjects(undefined, 'some/path/')).toEqual([]);
  });

  it('skips the currentPath itself (relativeKey === "")', () => {
    const contents = [{ Key: 'photos/', Size: 0 }];
    expect(parseObjects(contents, 'photos/')).toEqual([]);
  });

  it('detects directories via the first "/" in the relative key', () => {
    const contents = [{ Key: 'sub/image.jpg', Size: 10 }];
    const result = parseObjects(contents, '');
    expect(result).toEqual([
      { id: 'sub/', key: 'sub/', name: 'sub', isFolder: true },
    ]);
  });

  it('dedupes directory names into a single folder item', () => {
    const contents = [
      { Key: 'sub/a.jpg', Size: 1 },
      { Key: 'sub/b.jpg', Size: 2 },
    ];
    const result = parseObjects(contents, '');
    const folders = result.filter(i => i.isFolder);
    expect(folders).toEqual([{ id: 'sub/', key: 'sub/', name: 'sub', isFolder: true }]);
  });

  it('builds folder keys relative to currentPath', () => {
    const contents = [{ Key: 'root/sub/file.jpg', Size: 5 }];
    const result = parseObjects(contents, 'root/');
    expect(result).toEqual([
      { id: 'root/sub/', key: 'root/sub/', name: 'sub', isFolder: true },
    ]);
  });

  it('includes media files and skips non-media files', () => {
    const contents = [
      { Key: 'photo.jpg', Size: 100 },
      { Key: 'notes.txt', Size: 50 },
      { Key: 'clip.mp4', Size: 200 },
    ];
    const result = parseObjects(contents, '');
    expect(result).toEqual([
      { id: 'photo.jpg', key: 'photo.jpg', name: 'photo.jpg', size: 100, isFolder: false, isVideo: false, url: null },
      { id: 'clip.mp4', key: 'clip.mp4', name: 'clip.mp4', size: 200, isFolder: false, isVideo: true, url: null },
    ]);
  });

  it('strips the currentPath prefix to compute the file name', () => {
    const contents = [{ Key: 'album/photo.jpg', Size: 100 }];
    const result = parseObjects(contents, 'album/');
    expect(result[0].name).toBe('photo.jpg');
    expect(result[0].key).toBe('album/photo.jpg');
    expect(result[0].id).toBe('album/photo.jpg');
  });

  it('orders files first (encounter order) then folders', () => {
    const contents = [
      { Key: 'sub/nested.jpg', Size: 1 },
      { Key: 'b.jpg', Size: 2 },
      { Key: 'a.jpg', Size: 3 },
    ];
    const result = parseObjects(contents, '');
    expect(result.map(i => i.name)).toEqual(['b.jpg', 'a.jpg', 'sub']);
    expect(result[0].isFolder).toBe(false);
    expect(result[1].isFolder).toBe(false);
    expect(result[2].isFolder).toBe(true);
  });

  it('does not attach a url for files (url is null)', () => {
    const contents = [{ Key: 'photo.jpg', Size: 1 }];
    const result = parseObjects(contents, '');
    expect(result[0].url).toBeNull();
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
