import { deriveMealTime, type Repositories } from '@/data';
import type { Locale } from '@/i18n/locale';
import { SUPPORTED_LOCALES } from '@/i18n/locale';
import type { DataPlatform, PickedFile } from '@/platform/dataPlatform';
import type { ProviderService } from '../settings/providerService';
import { ArchiveError, MAX_FILE_BYTES, MAX_PHOTO_BYTES, isJpeg, parseJson, readArchive, writeJson, writeZip } from './archive';
import { ExportDocumentSchema, PHOTO_PATH_PATTERN, parseExportDocument, referencedPhotos, type ExportDocument } from './exportFormat';
import { documentFromSnapshot, snapshotFromDocument } from './exportMapping';
import { keptSettings } from './settingsPolicy';

export { MAX_FILE_BYTES } from './archive';

/** Name of the files an export leaves in the cache while the share sheet reads them. */
export const EXPORT_FILE_PREFIX = 'qbit-nutrition-export-';
/** How long an export file may stay in the cache after the share sheet returned (some targets read it a little later). */
export const EXPORT_CLEANUP_DELAY_MS = 5 * 60_000;

export type ImportErrorCode =
  /** Bigger than the importer reads at all. */
  | 'too_large'
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

/** What a file holds, shown before anything is replaced. */
export interface ImportPreview {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
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
  /** Things the import could not clean up afterwards. The data itself was replaced. */
  leftovers: { photos: boolean; keys: boolean };
}

export interface ExportResult {
  fileName: string;
  photos: number;
  bytes: number;
}

export interface DataService {
  /** Number of kept meal photos on the device (what "with photos" would add). */
  photoCount(): Promise<number>;
  /**
   * Builds the export, hands it to the system share sheet, and removes the temporary file. The caller shows the
   * "health data, not encrypted" reminder first. Rejects when the file could not be made or the sheet could not open.
   */
  exportData(options: { withPhotos: boolean; shareTitle: string }): Promise<ExportResult>;
  /** Removes export files left in the cache by earlier runs. */
  sweep(): Promise<void>;
  /** Reads and validates a picked file completely, without writing anything. Rejects with `ImportError`. */
  prepareImport(file: PickedFile): Promise<PreparedImport>;
  /** Replaces the current data with the prepared file, all or nothing. Rejects with `ImportError('write_failed')`, the previous data intact. */
  applyImport(prepared: PreparedImport): Promise<ImportResult>;
  /** Removes every key, every kept photo and every row. Safe to run again after a failure. */
  deleteAll(): Promise<void>;
}

