import { asc, desc, eq } from 'drizzle-orm';
import { DataError } from '../errors';
import { aiProvider, AI_ADAPTERS, OUTPUT_MODES } from '../schema';
import { invalid, type RepositoryContext } from './shared';

type Row = typeof aiProvider.$inferSelect;

export type AiAdapterId = (typeof AI_ADAPTERS)[number];
export type AiOutputMode = (typeof OUTPUT_MODES)[number];

/** A provider profile. The API key is not here and not in the database: it is in secure storage under `id` (docs/06 section 6). */
export interface AiProvider {
  id: string;
  label: string;
  /** Preset id the profile started from, or null for custom. */
  preset: string | null;
  adapter: AiAdapterId;
  baseUrl: string;
  model: string;
  outputMode: AiOutputMode | null;
  timeoutS: number;
  isActive: boolean;
  lastTestAt: string | null;
  /** `ok` or a provider error code of the last "Test connection". */
  lastTestResult: string | null;
}

export interface AiProviderInput {
  label: string;
  preset: string | null;
  adapter: AiAdapterId;
  baseUrl: string;
  model: string;
  timeoutS: number;
  outputMode?: AiOutputMode | null;
}

export const MIN_TIMEOUT_S = 5;
export const MAX_TIMEOUT_S = 300;

export interface AiProviderRepository {
  /** The active profile first, then by name. */
  list(): Promise<AiProvider[]>;
  get(id: string): Promise<AiProvider | null>;
  getActive(): Promise<AiProvider | null>;
  /** The first profile ever created becomes the active one; later ones start inactive. */
  create(input: AiProviderInput): Promise<AiProvider>;
  /**
   * Changes the given fields. When the adapter, base URL, or model changes, the stored output mode and
   * last test result no longer describe the profile and are cleared (unless the patch sets them).
   */
  update(id: string, patch: Partial<AiProviderInput>): Promise<AiProvider>;
  /** Makes this profile the only active one. One transaction. */
  setActive(id: string): Promise<AiProvider>;
  /** Stores the output mode that worked (or null) and the outcome of "Test connection". */
  recordTest(id: string, test: { result: string; outputMode: AiOutputMode | null }): Promise<AiProvider>;
  /** Removing a profile that is not there is not an error. Its key is the caller's to remove (`providerService`). */
  remove(id: string): Promise<void>;
}

const toProvider = (row: Row): AiProvider => ({ ...row, isActive: row.isActive === 1 });

function validate(values: Partial<AiProviderInput>): void {
  if (values.label !== undefined && values.label.trim() === '') throw invalid('A provider needs a name.');
  if (values.baseUrl !== undefined && values.baseUrl.trim() === '') throw invalid('A provider needs a base URL.');
  if (values.model !== undefined && values.model.trim() === '') throw invalid('A provider needs a model.');
  if (values.timeoutS !== undefined && !(Number.isInteger(values.timeoutS) && values.timeoutS >= MIN_TIMEOUT_S && values.timeoutS <= MAX_TIMEOUT_S)) {
    throw invalid(`The timeout must be a whole number of seconds between ${MIN_TIMEOUT_S} and ${MAX_TIMEOUT_S}.`);
  }
}

export function createAiProviderRepository({ db, now, newId }: RepositoryContext): AiProviderRepository {
  const read = (id: string): AiProvider | null => {
    const row = db.select().from(aiProvider).where(eq(aiProvider.id, id)).get();
    return row ? toProvider(row) : null;
  };
  const mustGet = (id: string): AiProvider => {
    const found = read(id);
    if (!found) throw new DataError('not_found', `There is no AI provider with id "${id}".`);
    return found;
  };

  return {
    async list() {
      return db
        .select()
        .from(aiProvider)
        .orderBy(desc(aiProvider.isActive), asc(aiProvider.label), asc(aiProvider.id))
        .all()
        .map(toProvider);
    },

    async get(id) {
      return read(id);
    },

    async getActive() {
      const row = db.select().from(aiProvider).where(eq(aiProvider.isActive, 1)).get();
      return row ? toProvider(row) : null;
    },

    async create(input) {
      validate(input);
      const id = newId();
      return db.transaction((tx) => {
        const first = tx.select().from(aiProvider).limit(1).get() === undefined;
        tx.insert(aiProvider)
          .values({
            id,
            label: input.label.trim(),
            preset: input.preset,
            adapter: input.adapter,
            baseUrl: input.baseUrl.trim(),
            model: input.model.trim(),
            outputMode: input.outputMode ?? null,
            timeoutS: input.timeoutS,
            isActive: first ? 1 : 0,
          })
          .run();
        return toProvider(tx.select().from(aiProvider).where(eq(aiProvider.id, id)).get()!);
      });
    },

    async update(id, patch) {
      validate(patch);
      const current = mustGet(id);
      const values: Partial<Row> = {};
      if (patch.label !== undefined) values.label = patch.label.trim();
      if (patch.preset !== undefined) values.preset = patch.preset;
      if (patch.adapter !== undefined) values.adapter = patch.adapter;
      if (patch.baseUrl !== undefined) values.baseUrl = patch.baseUrl.trim();
      if (patch.model !== undefined) values.model = patch.model.trim();
      if (patch.timeoutS !== undefined) values.timeoutS = patch.timeoutS;
      if (patch.outputMode !== undefined) values.outputMode = patch.outputMode;

      const destinationChanged =
        (values.adapter !== undefined && values.adapter !== current.adapter) ||
        (values.baseUrl !== undefined && values.baseUrl !== current.baseUrl) ||
        (values.model !== undefined && values.model !== current.model);
      if (destinationChanged) {
        if (patch.outputMode === undefined) values.outputMode = null;
        values.lastTestAt = null;
        values.lastTestResult = null;
      }
      if (Object.keys(values).length > 0) db.update(aiProvider).set(values).where(eq(aiProvider.id, id)).run();
      return mustGet(id);
    },

    async setActive(id) {
      mustGet(id);
      db.transaction((tx) => {
        // The partial unique index allows one active row, so the old one goes first.
        tx.update(aiProvider).set({ isActive: 0 }).where(eq(aiProvider.isActive, 1)).run();
        tx.update(aiProvider).set({ isActive: 1 }).where(eq(aiProvider.id, id)).run();
      });
      return mustGet(id);
    },

    async recordTest(id, test) {
      mustGet(id);
      db.update(aiProvider)
        .set({ outputMode: test.outputMode, lastTestAt: now().toISOString(), lastTestResult: test.result })
        .where(eq(aiProvider.id, id))
        .run();
      return mustGet(id);
    },

    async remove(id) {
      db.delete(aiProvider).where(eq(aiProvider.id, id)).run();
    },
  };
}
