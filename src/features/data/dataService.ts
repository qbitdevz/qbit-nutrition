import { dayBounds, deriveMealTime, deviceDateLooksWrong, deviceDay, newId as defaultNewId, type BackupCounts, type Repositories } from '@/data';
import type { Locale } from '@/i18n/locale';
import { SUPPORTED_LOCALES } from '@/i18n/locale';
import type { DataPlatform, PickedFile } from '@/platform/dataPlatform';
import { hostOf } from '../settings/destination';
import { KeysNotRemovedError, type ProviderService } from '../settings/providerService';
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
import { PHOTO_PATH_PATTERN, createExportSchema, describePath, parseExportDocument, referencedPhotos, type ExportDocument } from './exportFormat';
import { boundAuditTimestamps, documentFromSnapshot, measurementsFromDocument, snapshotFromDocument } from './exportMapping';
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
  /**
   * Set when a refusal ('invalid') is likely down to this phone's date: the file was exported after the phone's own date, or the phone's date
   * is before 2000. A phone with a wrong clock rejects every valid file, so the message says that the date looks wrong.
   */
  readonly clock?: { deviceDate: string; fileDate: string | null };
  constructor(code: ImportErrorCode, details: { where?: string; fileVersion?: number; supportedVersion?: number; clock?: { deviceDate: string; fileDate: string | null }; cause?: unknown } = {}) {
    super(code, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'ImportError';
    this.code = code;
    this.where = details.where;
    this.fileVersion = details.fileVersion;
    this.supportedVersion = details.supportedVersion;
    this.clock = details.clock;
  }
}

export type ExportErrorCode =
  /** A stored API key (or its URL-encoded form) is inside the text of `where`: the file is not written. */
  | 'secret_in_field'
  /** The stored keys could not be read, so it cannot be known that none is in the file: the file is not written. */
  | 'keys_unreadable'
  /** A stored value is outside what the format allows; `where` names it (and `meal` says which meal when it is one). */
  | 'invalid_value'
  /** A meal's day is outside the days a record may have (`dayBounds`): `meal` names it, so the person can open it and change it or delete it. */
  | 'meal_out_of_range'
  /** The file would be bigger than the importer reads (the same limits): nothing was written or shared. See `kind`. */
  | 'too_large'
  /** The file could not be written or shared. */
  | 'failed';

/** The collections whose rows are independent leaves: leaving one out loses that row and nothing else (no day total, target or reference changes). */
const SKIPPABLE = ['body_measurements', 'food_usage', 'match_memory', 'barcode_products', 'goals'] as const;
type SkippableCollection = (typeof SKIPPABLE)[number];
const isSkippable = (name: unknown): name is SkippableCollection => (SKIPPABLE as readonly unknown[]).includes(name);

/** The meal an export problem is about, in words the person can recognise, with the id the screen opens it by. */
export interface ExportMealRef {
  id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  name: string | null;
  slot: string;
}

export interface ExportErrorDetails {
  cause?: unknown;
  meal?: ExportMealRef;
  /** Other meals with the same problem, besides `meal`. */
  moreMeals?: number;
  /** `too_large`: what is over its limit: the document, the document and photos together, the file itself, or the number of photos. */
  kind?: 'document' | 'total' | 'file' | 'photos';
  size?: number;
  limit?: number;
  /** `too_large` with photos: leaving the photos out would fit. */
  withoutPhotosFits?: boolean;
}

