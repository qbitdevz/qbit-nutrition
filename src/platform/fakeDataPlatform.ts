import { strToU8 } from 'fflate';

import type { CachedFile, DataPlatform, PickedFile } from './dataPlatform';

export interface FakeDataState {
  /** Cache files by URI. */
  cache: Map<string, { bytes: Uint8Array; modifiedAt: number }>;
  /** Kept photos by relative path. */
  photos: Map<string, Uint8Array>;
  /** What the share sheet received: the name and the contents at the time (the file is deleted afterwards). */
  shared: { uri: string; name: string; mimeType: string; bytes: Uint8Array }[];
  /** What the next pick returns; null: the person closed the picker. */
  nextPick: { name: string; bytes: Uint8Array } | null;
  /** Fails the n-th photo write from now on (1 = the next one). */
  failPhotoWriteAt: number | null;
  failShare: boolean;
  failPhotoRead: Set<string>;
  failPhotoRemove: Set<string>;
  failCacheWrite: boolean;
  failPhotoList: boolean;
  /** The clock `cache.list` reports files with. */
  now: number;
  /** False: the picker does not report a size, as some providers do not. */
  reportSize: boolean;
  /** How many times a cache file was read (to prove a refused file was never read). */
  readCount: number;
  /** What `share.completesWhenDone` reports: true on a platform whose share call returns when the target is done with the file. */
  shareCompletesWhenDone: boolean;
}

export interface FakeDataPlatform extends DataPlatform {
  state: FakeDataState;
  /** Puts a photo in the kept-photos folder as if a scan had kept it. */
  addPhoto(path: string, bytes: Uint8Array): void;
}

/** Test and development stand-in for the device: in-memory cache, photos, share sheet and picker; every file stays visible in `state`. */
export function createFakeDataPlatform(initial: Partial<FakeDataState> = {}): FakeDataPlatform {
  const state: FakeDataState = {
    cache: new Map(),
    photos: new Map(),
    shared: [],
    nextPick: null,
    failPhotoWriteAt: null,
    failShare: false,
    failPhotoRead: new Set(),
    failPhotoRemove: new Set(),
    failCacheWrite: false,
    failPhotoList: false,
    now: 1_000_000,
    reportSize: true,
    readCount: 0,
    shareCompletesWhenDone: true,
    ...initial,
  };
  let counter = 0;
  let writes = 0;

  return {
    state,
    addPhoto: (path, bytes) => void state.photos.set(path, bytes),
    cache: {
      async write(name, data) {
        if (state.failCacheWrite) throw new Error('No space left on device.');
        counter += 1;
        const uri = `file:///cache/${name.startsWith('qbit-') ? name : `${counter}-${name}`}`;
        state.cache.set(uri, { bytes: typeof data === 'string' ? strToU8(data) : data, modifiedAt: state.now });
        return uri;
      },
      async remove(uri) {
        state.cache.delete(uri);
      },
      async read(uri) {
        const file = state.cache.get(uri);
        if (!file) throw new Error(`No file at ${uri}`);
        state.readCount += 1;
        return file.bytes;
      },
      async size(uri) {
        return state.cache.get(uri)?.bytes.byteLength ?? null;
      },
      async list(prefix) {
        const out: CachedFile[] = [];
        for (const [uri, file] of state.cache) if (uri.startsWith(`file:///cache/${prefix}`)) out.push({ uri, modifiedAt: file.modifiedAt });
        return out;
      },
    },
    share: {
      get completesWhenDone() {
        return state.shareCompletesWhenDone;
      },
      async shareFile(uri, { mimeType }) {
        if (state.failShare) throw new Error('The share sheet could not open.');
        const file = state.cache.get(uri);
        if (!file) throw new Error(`No file at ${uri}`);
        state.shared.push({ uri, name: uri.slice(uri.lastIndexOf('/') + 1), mimeType, bytes: file.bytes });
      },
    },
    picker: {
      async clearCopies() {
        let removed = 0;
        for (const uri of [...state.cache.keys()]) {
          if (!uri.startsWith('file:///cache/picked-')) continue;
          state.cache.delete(uri);
          removed += 1;
        }
        return removed;
      },
      async pick(): Promise<PickedFile | null> {
        if (!state.nextPick) return null;
        const { name, bytes } = state.nextPick;
        counter += 1;
        const uri = `file:///cache/picked-${counter}-${name}`;
        state.cache.set(uri, { bytes, modifiedAt: state.now });
        return { uri, name, size: state.reportSize ? bytes.byteLength : null };
      },
    },
    photos: {
      async list() {
        if (state.failPhotoList) throw new Error('The photo folder could not be read.');
        return [...state.photos.keys()];
      },
      async read(path) {
        if (state.failPhotoRead.has(path)) throw new Error('The photo could not be read.');
        return state.photos.get(path) ?? null;
      },
      async write(bytes) {
        writes += 1;
        if (state.failPhotoWriteAt !== null && writes >= state.failPhotoWriteAt) throw new Error('No space left on device.');
        counter += 1;
        const path = `photos/new-${counter}.jpg`;
        state.photos.set(path, bytes);
        return path;
      },
      async remove(path) {
        if (state.failPhotoRemove.has(path)) throw new Error('The photo could not be deleted.');
        state.photos.delete(path);
      },
    },
  };
}