export interface DataServiceDeps {
  repos: Pick<Repositories, 'backup'>;
  providers: Pick<ProviderService, 'list' | 'removeKeys'>;
  platform: DataPlatform;
  /** The app's version, written to the file (docs/08 section 9). */
  appVersion: string;
  now?: () => Date;
  nowMs?: () => number;
  /** Runs `fn` after `ms` (the delayed removal of the export file). Default: `setTimeout`. */
  schedule?: (fn: () => void, ms: number) => void;
  cleanupDelayMs?: number;
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

export function createDataService(deps: DataServiceDeps): DataService {
  const { repos, providers, platform, appVersion } = deps;
  const now = deps.now ?? (() => new Date());
  const nowMs = deps.nowMs ?? (() => Date.now());
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms));
  const cleanupDelayMs = deps.cleanupDelayMs ?? EXPORT_CLEANUP_DELAY_MS;

  /** Export files in the cache older than `olderThanMs` (all of them with 0). */
  const sweepOlderThan = async (olderThanMs: number) => {
    const files = await platform.cache.list(EXPORT_FILE_PREFIX).catch(() => []);
    for (const file of files) if (nowMs() - file.modifiedAt >= olderThanMs) await quietly(() => platform.cache.remove(file.uri));
  };

  return {
    async photoCount() {
      return (await platform.photos.list().catch(() => [])).length;
    },

    sweep: () => sweepOlderThan(cleanupDelayMs),

    async exportData({ withPhotos, shareTitle }) {
      await sweepOlderThan(cleanupDelayMs);
      const snapshot = await repos.backup.read();

      // Photos first, so the document only names the ones that are really in the file.
      const photos = new Map<string, Uint8Array>();
      if (withPhotos) {
        for (const path of new Set(snapshot.meals.flatMap((m) => (m.photoPath ? [m.photoPath] : [])))) {
          if (!PHOTO_PATH_PATTERN.test(path)) continue;
          const bytes = await platform.photos.read(path).catch(() => null);
          if (bytes) photos.set(path, bytes);
        }
      }

      const document = ExportDocumentSchema.parse(documentFromSnapshot(snapshot, { appVersion, exportedAt: now(), includedPhotos: new Set(photos.keys()) }));
      const zipped = photos.size > 0;
      const bytes = zipped ? writeZip(document, photos) : writeJson(document);
      const fileName = `${EXPORT_FILE_PREFIX}${deriveMealTime(now()).localDate}.${zipped ? 'zip' : 'json'}`;

      const uri = await platform.cache.write(fileName, bytes);
      try {
        await platform.share.shareFile(uri, { mimeType: zipped ? 'application/zip' : 'application/json', title: shareTitle });
      } catch (error) {
        await quietly(() => platform.cache.remove(uri));
        throw error;
      }
      // The sheet is done. Some share targets (mail, drives) read the file a little after it returns, so the file is
      // removed after a delay, and any that survive a closed app are swept the next time (`sweep`).
      schedule(() => void quietly(() => platform.cache.remove(uri)), cleanupDelayMs);
      return { fileName, photos: photos.size, bytes: bytes.byteLength };
    },

    async prepareImport(file) {
      if (file.size !== null && file.size > MAX_FILE_BYTES) {
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
      if (bytes.byteLength > MAX_FILE_BYTES) throw new ImportError('too_large');

      let raw: unknown;
      let archivePhotos: ReadonlyMap<string, Uint8Array>;
      try {
        const archive = readArchive(bytes);
        raw = parseJson(archive.text);
        archivePhotos = archive.photos;
      } catch (error) {
        throw new ImportError(error instanceof ArchiveError ? error.code : 'damaged', { cause: error });
      }

      const parsed = parseExportDocument(raw);
      if (!parsed.ok) {
        if (parsed.code === 'newer_version') throw new ImportError('newer_version', { fileVersion: parsed.fileVersion, supportedVersion: parsed.supportedVersion });
        throw new ImportError(parsed.code, parsed.code === 'invalid' ? { where: parsed.where } : {});
      }

      const photos = new Map<string, Uint8Array>();
      for (const path of referencedPhotos(parsed.document)) {
        const data = archivePhotos.get(path);
        if (!data) throw new ImportError('photos_missing', { where: path });
        if (!isJpeg(data) || data.byteLength > MAX_PHOTO_BYTES) throw new ImportError('photo_invalid', { where: path });
        photos.set(path, data);
      }
      return { preview: buildPreview(parsed.document, photos.size), document: parsed.document, photos };
    },

    async applyImport({ document, photos }) {
      // What is here now, read first: the old photos and keys are removed only after the new data is in.
      const current = await repos.backup.read();
      const oldPhotos = new Set<string>([...(await platform.photos.list().catch(() => [] as string[])), ...current.meals.flatMap((m) => (m.photoPath ? [m.photoPath] : []))]);
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
      const snapshot = snapshotFromDocument(document, { storedPhotos: stored, localProfile: current.profile, keptSettings: keptSettings(current.settings) });
      try {
        await repos.backup.replaceAll(snapshot);
      } catch (cause) {
        await discardStaged();
        throw new ImportError('write_failed', { cause });
      }

      // 3. The new data is in. Now the old photos, and every key that belonged to an old or an imported profile id, are removed.
      const leftovers = { photos: false, keys: false };
      for (const path of oldPhotos) if (!(await quietly(() => platform.photos.remove(path)))) leftovers.photos = true;
      if (!(await quietly(() => providers.removeKeys([...oldProviderIds, ...document.ai_providers.map((p) => p.id)])))) leftovers.keys = true;

      const language = snapshot.settings.locale ?? snapshot.profile?.locale;
      return { meals: document.meals.length, providersNeedingKey: document.ai_providers.length, locale: isLocale(language) ? language : null, leftovers };
    },

    async deleteAll() {
      // Keys first: their ids come from the provider rows, which are still there on a retry. If any key cannot be removed
      // nothing else is deleted, so the person is never left with keys they cannot reach.
      const profiles = await providers.list();
      await providers.removeKeys(profiles.map((p) => p.id));

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
      await sweepOlderThan(0);
    },
  };
}
