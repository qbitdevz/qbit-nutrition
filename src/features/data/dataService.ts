import { deriveMealTime, newId as defaultNewId, type Repositories } from '@/data';
import type { Locale } from '@/i18n/locale';
import { SUPPORTED_LOCALES } from '@/i18n/locale';
import type { DataPlatform, PickedFile } from '@/platform/dataPlatform';
import type { ProviderService } from '../settings/providerService';
import {
  ArchiveError,
  DEFAULT_LIMITS,
  isJpeg,
  parseJson,
  readDocument,
  readPhotos,
  writeJson,
  writeZip,
  type ArchiveLimits,
} from './archive';
import { ExportDocumentSchema, PHOTO_PATH_PATTERN, describePath, parseExportDocument, referencedPhotos, type ExportDocument } from './exportFormat';
import { documentFromSnapshot, snapshotFromDocument } from './exportMapping';
import { keptSettings } from './settingsPolicy';

export { MAX_FILE_BYTES } from './archive';

/** Name of the files an export leaves in the cache while the share sheet reads them. */
export const EXPORT_FILE_PREFIX = 'qbit-nutrition-export-';

/** The words that confirm "Delete all data", one per language. The typed word is checked here, not only on the screen. */
export const DELETE_CONFIRMATION_WORDS = ['DELETE', 'BORRAR'] as const;

export type ImportErrorCode =
  /** Bigger than the importer reads at all. */
  | 'too_large'
  /** The document or what the ZIP would unpack to is over the limits. */
  | 'archive_too_large'
  /** The system could not hand over the file. */
  | 'unreadable'
  /** Cut short or corrupted: a truncated file, a broken ZIP. */
  | 'damaged'
  /** Not a Qbit Nutrition export. */
  | 'not_export'
  /** Written by a newer version of the format (`fileVersion` against `supportedVersion`). */
  | 'newer_version'
  /** The structure or a value is wrong; `where` names the first place. */
  | 'invalid'
  /** The document names a photo the ZIP does not hold (`where` is its path). */
  | 'photos_missing'
  /** A photo in the ZIP is not a JPEG, or is too large (`where` is its path). */
  | 'photo_invalid'
  /** The photo folder or the current data could not be read, so nothing could be replaced safely. Nothing was changed. */
  | 'storage_unreadable'
  /** The write failed and was rolled back: the previous data is as it was. */
  | 'write_failed';

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly where?: string;
  readonly fileVersion?: number;
  readonly supportedVersion?: number;
  constructor(code: ImportErrorCode, details: { where?: string; fileVersion?: number; supportedVersion?: number; cause?: unknown } = {}) {
    super(code, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'ImportError';
    this.code = code;
    this.where = details.where;
    this.fileVersion = details.fileVersion;
    this.supportedVersion = details.supportedVersion;
  }
}

export type ExportErrorCode =
  /** A stored API key (or its URL-encoded form) is inside the text of `where`: the file is not written. */
  | 'secret_in_field'
  /** The stored keys could not be read, so it cannot be known that none is in the file: the file is not written. */
  | 'keys_unreadable'
  /** A stored value is outside what the format allows; `where` names it. */
  | 'invalid_value'
  /** The file could not be written or shared. */
  | 'failed';

export class ExportError extends Error {
  readonly code: ExportErrorCode;
  readonly where?: string;
  constructor(code: ExportErrorCode, where?: string, options?: { cause?: unknown }) {
    super(code, options);
    this.name = 'ExportError';
    this.code = code;
    this.where = where;
  }
}

/** "Delete all data" was called without the typed confirmation. */
export class NotConfirmedError extends Error {
  readonly code = 'not_confirmed' as const;
  constructor() {
    super('not_confirmed');
    this.name = 'NotConfirmedError';
  }
}