export class ExportError extends Error {
  readonly code: ExportErrorCode;
  readonly where?: string;
  readonly meal?: ExportMealRef;
  readonly moreMeals?: number;
  readonly kind?: ExportErrorDetails['kind'];
  readonly size?: number;
  readonly limit?: number;
  readonly withoutPhotosFits?: boolean;
  constructor(code: ExportErrorCode, where?: string, details: ExportErrorDetails = {}) {
    super(code, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'ExportError';
    this.code = code;
    this.where = where;
    this.meal = details.meal;
    this.moreMeals = details.moreMeals;
    this.kind = details.kind;
    this.size = details.size;
    this.limit = details.limit;
    this.withoutPhotosFits = details.withoutPhotosFits;
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

/**
 * "Delete all data" did not finish. It says exactly where it stopped and what is already gone, so the person is never told "your data is
 * still here" when part of it is not. Running it again is always safe and finishes the rest.
 */
export class DeleteIncompleteError extends Error {
  readonly code = 'delete_incomplete' as const;
  readonly dataRemoved = false as const;
  constructor(
    /** `keys` (nothing else was touched), `photos` (the keys are gone), `data` (keys and photos are gone). */
    readonly stage: 'keys' | 'photos' | 'data',
    readonly details: { keysFailed?: number; keysDeleted?: number; keysUnlistable?: boolean; photosRemoved?: number; photosFailed?: number; photosUnlistable?: boolean } = {},
    options?: { cause?: unknown },
  ) {
    super(`delete_incomplete:${stage}`, options);
    this.name = 'DeleteIncompleteError';
  }
  get keysRemoved(): boolean {
    return this.stage !== 'keys';
  }
  get keysFailed(): number {
    return this.details.keysFailed ?? 0;
  }
  /** Keys that were removed before the stop (every key is tried), so "nothing was deleted" is never said when some were. */
  get keysDeleted(): number {
    return this.details.keysDeleted ?? 0;
  }
  get keysUnlistable(): boolean {
    return this.details.keysUnlistable ?? false;
  }
  get photosRemoved(): number {
    return this.details.photosRemoved ?? 0;
  }
  get photosFailed(): number {
    return this.details.photosFailed ?? 0;
  }
  get photosUnlistable(): boolean {
    return this.details.photosUnlistable ?? false;
  }
}

/** A kept photo is left alone by the startup sweep for this long: its meal may not be saved yet. */
export const PHOTO_SWEEP_MIN_AGE_MS = 10 * 60_000;

/** What a file holds, shown before anything is replaced. */
export interface ImportPreview {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  /** False: the file has no profile, and this installation's own profile stays. */
  hasProfile: boolean;
  counts: ImportCounts;
  /** What is on this phone now, counted the same way: what "replace" would remove, shown next to `counts`. */
  current: ImportCounts;
  /** Earliest and latest day of any meal or measurement; null for a file with none. */
  dateRange: { from: string; to: string } | null;
  /** Provider profiles in the file: they arrive without keys. */
  providersNeedingKey: number;
  /** Each provider profile of the file with the host it points to: it must be checked before the profile is used. */
  providerHosts: { label: string; host: string }[];
  /** Weights the file carries that Health Connect had read; they arrive as the person's own history (`measurementsFromDocument`). */
  healthConnectWeights: number;
  /** Of those, readings not stored because the person also has their own entry for the same day. */
  mergedWeights: number;
}

/** The kinds of data a replace removes and a file brings, counted the same way on both sides. */
export interface ImportCounts {
  meals: number;
  items: number;
  /** Weight entries. */
  weights: number;
  /** Waist, hips, chest and body fat entries. */
  measurements: number;
  goals: number;
  customFoods: number;
  /** Food tables the person imported, which the file carries with all their foods. */
  importedTables: number;
  importedFoods: number;
  /** Favorites and recents. */
  favoritesAndRecents: number;
  /** Learned matches between a detected name and a food. */
  learnedMatches: number;
  barcodeProducts: number;
  providers: number;
  photos: number;
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
  /**
   * Rows left out of the file because a stored value is outside what the format (and the app) accepts. Only rows whose absence cannot
   * change what the rest of the file means can be skipped: measurements, recents/favorites, learned matches, barcode products.
   * Anything else stops the export (`invalid_value`).
   */
  skippedRows: SkippedRow[];
  /** Timestamps of when a row was written (not days the person chose) that a wrong clock had put beyond the day limits, brought to the limit. */
  clampedDates: number;
}

export interface SkippedRow {
  collection: SkippableCollection | 'meals';
  id: string;
  /** A few words that tell the person which row it was ("weight 2026-06-04"). */
  detail: string;
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
  applyImport(prepared: PreparedImport, options?: { onProgress?: (progress: ImportProgress) => void }): Promise<ImportResult>;
  /**
   * Removes every key (including keys without a profile), every kept photo and every row. Needs the typed word. Safe to run again after a
   * failure. Resolves with `exportFilesLeft: true` when everything was deleted but an earlier (unencrypted) export file could not be removed from the cache.
   */
  deleteAll(options?: { confirmation: string }): Promise<DeleteResult>;
  /** At every start: removes what a crash or a failed cleanup left behind (unreferenced photos, export files, picker copies, keys without a profile). */
  sweepStartup(): Promise<SweepSummary>;
}

/** The steps of an import, in order. The data write itself is one synchronous transaction, so it reports `writing` before it starts, never inside. */
export type ImportProgress = { step: 'photos'; done: number; total: number } | { step: 'writing' } | { step: 'cleaning' };

export interface DeleteResult {
  /** Everything was deleted, but a copy of an export could not be removed from the cache. */
  exportFilesLeft: boolean;
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
  /** Size limits for an import AND for an export: the export is refused when the importer would refuse the file (tests lower them). */
  limits?: Partial<ArchiveLimits>;
  /** Gives the screen a turn between the steps of an import (default: a short timeout). */
  yieldToUi?: () => Promise<void>;
}

const isLocale = (value: string | undefined): value is Locale => value !== undefined && (SUPPORTED_LOCALES as readonly string[]).includes(value);

function buildPreview(doc: ExportDocument, photos: number, current: ImportCounts): ImportPreview {
  const days = [...doc.meals.map((m) => m.local_date), ...doc.body_measurements.map((m) => m.measured_on)].sort();
  const weights = doc.body_measurements.filter((m) => m.kind === 'weight').length;
  const weightRule = measurementsFromDocument(doc);
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
      importedTables: doc.imported_collections.length,
      importedFoods: doc.imported_collections.reduce((sum, c) => sum + c.foods.length, 0),
      favoritesAndRecents: doc.food_usage.length,
      learnedMatches: doc.match_memory.length,
      barcodeProducts: doc.barcode_products.length,
      providers: doc.ai_providers.length,
      photos,
    },
    current,
    dateRange: days.length > 0 ? { from: days[0]!, to: days[days.length - 1]! } : null,
    providersNeedingKey: doc.ai_providers.length,
    providerHosts: doc.ai_providers.map((p) => ({ label: p.label, host: hostOf(p.base_url) })),
    healthConnectWeights: weightRule.fromHealthConnect,
    mergedWeights: weightRule.merged,
  };
}

const schemaFor = createExportSchema;

/** One frame or so: enough for the screen to paint "importing" before a long synchronous step starts. */
const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 16));

