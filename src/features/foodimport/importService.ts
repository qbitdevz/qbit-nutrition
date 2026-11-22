import type { ImportedCollection, Repositories } from '@/data';
import type { DataPlatform } from '@/platform/dataPlatform';
import type { ImportPreview } from './mapping';
import { ImportReadError, READ_LIMITS, readTableFile, type ImportReadErrorCode, type ReadOptions, type TableFile } from './readFile';

export type PickResult =
  | { kind: 'cancelled' }
  | { kind: 'ok'; file: TableFile; byteLength: number }
  /** The file cannot be used; `code` says why, `limit` is the bound that was exceeded when there is one. */
  | { kind: 'refused'; code: ImportReadErrorCode; limit?: number };

/**
 * Opens the system file picker, checks the size BEFORE reading a byte, reads the table, and always removes the copy the picker
 * made in the cache. Nothing leaves the phone: the file is read from the device's own cache and no network client is involved (S6).
 */
export async function pickTableFile(platform: Pick<DataPlatform, 'picker' | 'cache'>, options: ReadOptions = {}): Promise<PickResult> {
  const picked = await platform.picker.pick();
  if (!picked) return { kind: 'cancelled' };
  const maxFileBytes = options.limits?.maxFileBytes ?? READ_LIMITS.maxFileBytes;
  try {
    const size = picked.size ?? (await platform.cache.size(picked.uri));
    if (size !== null && size > maxFileBytes) return { kind: 'refused', code: 'too_large', limit: maxFileBytes };
    const bytes = await platform.cache.read(picked.uri);
    const file = await readTableFile(bytes, picked.name, options);
    return { kind: 'ok', file, byteLength: bytes.byteLength };
  } catch (error) {
    if (error instanceof ImportReadError) return { kind: 'refused', code: error.code, limit: error.limit };
    throw error;
  } finally {
    await platform.cache.remove(picked.uri).catch(() => undefined);
  }
}

/** The name offered for the table: the file's name without its folder and extension. */
export function defaultTableName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').trim();
  return base === '' ? fileName.trim() : base;
}

export class ImportCommitError extends Error {
  constructor(
    readonly code: 'blocked' | 'failed',
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'ImportCommitError';
  }
}

export interface CommitInput {
  preview: ImportPreview;
  /** The name the person gave the table (or the preset's). */
  name: string;
  fileName: string;
  presetId: string | null;
}

/**
 * Writes the previewed foods as one named collection in ONE transaction: all of it or none of it. A preview with a blocking problem
 * is never written. Throws `ImportCommitError`: `blocked` (the mapping cannot be imported as it is) or `failed` (the write was
 * refused; the database is as it was).
 */
export async function commitImport(repos: Pick<Repositories, 'importedFoods'>, { preview, name, fileName, presetId }: CommitInput): Promise<ImportedCollection> {
  if (preview.blocking.length > 0 || preview.foods.length === 0) throw new ImportCommitError('blocked');
  try {
    return await repos.importedFoods.importCollection(
      { name, fileName, presetId, basis: preview.basis === 'ml100' ? 'ml' : 'g' },
      preview.foods.map((f) => ({ name: f.name, group: f.group, per100g: f.per100g })),
    );
  } catch (error) {
    throw new ImportCommitError('failed', { cause: error });
  }
}
