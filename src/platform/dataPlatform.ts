/**
 * What data ownership needs from the device (docs/04 flow F, docs/06 section 6), as plain interfaces: files in
 * the app's cache, the system share sheet, the document picker, and the kept meal photos. The app wires the
 * Expo modules in `expoDataPlatform.ts`; tests and the development preview use `fakeDataPlatform.ts`.
 * Importing this file pulls in no native module.
 */

/** A file the person picked: the picker copies it into the cache, so `uri` is ours to delete once it is read. */
export interface PickedFile {
  uri: string;
  name: string;
  /** Size in bytes when the system reports it. */
  size: number | null;
}

export interface CachedFile {
  uri: string;
  /** Milliseconds since the epoch. */
  modifiedAt: number;
}

export interface DataPlatform {
  cache: {
    /** Writes a temporary file in the app's cache and returns its URI. */
    write(name: string, data: string | Uint8Array): Promise<string>;
    /** Deletes a cache file. A file that is already gone is not an error; one that cannot be deleted REJECTS. */
    remove(uri: string): Promise<void>;
    read(uri: string): Promise<Uint8Array>;
    /** Size in bytes without reading the file, or null if it is not there. */
    size(uri: string): Promise<number | null>;
    /** The cache files whose name starts with `prefix`. */
    list(prefix: string): Promise<CachedFile[]>;
  };
  share: {
    /**
     * True when `shareFile` resolves only once the target is done with the file (the iOS share sheet), so the file can be removed
     * the moment it returns. False when it resolves while a target may still be reading (the Android chooser returns when an app is
     * picked): the file is then left for the startup sweep.
     */
    readonly completesWhenDone: boolean;
    /** Opens the system share sheet for a cache file. Resolves when the sheet is closed (on Android, when a target was chosen). */
    shareFile(uri: string, options: { mimeType: string; title: string }): Promise<void>;
  };
  picker: {
    /** Opens the system file picker; null when the person closes it without choosing. */
    pick(): Promise<PickedFile | null>;
    /**
     * The same picker with multiple selection on: every file the person chose (each already copied into the cache, so each `uri` is ours to delete
     * once it is read), or an empty list when they close it. expo-document-picker supports `multiple` on Android (the system picker's
     * `EXTRA_ALLOW_MULTIPLE`) and on the web.
     */
    pickMany(): Promise<PickedFile[]>;
    /** Removes the copies the picker made in the cache (a crash can leave one) and returns how many. Nothing there is not an error; a folder that cannot be cleared REJECTS. */
    clearCopies(): Promise<number>;
  };
  photos: {
    /** Relative paths (`photos/<name>.jpg`) of every kept photo on disk, referenced or not. */
    list(): Promise<string[]>;
    /** The same, with the time each file was last changed (ms since the epoch), so a sweep can leave a photo that was kept a moment ago. */
    listDetailed(): Promise<{ path: string; modifiedAt: number }[]>;
    /** The photo's bytes, or null when the file is missing. */
    read(path: string): Promise<Uint8Array | null>;
    /** Stores a photo under a new unique name and returns its relative path. Never overwrites an existing photo. */
    write(bytes: Uint8Array): Promise<string>;
    /** Deletes a kept photo. A missing file is not an error; a file that cannot be deleted REJECTS (the caller reports what was and was not removed). */
    remove(path: string): Promise<void>;
  };
}
