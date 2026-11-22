import { IMPORT_LIMITS, contentFingerprint, type CollectionBasis, type ImportedCollection, type NewImportedFood, type Repositories } from '@/data';
import type { DataPlatform, PickedFile } from '@/platform/dataPlatform';
import { assessMapping, type Assessment, type ConfirmKind } from './confidence';
import { suggestMapping } from './headers';
import { defaultTableName, readPicked } from './importService';
import { buildPreviewAsync, type Blocking, type ImportMapping, type ImportPreview } from './mapping';
import { detectPreset, presetById } from './presets';
import type { CancelToken, ImportReadErrorCode, TableFile } from './readFile';
import { yieldToUi } from './readTypes';

/**
 * Importing food tables in batches (S9): several files picked at once are read one after the other and judged one by one; the person sees
 * ONE combined preview, deselects what they do not want, answers what needs an answer, and the accepted files are written. Each table is
 * written in ONE transaction of its own: a file that fails writes nothing of itself and never undoes the files already written.
 *
 * The pieces, in order: `analyseFile` (what is this file, how sure are we, is it already here) → `buildPlan` (pure: which tables would be
 * written, what is still undecided) → `runPlan` (the writes, and a report of exactly what happened to every file).
 */

/** What a file turned out to be. Only `ready` can be imported as it is read. */
export type FileOutcome =
  | { kind: 'ready' }
  /** Read fine, and holds nothing the app can use (a sheet of fatty acids only): listed as such, not an error. */
  | { kind: 'nothing_usable' }
  /** Holds something, but not as it was read (no name column, a unit the app cannot convert): the person can choose the columns. */
  | { kind: 'needs_mapping'; blocking: Blocking[] }
  /** Could not be read at all (too large, damaged, a PDF). */
  | { kind: 'refused'; code: ImportReadErrorCode; limit?: number };

export interface AnalysedFile {
  /** Stable within a batch. */
  id: string;
  fileName: string;
  outcome: FileOutcome;
  file: TableFile | null;
  mapping: ImportMapping | null;
  /** The published layout that recognised it. */
  preset: { id: string; name: string } | null;
  /** The name offered for the table. */
  defaultName: string;
  preview: ImportPreview | null;
  assessment: Assessment | null;
  /** The person adjusted the columns by hand (what the mapping screen shows is not asked again). */
  reviewed: boolean;
  contentHash: string | null;
  /** Tables already here with this file's content. */
  matches: ImportedCollection[];
}

export function refusedFile(id: string, fileName: string, code: ImportReadErrorCode, limit?: number): AnalysedFile {
  return { id, fileName, outcome: { kind: 'refused', code, limit }, file: null, mapping: null, preset: null, defaultName: defaultTableName(fileName), preview: null, assessment: null, reviewed: false, contentHash: null, matches: [] };
}

/** The foods of a file as the repository takes them. */
const foodsOf = (preview: ImportPreview): NewImportedFood[] => preview.foods.map((f) => ({ name: f.name, group: f.group, per100g: f.per100g }));
const basisOf = (preview: ImportPreview): CollectionBasis => (preview.basis === 'ml100' ? 'ml' : 'g');

function classify(preview: ImportPreview): FileOutcome {
  const kinds = preview.blocking.map((b) => b.kind);
  if (kinds.length === 0) return { kind: 'ready' };
  // Nothing the app tracks, or no food with a value at all (and no row left out for an impossible value, which would be a wrong unit to fix).
  if (kinds.includes('no_nutrients') || (kinds.length === 1 && kinds[0] === 'no_foods' && preview.counts.skipped.out_of_range === 0)) return { kind: 'nothing_usable' };
  return { kind: 'needs_mapping', blocking: preview.blocking };
}

export interface AnalyseOptions {
  /** The person's own mapping (after the mapping screen) instead of the one the importer found. */
  override?: { mapping: ImportMapping; name?: string };
  cancel?: CancelToken;
  onProgress?: (fraction: number) => void;
}