/** What a file holds, shown before anything is replaced. */
export interface ImportPreview {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  /** False: the file has no profile, and this installation's own profile stays. */
  hasProfile: boolean;
  counts: {
    meals: number;
    items: number;
    /** Weight entries. */
    weights: number;
    /** Waist, hips, chest and body fat entries. */
    measurements: number;
    goals: number;
    customFoods: number;
    providers: number;
    photos: number;
  };
  /** Earliest and latest day of any meal or measurement; null for a file with none. */
  dateRange: { from: string; to: string } | null;
  /** Provider profiles in the file: they arrive without keys. */
  providersNeedingKey: number;
}

/** A validated file, ready to replace the current data once the person confirms. Nothing has been written. */
export interface PreparedImport {
  readonly preview: ImportPreview;
  readonly document: ExportDocument;
  readonly photos: ReadonlyMap<string, Uint8Array>;
}

export interface ImportResult {
  meals: number;
  providersNeedingKey: number;
  /** The language the imported data uses, so the app can switch to it. */
  locale: Locale | null;
  /** Things the import could not clean up afterwards. The data itself was replaced; the leftovers are never used (see `applyImport`). */
  leftovers: { photos: boolean; keys: boolean };
}

export interface ExportResult {
  fileName: string;
  photos: number;
  bytes: number;
  /** Kept photos that were asked for but are not in the file (missing or unreadable). Their meals are exported without a photo. */
  skippedPhotos: string[];
}

export interface SweepSummary {
  /** Kept photos removed because no meal refers to them. */
  photos: number;
  /** Keys removed because no profile has their id. */
  keys: number;
  /** Export files and picker copies removed from the cache. */
  files: number;
  /** The steps that could not finish (they are tried again at the next start). */
  failed: ('photos' | 'keys' | 'files')[];
}

export interface DataService {
  /** Number of kept meal photos on the device (what "with photos" would add). */
  photoCount(): Promise<number>;
  /**
   * Builds the export, hands it to the system share sheet, and removes the temporary file when the platform allows (otherwise the
   * next start's sweep does). The caller shows the "health data, not encrypted" reminder first. Rejects with `ExportError` when a
   * stored key is inside the text that would be exported, or a stored value is outside the format; nothing is then written.
   */
  exportData(options: { withPhotos: boolean; shareTitle: string }): Promise<ExportResult>;
  /** Reads and validates a picked file completely, without writing anything. Rejects with `ImportError`. */
  prepareImport(file: PickedFile): Promise<PreparedImport>;
  /**
   * Replaces the current data with the prepared file, all or nothing. Rejects with `ImportError` (`write_failed`,
   * `storage_unreadable`), the previous data intact.
   *
   * Keys: imported provider profiles get FRESH ids, so no key stored before the import can ever match one. The keys of the
   * replaced profiles are removed after the commit as housekeeping; if that fails or the process dies first, they sit under ids no
   * profile has, are never read, and are removed by the next start's sweep. No failure at any step can pair a key with an imported profile.
   */
  applyImport(prepared: PreparedImport): Promise<ImportResult>;
  /** Removes every key (including keys without a profile), every kept photo and every row. Needs the typed word. Safe to run again after a failure. */
  deleteAll(options?: { confirmation: string }): Promise<void>;
  /** At every start: removes what a crash or a failed cleanup left behind (unreferenced photos, export files, picker copies, keys without a profile). */
  sweepStartup(): Promise<SweepSummary>;
}

export interface DataServiceDeps {
  repos: Pick<Repositories, 'backup' | 'meals'>;
  providers: Pick<ProviderService, 'removeKeys' | 'removeAllKeys' | 'removeOrphanKeys' | 'keyMatcher'>;
  platform: DataPlatform;
  /** The app's version, written to the file (docs/08 section 9). */
  appVersion: string;
  now?: () => Date;
  /** Ids for imported provider profiles. */
  newId?: () => string;
  /** Size limits for an import (tests lower them). */
  limits?: Partial<ArchiveLimits>;
}

const isLocale = (value: string | undefined): value is Locale => value !== undefined && (SUPPORTED_LOCALES as readonly string[]).includes(value);

