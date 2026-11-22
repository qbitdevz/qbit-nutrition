/**
 * The device implementation of the data platform, against a fake of the Expo file API (files and folders in memory, with
 * failures that can be switched on). What matters here: a removal that fails is REPORTED (the service counts on it to say what
 * was and was not deleted), and one that finds nothing to remove is not an error.
 */
import { Platform } from 'react-native';

import { createExpoDataPlatform } from '../expoDataPlatform';

interface Entry {
  bytes: Uint8Array;
  modifiedAt: number;
}
const mockDisk = new Map<string, Entry>();
const mockDirs = new Set<string>();
const mockFailDelete = new Set<string>();
let mockPickOptions: unknown[] = [];
let mockPick: { canceled: boolean; assets?: { uri: string; name: string; size?: number }[] } = { canceled: true };
let mockSharingAvailable = true;
const mockShared: { uri: string; options: unknown }[] = [];

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) => parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/').replace(/\/+/g, '/').replace('file:/', 'file:///');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockDirs.has(this.uri);
    }
    create() {
      mockDirs.add(this.uri);
    }
    delete() {
      if (mockFailDelete.has(this.uri)) throw new Error('could not delete folder');
      mockDirs.delete(this.uri);
      for (const key of [...mockDisk.keys()]) if (key.startsWith(`${this.uri}/`)) mockDisk.delete(key);
    }
    list() {
      const prefix = `${this.uri}/`;
      return [...mockDisk.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map((k) => new File(k));
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists() {
      return mockDisk.has(this.uri);
    }
    get size() {
      return mockDisk.get(this.uri)?.bytes.byteLength ?? 0;
    }
    get lastModified() {
      return mockDisk.get(this.uri)?.modifiedAt ?? null;
    }
    create() {
      mockDisk.set(this.uri, { bytes: new Uint8Array(), modifiedAt: 1000 });
    }
    async write(data: string | Uint8Array) {
      mockDisk.set(this.uri, { bytes: typeof data === 'string' ? new TextEncoder().encode(data) : data, modifiedAt: 2000 });
    }
    async bytes() {
      return mockDisk.get(this.uri)!.bytes;
    }
    delete() {
      if (mockFailDelete.has(this.uri)) throw new Error('could not delete file');
      mockDisk.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///documents' }, cache: { uri: 'file:///cache' } } };
});
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: async (options: unknown) => {
    mockPickOptions.push(options);
    return mockPick;
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => mockSharingAvailable,
  shareAsync: async (uri: string, options: unknown) => void mockShared.push({ uri, options }),
}));

const bytes = (...values: number[]) => Uint8Array.from(values);