/** Reads one table as the importer would by default (a recognised layout, else the headers), judges it, and looks for it among the tables already here. */
export async function analyseFile(repos: Pick<Repositories, 'importedFoods'>, input: { id: string; file: TableFile }, options: AnalyseOptions = {}): Promise<AnalysedFile> {
  const { id, file } = input;
  const recognised = options.override ? null : detectPreset(file);
  const mapping = options.override?.mapping ?? (recognised ? recognised.mapping : suggestMapping(file, 0).mapping);
  const preset = mapping.presetId ? presetById(mapping.presetId) : null;
  const preview = await buildPreviewAsync(file, mapping, { cancel: options.cancel, onProgress: options.onProgress });
  const outcome = classify(preview);
  const reviewed = options.override !== undefined;
  const assessment = assessMapping(file, mapping, preview, { preset: preset?.name ?? null, reviewed });
  const defaultName = options.override?.name ?? (recognised ? recognised.tableName : defaultTableName(file.fileName));
  let contentHash: string | null = null;
  let matches: ImportedCollection[] = [];
  if (outcome.kind === 'ready') {
    contentHash = contentFingerprint(basisOf(preview), foodsOf(preview));
    matches = await repos.importedFoods.findMatches({ contentHash, name: defaultName, fileName: file.fileName, basis: basisOf(preview), foods: preview.foods });
  }
  return { id, fileName: file.fileName, outcome, file, mapping, preset: preset ? { id: preset.id, name: preset.name } : null, defaultName, preview, assessment, reviewed, contentHash, matches };
}

export interface PickProgress {
  /** From 0. */
  index: number;
  total: number;
  name: string;
}

/**
 * Opens the system picker with multiple selection and reads every chosen file in sequence, whatever happens to each: a file that cannot be
 * read is listed with its reason and the others go on. Every copy the picker made is removed, read or not.
 */
