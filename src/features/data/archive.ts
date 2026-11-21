/**
 * Reading and writing the export as a file: a plain `.json`, or a `.zip` that holds the same document next to
 * `photos/<name>.jpg`. The ZIP is written and read with `fflate` (MIT, pure JavaScript, no native code): Expo
 * SDK 58 has no ZIP module, and a JPEG is already compressed, so photos are stored without a second pass.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

import { PHOTO_PATH_PATTERN } from './exportFormat';

export const DOCUMENT_NAME = 'qbit-nutrition-export.json';

/** Largest file the importer reads at all (a ZIP with years of photos is far below this). */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
/** Largest document and largest single photo inside a ZIP, and the most photos: a "ZIP bomb" is refused before it is unpacked. */
export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS = 20_000;

export class ArchiveError extends Error {
  constructor(readonly code: 'damaged' | 'not_export' | 'too_large') {
    super(code);
    this.name = 'ArchiveError';
  }
}

/** A file's contents as an export: the document's JSON text, and the photos found next to it (a plain JSON file has none). */
export interface ReadArchive {
  text: string;
  photos: Map<string, Uint8Array>;
}

const isZip = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

export const isJpeg = (bytes: Uint8Array): boolean => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/**
 * Reads what the person picked. A ZIP must hold `qbit-nutrition-export.json`; entries other than that and
 * `photos/<plain name>.jpg` are skipped without being unpacked (so a path like `../x` is never read). A
 * plain file must be a JSON object. Throws `ArchiveError`: `damaged` (cut short or not a valid ZIP/JSON),
 * `not_export` (not one of ours at all), `too_large`.
 */
export function readArchive(bytes: Uint8Array): ReadArchive {
  if (isZip(bytes)) {
    let entries: Record<string, Uint8Array>;
    let count = 0;
    try {
      entries = unzipSync(bytes, {
        filter: (file) => {
          const wanted = file.name === DOCUMENT_NAME || PHOTO_PATH_PATTERN.test(file.name);
          if (!wanted) return false;
          count += 1;
          if (count > MAX_PHOTOS + 1) throw new ArchiveError('too_large');
          if (file.originalSize > (file.name === DOCUMENT_NAME ? MAX_DOCUMENT_BYTES : MAX_PHOTO_BYTES)) throw new ArchiveError('too_large');
          return true;
        },
      });
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      throw new ArchiveError('damaged');
    }
    const document = entries[DOCUMENT_NAME];
    if (!document) throw new ArchiveError('not_export');
    const photos = new Map<string, Uint8Array>();
    for (const [name, data] of Object.entries(entries)) if (name !== DOCUMENT_NAME) photos.set(name, data);
    return { text: strFromU8(document), photos };
  }

  const text = strFromU8(bytes).replace(/^\uFEFF/, '');
  if (!text.trimStart().startsWith('{')) throw new ArchiveError('not_export');
  return { text, photos: new Map() };
}

/** Parses the document text; a file cut short fails here. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ArchiveError('damaged');
  }
}

/** The document as a plain JSON file's bytes. */
export const writeJson = (document: unknown): Uint8Array => strToU8(JSON.stringify(document, null, 2));

/** The document and its photos as one ZIP (photos stored, the document deflated). */
export function writeZip(document: unknown, photos: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const files: Zippable = { [DOCUMENT_NAME]: [writeJson(document), { level: 6 }] };
  for (const [path, bytes] of photos) files[path] = [bytes, { level: 0 }];
  return zipSync(files);
}