/** The meal an issue of the parsed document is about, or null when the issue is not inside a meal. */
function mealOfIssue(raw: ExportDocument, path: readonly PropertyKey[]): ExportMealRef | null {
  if (path[0] !== 'meals' || typeof path[1] !== 'number') return null;
  const m = raw.meals[path[1]];
  return m ? { id: m.id, date: m.local_date, name: m.name, slot: m.slot } : null;
}

const rowId = (collection: SkippableCollection, row: Record<string, unknown>): string => String(collection === 'barcode_products' ? row.barcode : collection === 'food_usage' ? row.food_ref : collection === 'match_memory' ? row.detected_name_normalized : row.id);
const rowDetail = (collection: SkippableCollection, row: Record<string, unknown>): string =>
  collection === 'goals' ? `goal ${String(row.start_date)} to ${row.end_date === null ? 'now' : String(row.end_date)}` : collection === 'body_measurements' ? `${String(row.kind)} ${String(row.measured_on)}` : collection === 'food_usage' ? String(row.food_ref) : collection === 'match_memory' ? String(row.detected_name_normalized) : String(row.barcode);

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
  const yieldToUi = deps.yieldToUi ?? defaultYield;

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
      const read = await repos.backup.read();
      // A meal with no items holds nothing (the app never makes one, and deleting a meal's last item deletes the meal): it is left out and reported.
      const emptyMeals = read.meals.filter((m) => m.items.length === 0);
      const snapshot = emptyMeals.length > 0 ? { ...read, meals: read.meals.filter((m) => m.items.length > 0) } : read;

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
          // A photo the importer would refuse (over the per-photo limit, or not a JPEG) is left out and reported, like one that cannot be read.
          if (bytes && bytes.byteLength <= limits.maxPhotoBytes && isJpeg(bytes)) photos.set(path, bytes);
          else skippedPhotos.push(path);
        }
      }

      // A stored value the format does not accept: a row in a skippable collection is left out and reported; anything else stops the export,
      // naming the field. (Skipping a meal or a goal would silently change totals and targets; skipping a stray measurement changes nothing else.)
      const exportedAt = now();
      let raw = documentFromSnapshot(snapshot, { appVersion, exportedAt, includedPhotos: new Set(photos.keys()) });
      // A phone whose clock was wrong for a day wrote timestamps beyond the limits: they only say when a row was touched, so they are brought to the limit
      // and counted. A day the person chose (a meal's date) is never changed: it is reported below, by meal.
      const clampedDates = boundAuditTimestamps(raw, dayBounds(exportedAt), exportedAt);
      let parsed = schemaFor(now).safeParse(raw);
      const skippedRows: SkippedRow[] = emptyMeals.map((m) => ({ collection: 'meals' as const, id: m.id, detail: `meal ${m.localDate} ${m.slot} (no items)` }));
      if (!parsed.success) {
        const bad = new Map<SkippableCollection, Set<number>>();
        let onlySkippable = true;
        for (const issue of parsed.error.issues) {
          const [collection, index] = issue.path;
          // A goal period is only left out for a DATE outside the limits (a clock that was wrong when it was set): any other goal problem stops the export.
          const goalDate = collection !== 'goals' || issue.path[2] === 'start_date' || issue.path[2] === 'end_date';
          if (isSkippable(collection) && goalDate && typeof index === 'number') bad.set(collection, (bad.get(collection) ?? new Set()).add(index));
          else onlySkippable = false;
        }
        if (onlySkippable && bad.size > 0) {
          const rows = raw as unknown as Record<SkippableCollection, Record<string, unknown>[]>;
          for (const [collection, indexes] of bad) {
            for (const index of [...indexes].sort((x, y) => x - y)) skippedRows.push({ collection, id: rowId(collection, rows[collection]![index]!), detail: rowDetail(collection, rows[collection]![index]!) });
            rows[collection] = rows[collection]!.filter((_, i) => !indexes.has(i));
          }
          raw = rows as unknown as typeof raw;
          parsed = schemaFor(now).safeParse(raw);
        }
      }
      if (!parsed.success) {
        // Name the meal (its date and name), never an array index the person cannot act on; the screen offers to open it.
        const meals = new Map<string, { ref: ExportMealRef; dayProblem: boolean; field: string }>();
        for (const issue of parsed.error.issues) {
          const ref = mealOfIssue(raw, issue.path);
          if (!ref) continue;
          const dayProblem = issue.path[2] === 'local_date' || issue.path[2] === 'eaten_at';
          const known = meals.get(ref.id);
          // The field without its array positions ("items.grams"): the meal is named by its date and name instead.
          const field = issue.path.slice(2).filter((part) => typeof part === 'string').join('.');
          meals.set(ref.id, { ref, dayProblem: dayProblem || (known?.dayProblem ?? false), field: known?.field ?? field });
        }
        const first = [...meals.values()].find((m) => m.dayProblem) ?? [...meals.values()][0];
        if (first) {
          const meal = `meal ${first.ref.date} ${first.ref.name ?? first.ref.slot}`;
          throw new ExportError(first.dayProblem ? 'meal_out_of_range' : 'invalid_value', first.dayProblem ? meal : `${first.field} of ${meal}`, { meal: first.ref, moreMeals: meals.size - 1 });
        }
        throw new ExportError('invalid_value', describePath(parsed.error.issues[0]?.path ?? []) || 'file');
      }
      const document = parsed.data;

      // S4: a key the person pasted into their own data (a label, a note, a URL) is still a key. The export is not written; the
      // person is told which field to fix. (Redacting silently would change their data without telling them, and the key would
      // still be exposed in the place they typed it.)
      const leak = findString(document, hasKeyIn);
      if (leak !== null) throw new ExportError('secret_in_field', leak);

      // The importer's own limits apply to what is written (one definition: `limits`), checked before anything is written or shared, so the app
      // never makes a file it then refuses to read. Compact JSON keeps the document as small as the format allows.
      const documentBytes = writeJson(document);
      const zipped = photos.size > 0;
      const photoBytes = [...photos.values()].reduce((sum, p) => sum + p.byteLength, 0);
      const tooLarge = (kind: NonNullable<ExportErrorDetails['kind']>, size: number, limit: number) => {
        // Would the same data fit as a plain file, with no photos (so no photo paths in the document either)?
        const plain = zipped ? writeJson({ ...document, meals: document.meals.map((m) => ({ ...m, photo_path: null })) }).byteLength : documentBytes.byteLength;
        const fits = plain <= limits.maxDocumentBytes && plain <= limits.maxTotalBytes && plain <= limits.maxFileBytes;
        return new ExportError('too_large', kind, { kind, size, limit, withoutPhotosFits: zipped && fits });
      };
      if (documentBytes.byteLength > limits.maxDocumentBytes) throw tooLarge('document', documentBytes.byteLength, limits.maxDocumentBytes);
      if (zipped && photos.size > limits.maxPhotos) throw tooLarge('photos', photos.size, limits.maxPhotos);
      if (zipped && documentBytes.byteLength + photoBytes > limits.maxTotalBytes) throw tooLarge('total', documentBytes.byteLength + photoBytes, limits.maxTotalBytes);
      const bytes = zipped ? writeZip(documentBytes, photos) : documentBytes;
      if (bytes.byteLength > limits.maxFileBytes) throw tooLarge('file', bytes.byteLength, limits.maxFileBytes);
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
      return { fileName, photos: photos.size, bytes: bytes.byteLength, skippedPhotos, skippedRows, clampedDates };
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

      const parsed = parseExportDocument(raw, now);
      if (!parsed.ok) {
        if (parsed.code === 'newer_version') throw new ImportError('newer_version', { fileVersion: parsed.fileVersion, supportedVersion: parsed.supportedVersion });
        if (parsed.code === 'invalid') {
          // A phone whose clock is wrong rejects every valid file. When the phone's date is before 2000, or the file was exported after the
          // phone's own date, the date is the likely cause and the message says so (with both dates, so the person can compare).
          const exported = (raw as { exported_at?: unknown }).exported_at;
          const fileDate = typeof exported === 'string' && /^\d{4}-\d{2}-\d{2}/.test(exported) ? exported.slice(0, 10) : null;
          const clockLikely = deviceDateLooksWrong(now()) || (fileDate !== null && fileDate > dayBounds(now()).latest);
          throw new ImportError('invalid', { where: parsed.where, ...(clockLikely ? { clock: { deviceDate: deviceDay(now()), fileDate } } : {}) });
        }
        throw new ImportError(parsed.code);
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
      // What is on this phone now, counted the same way, so the person sees what replacing removes next to what the file brings.
      let current: ImportCounts;
      try {
        const counts: BackupCounts = await repos.backup.counts();
        current = { ...counts, photos: (await platform.photos.list().catch(() => [])).length };
      } catch (cause) {
        throw new ImportError('storage_unreadable', { cause });
      }
      return { preview: buildPreview(parsed.document, photos.size, current), document: parsed.document, photos };
    },

    async applyImport({ document, photos }, options = {}) {
      const report = (progress: ImportProgress) => {
        try {
          options.onProgress?.(progress);
        } catch {
          // A broken progress display must never fail an import.
        }
      };
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
        if (photos.size > 0) {
          report({ step: 'photos', done: 0, total: photos.size });
          await yieldToUi();
        }
        for (const [path, bytes] of photos) {
          stored.set(path, await platform.photos.write(bytes));
          report({ step: 'photos', done: stored.size, total: photos.size });
          await yieldToUi();
        }
      } catch (cause) {
        await discardStaged();
        throw new ImportError('write_failed', { cause });
      }

      // 2. One transaction replaces every row. A failure rolls it back; then the staged photos go and nothing else changed.
      const snapshot = snapshotFromDocument(document, { storedPhotos: stored, localProfile: current.profile, keptSettings: keptSettings(current.settings), newId });
      // The write is ONE synchronous transaction on the JavaScript thread (the SQLite driver is synchronous): nothing can be shown or tapped
      // while it runs, and it cannot report progress from inside. So the screen is told first and given a turn to paint, then it runs.
      report({ step: 'writing' });
      await yieldToUi();
      try {
        await repos.backup.replaceAll(snapshot);
      } catch (cause) {
        await discardStaged();
        throw new ImportError('write_failed', { cause });
      }

      // 3. The new data is in. Housekeeping: the old photos, and the keys of the replaced profiles. Imported profiles have fresh ids,
      // so nothing here is needed for correctness; whatever fails is left to the next start's sweep.
      const leftovers = { photos: false, keys: false };
      report({ step: 'cleaning' });
      await yieldToUi();
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
      try {
        await providers.removeAllKeys();
      } catch (cause) {
        if (cause instanceof KeysNotRemovedError) throw new DeleteIncompleteError('keys', { keysFailed: cause.failed, keysDeleted: cause.removed, keysUnlistable: cause.unlistable }, { cause });
        throw new DeleteIncompleteError('keys', { keysFailed: 1 }, { cause });
      }

      // Photos next, by what is on disk (referenced or not), so a retry finds whatever is left.
      let paths: string[];
      try {
        paths = await platform.photos.list();
      } catch (cause) {
        throw new DeleteIncompleteError('photos', { photosUnlistable: true }, { cause });
      }
      let photosRemoved = 0;
      let photosFailed = 0;
      for (const path of paths) {
        if (await quietly(() => platform.photos.remove(path))) photosRemoved += 1;
        else photosFailed += 1;
      }
      if (photosFailed > 0) throw new DeleteIncompleteError('photos', { photosRemoved, photosFailed });

      try {
        await repos.backup.deleteAll();
      } catch (cause) {
        throw new DeleteIncompleteError('data', { photosRemoved, photosFailed: 0 }, { cause });
      }
      // The data is gone. A copy of an earlier export (unencrypted health data) that cannot be removed is said, never hidden.
      const cache = await clearCache();
      return { exportFilesLeft: cache.failed };
    },

    async sweepStartup() {
      const summary: SweepSummary = { photos: 0, keys: 0, files: 0, failed: [] };

      const cache = await clearCache();
      summary.files = cache.removed;
      if (cache.failed) summary.failed.push('files');

      try {
        // A kept photo no meal refers to: left by a crash (an old photo after an import's commit, a staged one before it) or a failed removal.
        // If either list cannot be read nothing is deleted: "unreferenced" cannot be told.
        // A photo kept a moment ago may be waiting for its meal to be saved: files younger than `PHOTO_SWEEP_MIN_AGE_MS` are left for the next start.
        const onDisk = await platform.photos.listDetailed();
        const used = new Set(await repos.meals.photoPaths());
        const at = now().getTime();
        let failed = false;
        for (const { path, modifiedAt } of onDisk) {
          if (used.has(path) || at - modifiedAt < PHOTO_SWEEP_MIN_AGE_MS) continue;
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