export async function pickAndAnalyse(
  platform: Pick<DataPlatform, 'picker' | 'cache'>,
  repos: Pick<Repositories, 'importedFoods'>,
  options: { cancel?: CancelToken; onFile?: (progress: PickProgress) => void; onProgress?: (fraction: number) => void },
): Promise<{ kind: 'cancelled' } | { kind: 'ok'; files: AnalysedFile[] }> {
  const picked = await platform.picker.pickMany();
  if (picked.length === 0) return { kind: 'cancelled' };
  const files: AnalysedFile[] = [];
  const done = new Set<PickedFile>();
  try {
    for (const [index, item] of picked.entries()) {
      if (options.cancel?.cancelled) return { kind: 'cancelled' };
      options.onFile?.({ index, total: picked.length, name: item.name });
      const id = `file-${index}`;
      const read = await readPicked(platform, item, { cancel: options.cancel, onProgress: options.onProgress });
      done.add(item);
      if (read.kind === 'refused') {
        if (read.code === 'cancelled') return { kind: 'cancelled' };
        files.push(refusedFile(id, item.name, read.code, read.limit));
        continue;
      }
      try {
        files.push(await analyseFile(repos, { id, file: read.file }, { cancel: options.cancel, onProgress: options.onProgress }));
      } catch (error) {
        if (options.cancel?.cancelled) return { kind: 'cancelled' };
        // A row the reader could not take is this file's problem, not the batch's.
        files.push(refusedFile(id, item.name, 'damaged'));
        void error;
      }
    }
    return { kind: 'ok', files };
  } finally {
    for (const item of picked) if (!done.has(item)) await platform.cache.remove(item.uri).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The plan: pure.

export type DuplicateChoice = 'replace' | 'keep' | 'skip';

export interface GroupMatch {
  hash: string;
  matches: ImportedCollection[];
}

export interface Choices {
  /** By file id; a file that is not here is selected. */
  selected: Record<string, boolean>;
  /** The points the person confirmed, by file id. */
  confirmed: Record<string, ConfirmKind[]>;
  /** What to do with a table that is already here, by unit key. */
  duplicate: Record<string, DuplicateChoice>;
  /** Import the files of one recognised table as one collection, by preset id; a preset that is not here is combined. */
  combine: Record<string, boolean>;
  /** The name of each table, by unit key. */
  names: Record<string, string>;
  /** The tables already here that have the content of a whole group (`groupMatches`). */
  groupMatches?: Record<string, GroupMatch>;
}

export const defaultChoices = (_files: readonly AnalysedFile[]): Choices => ({ selected: {}, confirmed: {}, duplicate: {}, combine: {}, names: {} });

/** One table that would be written: one file, or several files of the same recognised table. */
export interface Unit {
  key: string;
  files: AnalysedFile[];
  name: string;
  fileName: string;
  presetId: string | null;
  basis: CollectionBasis;
  foods: NewImportedFood[];
  hash: string;
  /** Tables already here with this content. */
  matches: ImportedCollection[];
  /** What the person chose about those, when there are any. */
  choice: DuplicateChoice | null;
  /** Why this table cannot be written yet. */
  blocked: Blocker[];
}

export type Blocker =
  | { kind: 'unconfirmed'; file: string; point: ConfirmKind }
  | { kind: 'duplicate_undecided'; unit: string }
  | { kind: 'too_many_foods'; unit: string; count: number; limit: number };

export type PlanBlocker = Blocker | { kind: 'too_many_tables'; limit: number; existing: number; adding: number; replacing: number };

export type NotImportedReason = 'nothing_usable' | 'needs_mapping' | 'refused' | 'deselected';

export interface Plan {
  units: Unit[];
  /** Files of the same recognised table (two or more) and whether they are offered/imported as one. */
  groups: { presetId: string; presetName: string; files: string[]; combined: boolean }[];
  notImported: { file: AnalysedFile; reason: NotImportedReason }[];
  blockedBy: PlanBlocker[];
  /** Something would be written and nothing is left to decide or confirm. */
  canImport: boolean;
}

const uniqueById = (collections: ImportedCollection[]): ImportedCollection[] => [...new Map(collections.map((c) => [c.id, c])).values()];

export function buildPlan(files: readonly AnalysedFile[], choices: Choices, existingTables: number): Plan {
  const active = files.filter((f) => f.outcome.kind === 'ready' && choices.selected[f.id] !== false);
  const notImported: Plan['notImported'] = files.flatMap((file) => {
    if (active.includes(file)) return [];
    const reason: NotImportedReason = file.outcome.kind === 'ready' ? 'deselected' : file.outcome.kind;
    return [{ file, reason }];
  });

  // Files of the same recognised table, offered as one collection.
  const byPreset = new Map<string, AnalysedFile[]>();
  for (const file of active) if (file.preset) byPreset.set(file.preset.id, [...(byPreset.get(file.preset.id) ?? []), file]);
  const groups: Plan['groups'] = [...byPreset.entries()]
    .filter(([, members]) => members.length > 1 && new Set(members.map((m) => basisOf(m.preview!))).size === 1)
    .map(([presetId, members]) => ({ presetId, presetName: members[0]!.preset!.name, files: members.map((m) => m.fileName), combined: choices.combine[presetId] !== false }));
  const combinedIds = new Set(groups.filter((g) => g.combined).map((g) => g.presetId));

  const units: Unit[] = [];
  const seen = new Set<string>();
  for (const file of active) {
    const presetId = file.preset?.id ?? null;
    const together = presetId !== null && combinedIds.has(presetId);
    const key = together ? `group:${presetId}` : file.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const members = together ? active.filter((f) => f.preset?.id === presetId) : [file];
    const basis = basisOf(file.preview!);
    const foods = members.flatMap((m) => foodsOf(m.preview!));
    const matches = together ? uniqueById([...members.flatMap((m) => m.matches), ...(choices.groupMatches?.[presetId!]?.matches ?? [])]) : file.matches;
    units.push({
      key,
      files: members,
      name: choices.names[key] ?? (together ? members[0]!.preset!.name : file.defaultName),
      fileName: together ? `${members[0]!.fileName} (+${members.length - 1})` : file.fileName,
      presetId: together ? presetId : (file.mapping?.presetId ?? null),
      basis,
      foods,
      hash: together ? contentFingerprint(basis, foods) : file.contentHash!,
      matches,
      choice: matches.length > 0 ? (choices.duplicate[key] ?? null) : null,
      blocked: [],
    });
  }

  for (const unit of units) {
    if (unit.choice === 'skip') continue;
    for (const file of unit.files) {
      for (const point of file.assessment?.confirm ?? []) {
        if (!(choices.confirmed[file.id] ?? []).includes(point.kind)) unit.blocked.push({ kind: 'unconfirmed', file: file.id, point: point.kind });
      }
    }
    if (unit.matches.length > 0 && unit.choice === null) unit.blocked.push({ kind: 'duplicate_undecided', unit: unit.key });
    if (unit.foods.length > IMPORT_LIMITS.foodsPerCollection) unit.blocked.push({ kind: 'too_many_foods', unit: unit.key, count: unit.foods.length, limit: IMPORT_LIMITS.foodsPerCollection });
  }

  const writing = units.filter((u) => u.choice !== 'skip');
  const replacing = new Set(writing.filter((u) => u.choice === 'replace').flatMap((u) => u.matches.map((m) => m.id))).size;
  const blockedBy: PlanBlocker[] = writing.flatMap((u) => u.blocked);
  if (writing.length > 0 && existingTables - replacing + writing.length > IMPORT_LIMITS.collections) {
    blockedBy.push({ kind: 'too_many_tables', limit: IMPORT_LIMITS.collections, existing: existingTables, adding: writing.length, replacing });
  }
  return { units, groups, notImported, blockedBy, canImport: writing.length > 0 && blockedBy.length === 0 };
}

/** The tables already here that have the content of a whole group of files of one recognised table (importing the same combined table again). */
export async function groupMatches(repos: Pick<Repositories, 'importedFoods'>, files: readonly AnalysedFile[]): Promise<Record<string, GroupMatch>> {
  const plan = buildPlan(files, defaultChoices(files), 0);
  const out: Record<string, GroupMatch> = {};
  for (const group of plan.groups) {
    const unit = buildPlan(files, { ...defaultChoices(files), combine: { [group.presetId]: true } }, 0).units.find((u) => u.key === `group:${group.presetId}`);
    if (!unit) continue;
    out[group.presetId] = { hash: unit.hash, matches: await repos.importedFoods.findMatches({ contentHash: unit.hash, name: unit.name, fileName: unit.fileName, basis: unit.basis, foods: unit.foods }) };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The writes.

export interface RunReport {
  /** Tables written, with how many existing ones each replaced. */
  imported: { unit: Unit; collection: ImportedCollection; foods: number; replaced: number }[];
  /** Tables that failed: nothing of them was written, and the tables before them stay. */
  failed: { unit: Unit; error: unknown }[];
  /** Tables left alone because the person chose to skip them. */
  skipped: Unit[];
  /** Tables that were not written because something was still undecided or unconfirmed. */
  notDone: Unit[];
}

/**
 * Writes the plan, one table at a time, each in its own transaction. A failure in one table is recorded and the next one goes on; nothing
 * written earlier is undone and nothing of the failed table stays. Tables that are skipped, or still blocked, are not written.
 */
export async function runPlan(repos: Pick<Repositories, 'importedFoods'>, plan: Plan, options: { onUnit?: (index: number, total: number, unit: Unit) => void } = {}): Promise<RunReport> {
  const report: RunReport = { imported: [], failed: [], skipped: [], notDone: [] };
  const todo = plan.units.filter((unit) => {
    if (unit.choice === 'skip') report.skipped.push(unit);
    else if (unit.blocked.length > 0) report.notDone.push(unit);
    else return true;
    return false;
  });
  for (const [index, unit] of todo.entries()) {
    options.onUnit?.(index, todo.length, unit);
    // The screen says which table is being saved before it is; each write is one synchronous transaction.
    await yieldToUi();
    const input = { name: unit.name, fileName: unit.fileName, presetId: unit.presetId, basis: unit.basis };
    try {
      const replaced = unit.choice === 'replace' ? unit.matches : [];
      const collection = replaced.length > 0 ? await repos.importedFoods.replaceCollections(replaced.map((c) => c.id), input, unit.foods) : await repos.importedFoods.importCollection(input, unit.foods);
      report.imported.push({ unit, collection, foods: collection.foodCount, replaced: replaced.length });
    } catch (error) {
      report.failed.push({ unit, error });
    }
  }
  return report;
}