function buildPreview(doc: ExportDocument, photos: number): ImportPreview {
  const days = [...doc.meals.map((m) => m.local_date), ...doc.body_measurements.map((m) => m.measured_on)].sort();
  const weights = doc.body_measurements.filter((m) => m.kind === 'weight').length;
  return {
    formatVersion: doc.format_version,
    appVersion: doc.app_version,
    exportedAt: doc.exported_at,
    hasProfile: doc.profile !== null,
    counts: {
      meals: doc.meals.length,
      items: doc.meals.reduce((sum, m) => sum + m.items.length, 0),
      weights,
      measurements: doc.body_measurements.length - weights,
      goals: doc.goals.length,
      customFoods: doc.custom_foods.length,
      providers: doc.ai_providers.length,
      photos,
    },
    dateRange: days.length > 0 ? { from: days[0]!, to: days[days.length - 1]! } : null,
    providersNeedingKey: doc.ai_providers.length,
  };
}

const quietly = async (action: () => Promise<unknown>): Promise<boolean> => {
  try {
    await action();
    return true;
  } catch {
    return false;
  }
};

/** The path (`meals[3].note`) of the first string in `value` that `leaks` accepts, or null. */
function findString(value: unknown, leaks: (text: string) => boolean, path: readonly PropertyKey[] = []): string | null {
  if (typeof value === 'string') return leaks(value) ? describePath(path) : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findString(value[i], leaks, [...path, i]);
      if (found !== null) return found;
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      const found = findString(child, leaks, [...path, key]);
      if (found !== null) return found;
    }
  }
  return null;
}