beforeEach(() => {
  mockDisk.clear();
  mockDirs.clear();
  mockFailDelete.clear();
  mockShared.length = 0;
  mockPick = { canceled: true };
  mockSharingAvailable = true;
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('kept photos', () => {
  it('writes under a new name each time and lists, reads and removes by relative path', async () => {
    const platform = createExpoDataPlatform();
    const first = await platform.photos.write(bytes(1, 2));
    const second = await platform.photos.write(bytes(3));
    expect(first).toMatch(/^photos\/[a-z0-9]+-[a-z0-9]+\.jpg$/);
    expect(second).not.toBe(first);
    expect((await platform.photos.list()).sort()).toEqual([first, second].sort());
    expect([...(await platform.photos.read(first))!]).toEqual([1, 2]);
    await platform.photos.remove(first);
    expect(await platform.photos.read(first)).toBeNull();
    expect(await platform.photos.list()).toEqual([second]);
  });

  it('lists with the time each photo was last changed, so a sweep can leave a fresh one alone', async () => {
    const platform = createExpoDataPlatform();
    const path = await platform.photos.write(bytes(1));
    expect(await platform.photos.listDetailed()).toEqual([{ path, modifiedAt: 2000 }]);
  });

  it('lists nothing when the folder does not exist yet', async () => {
    expect(await createExpoDataPlatform().photos.list()).toEqual([]);
  });

  it('REPORTS a photo that cannot be removed instead of swallowing it', async () => {
    const platform = createExpoDataPlatform();
    const path = await platform.photos.write(bytes(1));
    mockFailDelete.add(`file:///documents/${path}`);
    await expect(platform.photos.remove(path)).rejects.toThrow('could not delete file');
    expect(await platform.photos.read(path)).not.toBeNull(); // still there, and now the caller knows
  });

  it('a photo that is already gone is not an error', async () => {
    await expect(createExpoDataPlatform().photos.remove('photos/missing.jpg')).resolves.toBeUndefined();
  });
});

describe('the cache', () => {
  it('writes, sizes, lists by prefix with the modification time, reads and removes', async () => {
    const platform = createExpoDataPlatform();
    const uri = await platform.cache.write('qbit-nutrition-export-2026-11-21.json', '{"a":1}');
    await platform.cache.write('other.txt', 'x');
    expect(await platform.cache.size(uri)).toBe(7);
    expect(await platform.cache.size('file:///cache/nothing')).toBeNull();
    expect(await platform.cache.list('qbit-nutrition-export-')).toEqual([{ uri, modifiedAt: 2000 }]);
    expect(new TextDecoder().decode(await platform.cache.read(uri))).toBe('{"a":1}');
    await platform.cache.remove(uri);
    expect(await platform.cache.list('qbit-nutrition-export-')).toEqual([]);
  });

  it('REPORTS a file that cannot be removed, and does not complain about one that is gone', async () => {
    const platform = createExpoDataPlatform();
    const uri = await platform.cache.write('qbit-nutrition-export-x.json', '{}');
    mockFailDelete.add(uri);
    await expect(platform.cache.remove(uri)).rejects.toThrow('could not delete file');
    await expect(platform.cache.remove('file:///cache/never-existed')).resolves.toBeUndefined();
  });
});

describe('the file picker, for several files at once (B2)', () => {
  it('asks the system picker for multiple selection (supported by expo-document-picker on Android and the web) and returns every copy', async () => {
    const platform = createExpoDataPlatform();
    mockPickOptions = [];
    mockPick = {
      canceled: false,
      assets: [
        { uri: 'file:///cache/DocumentPicker/1/a.xls', name: 'a.xls', size: 10 },
        { uri: 'file:///cache/DocumentPicker/2/b.xls', name: 'b.xls' },
      ],
    };
    expect(await platform.picker.pickMany()).toEqual([
      { uri: 'file:///cache/DocumentPicker/1/a.xls', name: 'a.xls', size: 10 },
      { uri: 'file:///cache/DocumentPicker/2/b.xls', name: 'b.xls', size: null },
    ]);
    expect(mockPickOptions).toEqual([expect.objectContaining({ multiple: true, copyToCacheDirectory: true })]);
  });

  it('returns nothing when the person closes it, and keeps pick() for one file', async () => {
    const platform = createExpoDataPlatform();
    mockPick = { canceled: true };
    expect(await platform.picker.pickMany()).toEqual([]);
    mockPickOptions = [];
    mockPick = { canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/1/a.xls', name: 'a.xls', size: 10 }] };
    await platform.picker.pick();
    expect(mockPickOptions).toEqual([expect.objectContaining({ multiple: false })]);
  });
});

describe('the file picker', () => {
  it('returns the cache copy with its name and size, or null when the person closes it', async () => {
    const platform = createExpoDataPlatform();
    expect(await platform.picker.pick()).toBeNull();
    mockPick = { canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/1/export.zip', name: 'export.zip', size: 123 }] };
    expect(await platform.picker.pick()).toEqual({ uri: 'file:///cache/DocumentPicker/1/export.zip', name: 'export.zip', size: 123 });
    mockPick = { canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/1/export.zip', name: 'export.zip' }] };
    expect((await platform.picker.pick())!.size).toBeNull();
  });

  it('clears the copies it made and says how many, and reports a folder that cannot be cleared', async () => {
    const platform = createExpoDataPlatform();
    mockDirs.add('file:///cache/DocumentPicker');
    mockDisk.set('file:///cache/DocumentPicker/a', { bytes: bytes(1), modifiedAt: 1 });
    mockDisk.set('file:///cache/DocumentPicker/b', { bytes: bytes(2), modifiedAt: 1 });
    expect(await platform.picker.clearCopies()).toBe(2);
    expect(mockDirs.has('file:///cache/DocumentPicker')).toBe(false);

    mockDirs.add('file:///cache/DocumentPicker');
    mockFailDelete.add('file:///cache/DocumentPicker');
    await expect(platform.picker.clearCopies()).rejects.toThrow('could not delete folder');
    mockFailDelete.clear();
    mockDirs.delete('file:///cache/DocumentPicker');
    expect(await platform.picker.clearCopies()).toBe(0); // nothing there is not an error
  });
});

describe('sharing', () => {
  it('hands the file to the system with its type and title, and says when sharing is not available', async () => {
    const platform = createExpoDataPlatform();
    await platform.share.shareFile('file:///cache/x.json', { mimeType: 'application/json', title: 'Export' });
    expect(mockShared).toEqual([{ uri: 'file:///cache/x.json', options: { mimeType: 'application/json', dialogTitle: 'Export' } }]);
    mockSharingAvailable = false;
    await expect(platform.share.shareFile('file:///cache/x.json', { mimeType: 'application/json', title: 'Export' })).rejects.toThrow();
  });

  it('removes the file when the share call returns only where that call means the target is done (iOS), not on Android', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(createExpoDataPlatform().share.completesWhenDone).toBe(true);
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(createExpoDataPlatform().share.completesWhenDone).toBe(false);
  });
});
