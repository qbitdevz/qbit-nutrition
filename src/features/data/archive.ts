/**
 * Reading and writing the export as a file: a plain `.json`, or a `.zip` that holds the same document next to
 * `photos/<name>.jpg`. The ZIP is written and read with `fflate` (MIT, pure JavaScript, no native code): Expo
 * SDK 58 has no ZIP module, and a JPEG is already compressed, so photos are stored without a second pass.
 *
 * Reading is in two steps so that nothing is unpacked that is not needed: first only the document is unpacked (its
 * declared size is checked first), and once the document has been validated, only the photos it names, each checked
 * against the per-photo limit and the total budget before it is unpacked. Everything else in the ZIP is never touched.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

import { PHOTO_PATH_PATTERN } from './exportFormat';

export const DOCUMENT_NAME = 'qbit-nutrition-export.json';

export interface ArchiveLimits {
  /** Largest file the importer reads at all. */
  maxFileBytes: number;
  /** Largest document (plain, or inside a ZIP). */
  maxDocumentBytes: number;
  /** Largest single photo. */
  maxPhotoBytes: number;
  /** Most the document and the photos may unpack to, together. A "ZIP bomb" is refused by its declared sizes before any of it is unpacked. */
  maxTotalBytes: number;
  maxPhotos: number;
}

export const DEFAULT_LIMITS: ArchiveLimits = {
  maxFileBytes: 256 * 1024 * 1024,
  maxDocumentBytes: 64 * 1024 * 1024,
  maxPhotoBytes: 8 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxPhotos: 20_000,
};

/** Kept for callers that only need the default of the whole-file limit. */
export const MAX_FILE_BYTES = DEFAULT_LIMITS.maxFileBytes;
export const MAX_PHOTO_BYTES = DEFAULT_LIMITS.maxPhotoBytes;

export class ArchiveError extends Error {
  constructor(
    readonly code: 'damaged' | 'not_export' | 'too_large' | 'archive_too_large' | 'photo_invalid',
    readonly where?: string,
  ) {
    super(code);
    this.name = 'ArchiveError';
  }
}

const isZip = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

export const isJpeg = (bytes: Uint8Array): boolean => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

export interface ReadDocument {
  text: string;
  /** Bytes the document takes once unpacked: counted against the total budget. */
  size: number;
  zipped: boolean;
}

/**
 * Step one. A ZIP must hold `qbit-nutrition-export.json`; every other entry is skipped without being unpacked. A plain file must be a
 * JSON object. Throws `ArchiveError`: `damaged` (cut short or not a valid ZIP), `not_export` (not one of ours at all),
 * `archive_too_large` (the document is over the limit).
 */
export function readDocument(bytes: Uint8Array, limits: ArchiveLimits): ReadDocument {
  if (isZip(bytes)) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes, {
        filter: (file) => {
          if (file.name !== DOCUMENT_NAME) return false;
          if (file.originalSize > limits.maxDocumentBytes) throw new ArchiveError('archive_too_large');
          return true;
        },
      });
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      throw new ArchiveError('damaged');
    }
    const document = entries[DOCUMENT_NAME];
    if (!document) throw new ArchiveError('not_export');
    if (document.byteLength > limits.maxDocumentBytes) throw new ArchiveError('archive_too_large');
    return { text: strFromU8(document), size: document.byteLength, zipped: true };
  }

  if (bytes.byteLength > limits.maxDocumentBytes) throw new ArchiveError('archive_too_large');
  const text = strFromU8(bytes).replace(/^\uFEFF/, '');
  if (!text.trimStart().startsWith('{')) throw new ArchiveError('not_export');
  return { text, size: bytes.byteLength, zipped: false };
}

/**
 * Step two: the photos the validated document names, from the ZIP. Only those entries are unpacked. Each must fit the per-photo
 * limit (`photo_invalid`, naming the photo) and together with the document the total (`archive_too_large`). A photo the ZIP does not
 * hold is simply absent from the result (the caller reports it).
 */
export function readPhotos(bytes: Uint8Array, wanted: readonly string[], limits: ArchiveLimits, documentSize: number): Map<string, Uint8Array> {
  const photos = new Map<string, Uint8Array>();
  if (wanted.length === 0) return photos;
  if (wanted.length > limits.maxPhotos) throw new ArchiveError('archive_too_large');
  const names = new Set(wanted);
  let total = documentSize;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        if (!names.has(file.name)) return false;
        if (file.originalSize > limits.maxPhotoBytes) throw new ArchiveError('photo_invalid', file.name);
        total += file.originalSize;
        if (total > limits.maxTotalBytes) throw new ArchiveError('archive_too_large');
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError('damaged');
  }
  for (const [name, data] of Object.entries(entries)) photos.set(name, data);
  return photos;
}

/** True when a ZIP entry name is one the importer would ever read as a photo. */
export const isPhotoEntry = (name: string): boolean => PHOTO_PATH_PATTERN.test(name);

/** Parses the document text; a file cut short fails here. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ArchiveError('damaged');
  }
}

/**
 * The document as a plain JSON file's bytes. Compact on purpose: indentation is a third of the size of a large export, and the size is
 * what the limits below are measured on (the export checks it against the same limits the importer applies).
 */
export const writeJson = (document: unknown): Uint8Array => strToU8(JSON.stringify(document));

/** The document's bytes (`writeJson`) and its photos as one ZIP (photos stored, the document deflated). */
export function writeZip(documentBytes: Uint8Array, photos: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const files: Zippable = { [DOCUMENT_NAME]: [documentBytes, { level: 6 }] };
  for (const [path, bytes] of photos) files[path] = [bytes, { level: 0 }];
  return zipSync(files);
}