export function createDataService(deps: DataServiceDeps): DataService {
  const { repos, providers, platform, appVersion } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? defaultNewId;
  const limits: ArchiveLimits = { ...DEFAULT_LIMITS, ...deps.limits };

  /** Removes every export file and picker copy in the cache. Only called when no share can be in progress (at start, and by "Delete all"). */
  const clearCache = async (): Promise<{ removed: number; failed: boolean }> => {
    let removed = 0;
    let failed = false;
    try {
      for (const file of await platform.cache.list(EXPORT_FILE_PREFIX)) {
        if (await quietly(() => platform.cache.remove(file.uri))) removed += 1;
        else failed = true;
      }
      removed += await platform.picker.clearCopies();
    } catch {
      failed = true;
    }
    return { removed, failed };
  };

  return {
    async photoCount() {
      return (await platform.photos.list().catch(() => [])).length;
    },

    async exportData({ withPhotos, shareTitle }) {
      const snapshot = await repos.backup.read();

      // The keys are read first: if they cannot be, there is no way to know that none is in the file, so nothing is written.
      let hasKeyIn: (text: string) => boolean;
      try {
        hasKeyIn = await providers.keyMatcher();
      } catch (cause) {
        throw new ExportError('keys_unreadable', undefined, { cause });
      }

      // Photos first, so the document only names the ones that are really in the file.
      const photos = new Map<string, Uint8Array>();
      const skippedPhotos: string[] = [];
      if (withPhotos) {
        for (const path of new Set(snapshot.meals.flatMap((m) => (m.photoPath ? [m.photoPath] : [])))) {
          const bytes = PHOTO_PATH_PATTERN.test(path) ? await platform.photos.read(path).catch(() => null) : null;
          if (bytes) photos.set(path, bytes);
          else skippedPhotos.push(path);
        }
      }

      const parsed = ExportDocumentSchema.safeParse(documentFromSnapshot(snapshot, { appVersion, exportedAt: now(), includedPhotos: new Set(photos.keys()) }));
      if (!parsed.success) throw new ExportError('invalid_value', describePath(parsed.error.issues[0]?.path ?? []) || 'file');
      const document = parsed.data;

      // S4: a key the person pasted into their own data (a label, a note, a URL) is still a key. The export is not written; the
      // person is told which field to fix. (Redacting silently would change their data without telling them, and the key would
      // still be exposed in the place they typed it.)
      const leak = findString(document, hasKeyIn);
      if (leak !== null) throw new ExportError('secret_in_field', leak);

      const zipped = photos.size > 0;
      const bytes = zipped ? writeZip(document, photos) : writeJson(document);
      const fileName = `${EXPORT_FILE_PREFIX}${deriveMealTime(now()).localDate}.${zipped ? 'zip' : 'json'}`;

      let uri: string;
      try {
        uri = await platform.cache.write(fileName, bytes);
      } catch (cause) {
        throw new ExportError('failed', undefined, { cause });
      }
      try {
        await platform.share.shareFile(uri, { mimeType: zipped ? 'application/zip' : 'application/json', title: shareTitle });
      } catch (cause) {
        await quietly(() => platform.cache.remove(uri));
        throw new ExportError('failed', undefined, { cause });
      }
      // Removed as soon as the share call returns where that is safe. Where the call returns while a target may still be reading
      // (Android), the file stays in the app's private cache until the next app start sweeps it (`sweepStartup`): the worst case is
      // that file lingering for as long as the app is not restarted (or until "Delete all data").
      if (platform.share.completesWhenDone) await quietly(() => platform.cache.remove(uri));
      return { fileName, photos: photos.size, bytes: bytes.byteLength, skippedPhotos };
    },

    async prepareImport(file) {
      // The size is known before a byte is read: the picker's, or the platform's when the picker did not report one.
      let size = file.size;
      if (size === null) size = await platform.cache.size(file.uri).catch(() => null);
      if (size !== null && size > limits.maxFileBytes) {
        await quietly(() => platform.cache.remove(file.uri));
        throw new ImportError('too_large');
      }
      let bytes: Uint8Array;
      try {
        bytes = await platform.cache.read(file.uri);
      } catch (cause) {
        throw new ImportError('unreadable', { cause });
      } finally {
        // The picker copied the file into the cache for us: it is not needed after this read, whatever the outcome.
        await quietly(() => platform.cache.remove(file.uri));
      }
      if (bytes.byteLength > limits.maxFileBytes) throw new ImportError('too_large');

      let raw: unknown;
      let archive: { zipped: boolean; size: number };
      try {
        const read = readDocument(bytes, limits);
        raw = parseJson(read.text);
        archive = { zipped: read.zipped, size: read.size };
      } catch (error) {
        throw new ImportError(error instanceof ArchiveError ? (error.code === 'photo_invalid' ? 'damaged' : error.code) : 'damaged', { cause: error });
      }

      const parsed = parseExportDocument(raw);
      if (!parsed.ok) {
        if (parsed.code === 'newer_version') throw new ImportError('newer_version', { fileVersion: parsed.fileVersion, supportedVersion: parsed.supportedVersion });
        throw new ImportError(parsed.code, parsed.code === 'invalid' ? { where: parsed.where } : {});
      }

      // Only now, and only for the photos the document names, anything else is unpacked.
      const wanted = referencedPhotos(parsed.document);
      let found: Map<string, Uint8Array>;
      if (wanted.length > 0 && !archive.zipped) throw new ImportError('photos_missing', { where: wanted[0] });
      try {
        found = archive.zipped ? readPhotos(bytes, wanted, limits, archive.size) : new Map();
      } catch (error) {
        if (error instanceof ArchiveError) throw new ImportError(error.code === 'photo_invalid' ? 'photo_invalid' : error.code === 'archive_too_large' ? 'archive_too_large' : 'damaged', { where: error.where, cause: error });
        throw new ImportError('damaged', { cause: error });
      }
      const photos = new Map<string, Uint8Array>();
      for (const path of wanted) {
        const data = found.get(path);
        if (!data) throw new ImportError('photos_missing', { where: path });
        if (!isJpeg(data) || data.byteLength > limits.maxPhotoBytes) throw new ImportError('photo_invalid', { where: path });
        photos.set(path, data);
      }
      return { preview: buildPreview(parsed.document, photos.size), document: parsed.document, photos };
    },

    async applyImport({ document, photos }) {
      // What is here now, read first. If any of it cannot be read, nothing can be replaced safely: the import stops before changing anything.
      let current: Awaited<ReturnType<typeof repos.backup.read>>;
      let oldPhotos: Set<string>;
      try {
        current = await repos.backup.read();
        oldPhotos = new Set<string>([...(await platform.photos.list()), ...current.meals.flatMap((m) => (m.photoPath ? [m.photoPath] : []))]);
      } catch (cause) {
        throw new ImportError('storage_unreadable', { cause });
      }
      const oldProviderIds = current.aiProviders.map((p) => p.id);

      // 1. Stage the new photos under new names next to the old ones. Nothing old is touched.
      const stored = new Map<string, string>();
      const discardStaged = async () => {
        for (const path of stored.values()) await quietly(() => platform.photos.remove(path));
      };
      try {
        for (const [path, bytes] of photos) stored.set(path, await platform.photos.write(bytes));
      } catch (cause) {
        await discardStaged();
        throw new ImportError('write_failed', { cause });
      }

      // 2. One transaction replaces every row. A failure rolls it back; then the staged photos go and nothing else changed.
      const snapshot = snapshotFromDocument(document, { storedPhotos: stored, localProfile: current.profile, keptSettings: keptSettings(current.settings), newId });
      try {
        await repos.backup.replaceAll(snapshot);
      } catch (cause) {
        await discardStaged();
        throw new ImportError('write_failed', { cause });
      }

      // 3. The new data is in. Housekeeping: the old photos, and the keys of the replaced profiles. Imported profiles have fresh ids,
      // so nothing here is needed for correctness; whatever fails is left to the next start's sweep.
      const leftovers = { photos: false, keys: false };
      for (const path of oldPhotos) if (!(await quietly(() => platform.photos.remove(path)))) leftovers.photos = true;
      if (!(await quietly(() => providers.removeKeys(oldProviderIds)))) leftovers.keys = true;

      const language = snapshot.settings.locale ?? snapshot.profile?.locale;
      return { meals: document.meals.length, providersNeedingKey: document.ai_providers.length, locale: isLocale(language) ? language : null, leftovers };
    },

    async deleteAll(options) {
      const typed = options?.confirmation?.trim().toUpperCase() ?? '';
      if (!(DELETE_CONFIRMATION_WORDS as readonly string[]).includes(typed)) throw new NotConfirmedError();

      // Keys first: every key, with or without a profile. If any cannot be removed nothing else is deleted, so the person is never
      // left with keys they cannot reach.
      await providers.removeAllKeys();

      // Photos next, by what is on disk (referenced or not), so a retry finds whatever is left.
      let failure: unknown = null;
      for (const path of await platform.photos.list()) {
        try {
          await platform.photos.remove(path);
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;

      await repos.backup.deleteAll();
      await clearCache();
    },

    async sweepStartup() {
      const summary: SweepSummary = { photos: 0, keys: 0, files: 0, failed: [] };

      const cache = await clearCache();
      summary.files = cache.removed;
      if (cache.failed) summary.failed.push('files');

      try {
        // A kept photo no meal refers to: left by a crash (an old photo after an import's commit, a staged one before it) or a failed removal.
        // If either list cannot be read nothing is deleted: "unreferenced" cannot be told.
        const onDisk = await platform.photos.list();
        const used = new Set(await repos.meals.photoPaths());
        let failed = false;
        for (const path of onDisk) {
          if (used.has(path)) continue;
          if (await quietly(() => platform.photos.remove(path))) summary.photos += 1;
          else failed = true;
        }
        if (failed) summary.failed.push('photos');
      } catch {
        summary.failed.push('photos');
      }

      try {
        summary.keys = await providers.removeOrphanKeys();
      } catch {
        summary.failed.push('keys');
      }
      return summary;
    },
  };
}
