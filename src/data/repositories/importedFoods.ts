import { and, asc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { cueFree, nameIndexTokens, searchWords, wordForms } from '../../core/catalog';
import type { NutrientAmounts } from '../../core/nutrition';
import type { AppTransaction } from '../database';
import { DataError } from '../errors';
import { COLLECTION_BASES, foodCollection, foodUsage, importedFood, importedFoodToken, matchMemory } from '../schema';
import { contentFingerprint, sampleIndexes } from './fingerprint';
import { IMPORT_LIMITS, requireImportedPer100g } from './limits';
import { TEXT_LIMITS, invalid, isBlankText, isPlainFileName, nutrientEntries, requireMaxLength, type RepositoryContext } from './shared';

type CollectionRow = typeof foodCollection.$inferSelect;
type FoodRow = typeof importedFood.$inferSelect;

export type CollectionBasis = (typeof COLLECTION_BASES)[number];

/** A food composition table the person imported: a named collection of foods that lives only on this phone. */
export interface ImportedCollection {
  id: string;
  name: string;
  /** The file it came from (its name only, never a path). */
  fileName: string | null;
  importedAt: string;
  foodCount: number;
  /** The preset that recognised the layout, or null for a generic mapping. */
  presetId: string | null;
  /** What the values are per: 100 g, or 100 ml (flagged: the app applies no density). */
  basis: CollectionBasis;
  /** Fingerprint of the content (`contentFingerprint`); null for a table imported before it existed. */
  contentHash: string | null;
}

export interface NewImportedFood {
  name: string;
  group?: string | null;
  /** Per 100 g (or 100 ml) in the units the app stores. A nutrient the table has no number for is simply absent. */
  per100g: NutrientAmounts;
}

export interface ImportedFood {
  id: string;
  collectionId: string;
  name: string;
  group: string | null;
  per100g: NutrientAmounts;
}

/** A food with where it came from, as search and detail views need it. */
export interface ImportedFoodHit extends ImportedFood {
  collectionName: string;
  basis: CollectionBasis;
}

export interface ImportedCollectionWithFoods extends ImportedCollection {
  foods: ImportedFood[];
}

export interface ImportCollectionInput {
  name: string;
  fileName?: string | null;
  presetId?: string | null;
  basis?: CollectionBasis;
}

/** A table about to be imported, as far as recognising one that is already here needs. */
export interface DuplicateCandidate {
  contentHash: string;
  name: string;
  fileName: string | null;
  basis?: CollectionBasis;
  foods: readonly { name: string }[];
}

export interface ImportedFoodRepository {
  /** Stores the collection and all its foods in ONE transaction: if any food is refused, nothing is stored. */
  importCollection(input: ImportCollectionInput, foods: readonly NewImportedFood[]): Promise<ImportedCollection>;
  /**
   * The tables already here that have the same content as `candidate`: the same fingerprint or, for a table imported before fingerprints
   * existed (none stored), the same number of foods, the same name or file, and the same food names at a sample of positions. Oldest first.
   */
  findMatches(candidate: DuplicateCandidate): Promise<ImportedCollection[]>;
  /**
   * Swaps the tables `oldIds` for this one in ONE transaction (all or nothing): the old tables go with their foods, search entries,
   * favorites, recents and learned matches, the new one is stored. Meals already logged are not touched. The old tables do not count
   * against the limit of tables. Rejects with `not_found` when an id is not a table, `invalid_input` when a food is refused.
   */
  replaceCollections(oldIds: readonly string[], input: ImportCollectionInput, foods: readonly NewImportedFood[]): Promise<ImportedCollection>;
  /** Removes several tables at once, all or nothing (the same clean-up as `removeCollection`). Resolves with the foods removed. */
  removeCollections(ids: readonly string[]): Promise<{ foods: number }>;
  /**
   * Groups of tables whose content is identical (two or more each, oldest first). A table imported before fingerprints existed gets its
   * fingerprint here, from its stored foods, so what is compared is the content itself and the next look is instant.
   */
  duplicateGroups(options?: { yieldToUi?: () => Promise<void> }): Promise<ImportedCollection[][]>;
  /** Oldest first. */
  listCollections(): Promise<ImportedCollection[]>;
  renameCollection(id: string, name: string): Promise<ImportedCollection>;
  /**
   * Removes the collection and every one of its foods at once, with their search entries, favorites, recents and learned matches.
   * Meals already logged are not touched: they keep their own snapshot of the values.
   */
  removeCollection(id: string): Promise<{ foods: number }>;
  getFood(id: string): Promise<ImportedFoodHit | null>;
  /**
   * Candidates for a typed query: foods whose names have every word (the last one as a prefix), or any word when too few do. NOT
   * ranked: the caller scores them with the catalog's rules (`createNameScorer`) so they compare with catalog results.
   */
  search(query: string, limit: number): Promise<ImportedFoodHit[]>;
  /** The collection name of each id that is an imported food (ids of other foods are simply absent). */
  originsOf(ids: readonly string[]): Promise<Map<string, { collectionName: string; basis: CollectionBasis }>>;
}

const CHUNK = 40;
const TOKEN_CHUNK = 400;
const LOOKUP_CHUNK = 500;
/** Rows read per query word before intersecting: a word in thousands of names is capped, not scanned without end. */
const WORD_ROW_CAP = 20_000;
const DEFAULT_CANDIDATES = 1500;
/** Sorts after every character a name can hold: `token >= f AND token < f + AFTER_ALL` is the prefix range of `f`. */
const AFTER_ALL = '\uffff';

const toCollection = (row: CollectionRow): ImportedCollection => ({
  id: row.id,
  name: row.name,
  fileName: row.fileName,
  importedAt: row.importedAt,
  foodCount: row.foodCount,
  presetId: row.presetId,
  basis: row.basis,
  contentHash: row.contentHash,
});

const toFood = (row: FoodRow): ImportedFood => ({
  id: row.id,
  collectionId: row.collectionId,
  name: row.name,
  group: row.foodGroup,
  per100g: JSON.parse(row.per100gJson) as NutrientAmounts,
});

function chunks<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function validateFood(food: NewImportedFood, label: string): void {
  if (isBlankText(food.name)) throw invalid(`${label}.name must not be blank`);
  requireMaxLength(food.name.trim(), TEXT_LIMITS.name, `${label}.name`);
  requireMaxLength(food.group, TEXT_LIMITS.name, `${label}.group`);
  const entries = nutrientEntries(food.per100g, `${label}.per100g`);
  if (entries.length === 0) throw invalid(`${label} has no nutrient value at all`);
  requireImportedPer100g(food.per100g, `${label}.per100g`);
}

function validateCollection(input: ImportCollectionInput): void {
  if (isBlankText(input.name)) throw invalid('name must not be blank');
  requireMaxLength(input.name.trim(), TEXT_LIMITS.label, 'name');
  requireMaxLength(input.fileName, TEXT_LIMITS.name, 'fileName');
  if (input.fileName != null && !isPlainFileName(input.fileName)) throw invalid('fileName must be a file name, not a path');
  requireMaxLength(input.presetId, TEXT_LIMITS.label, 'presetId');
}

/** Writes a collection, its foods and their search entries inside the caller's transaction. Shared with the backup repository. */
export function insertCollection(
  tx: Pick<AppTransaction, 'insert' | 'select'>,
  collection: Omit<ImportedCollection, 'contentHash'> & { contentHash?: string | null },
  foods: readonly { id: string; name: string; group: string | null; per100g: NutrientAmounts }[],
): void {
  tx.insert(foodCollection)
    .values({
      id: collection.id,
      name: collection.name,
      fileName: collection.fileName,
      importedAt: collection.importedAt,
      foodCount: foods.length,
      presetId: collection.presetId,
      basis: collection.basis,
      // A restore from a backup has no fingerprint in the file: it is computed from the foods, like for a new import.
      contentHash: collection.contentHash ?? contentFingerprint(collection.basis, foods),
    })
    .run();
  const top = tx
    .select({ top: sql<number>`coalesce(max(${importedFood.seq}), 0)` })
    .from(importedFood)
    .get();
  let seq = Number(top?.top ?? 0);
  const keyed = foods.map((food) => ({ ...food, seq: (seq += 1) }));
  for (const batch of chunks(keyed, CHUNK)) {
    tx.insert(importedFood)
      .values(
        batch.map((f) => ({
          seq: f.seq,
          id: f.id,
          collectionId: collection.id,
          name: f.name,
          foodGroup: f.group,
          per100gJson: JSON.stringify(f.per100g),
        })),
      )
      .run();
  }
  const tokens = keyed.flatMap((f) => nameIndexTokens(f.name).map((token) => ({ term: token, foodSeq: f.seq })));
  for (const batch of chunks(tokens, TOKEN_CHUNK)) tx.insert(importedFoodToken).values(batch).run();
}

/** Removes one collection with everything that points at its foods, inside the caller's transaction. */
function removeIn(tx: Pick<AppTransaction, 'select' | 'delete'>, id: string): number {
  const row = tx.select().from(foodCollection).where(eq(foodCollection.id, id)).get();
  if (!row) throw new DataError('not_found', `imported table not found: ${id}`);
  const of = tx.select({ id: importedFood.id }).from(importedFood).where(eq(importedFood.collectionId, id));
  // Favorites, recents and learned matches of these foods would point at nothing: they go with the table.
  tx.delete(foodUsage).where(and(eq(foodUsage.foodSource, 'custom'), inArray(foodUsage.foodRef, of))).run();
  tx.delete(matchMemory).where(and(eq(matchMemory.foodSource, 'custom'), inArray(matchMemory.foodRef, of))).run();
  // The foods and their search entries go with the collection (ON DELETE CASCADE). Meal items have no reference to delete.
  tx.delete(foodCollection).where(eq(foodCollection.id, id)).run();
  return row.foodCount;
}

/** Checks the input of an import like `importCollection` does and returns the stored basis. */
function validateImport(input: ImportCollectionInput, foods: readonly NewImportedFood[]): CollectionBasis {
  validateCollection(input);
  if (foods.length === 0) throw invalid('a table needs at least one food');
  if (foods.length > IMPORT_LIMITS.foodsPerCollection) {
    throw invalid(`a table may have at most ${IMPORT_LIMITS.foodsPerCollection} foods, got ${foods.length}`);
  }
  foods.forEach((food, index) => validateFood(food, `foods[${index}]`));
  const basis = input.basis ?? 'g';
  if (!COLLECTION_BASES.includes(basis)) throw invalid(`basis must be one of ${COLLECTION_BASES.join(', ')}`);
  return basis;
}

export function createImportedFoodRepository({ db, now, newId }: RepositoryContext): ImportedFoodRepository {
  function hitsFor(rows: readonly FoodRow[]): ImportedFoodHit[] {
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((r) => r.collectionId))];
    const collections = new Map(db.select().from(foodCollection).where(inArray(foodCollection.id, ids)).all().map((c) => [c.id, c]));
    return rows.flatMap((row) => {
      const collection = collections.get(row.collectionId);
      return collection ? [{ ...toFood(row), collectionName: collection.name, basis: collection.basis }] : [];
    });
  }

  /** Foods by `seq`, in the order of `seqs`. */
  function foodsBySeq(seqs: readonly number[]): FoodRow[] {
    const found = new Map<number, FoodRow>();
    for (const batch of chunks(seqs, LOOKUP_CHUNK)) {
      for (const row of db.select().from(importedFood).where(inArray(importedFood.seq, batch)).all()) found.set(row.seq, row);
    }
    return seqs.flatMap((seq) => (found.has(seq) ? [found.get(seq)!] : []));
  }

  function seqsForWord(word: string, prefix: boolean): Set<number> {
    const forms = wordForms(word);
    const where = prefix
      ? or(...forms.map((f) => and(gte(importedFoodToken.term, f), lt(importedFoodToken.term, `${f}${AFTER_ALL}`))))
      : inArray(importedFoodToken.term, forms);
    return new Set(
      db
        .selectDistinct({ seq: importedFoodToken.foodSeq })
        .from(importedFoodToken)
        .where(where)
        .limit(WORD_ROW_CAP)
        .all()
        .map((r) => r.seq),
    );
  }

  return {
    async importCollection(input, foods) {
      const basis = validateImport(input, foods);
      const stored = foods.map((f) => ({ id: newId(), name: f.name.trim(), group: f.group?.trim() ? f.group.trim() : null, per100g: { ...f.per100g } }));
      const collection: ImportedCollection = {
        id: newId(),
        name: input.name.trim(),
        fileName: input.fileName ?? null,
        importedAt: now().toISOString(),
        foodCount: foods.length,
        presetId: input.presetId ?? null,
        basis,
        contentHash: contentFingerprint(basis, stored),
      };
      // One transaction: the collection, every food and every search entry, or none of them.
      db.transaction((tx) => {
        const existing = Number(tx.select({ n: sql<number>`count(*)` }).from(foodCollection).get()?.n ?? 0);
        if (existing >= IMPORT_LIMITS.collections) throw invalid(`at most ${IMPORT_LIMITS.collections} imported tables at once`);
        insertCollection(tx, collection, stored);
      });
      return collection;
    },

    async replaceCollections(oldIds, input, foods) {
      const basis = validateImport(input, foods);
      const stored = foods.map((f) => ({ id: newId(), name: f.name.trim(), group: f.group?.trim() ? f.group.trim() : null, per100g: { ...f.per100g } }));
      const collection: ImportedCollection = {
        id: newId(),
        name: input.name.trim(),
        fileName: input.fileName ?? null,
        importedAt: now().toISOString(),
        foodCount: foods.length,
        presetId: input.presetId ?? null,
        basis,
        contentHash: contentFingerprint(basis, stored),
      };
      // One transaction: the old tables go and the new one comes in, or nothing changes.
      db.transaction((tx) => {
        for (const id of new Set(oldIds)) removeIn(tx, id);
        const existing = Number(tx.select({ n: sql<number>`count(*)` }).from(foodCollection).get()?.n ?? 0);
        if (existing >= IMPORT_LIMITS.collections) throw invalid(`at most ${IMPORT_LIMITS.collections} imported tables at once`);
        insertCollection(tx, collection, stored);
      });
      return collection;
    },

    async removeCollections(ids) {
      return db.transaction((tx) => {
        let foods = 0;
        for (const id of new Set(ids)) foods += removeIn(tx, id);
        return { foods };
      });
    },

    async findMatches(candidate) {
      const basis = candidate.basis ?? 'g';
      const sample = sampleIndexes(candidate.foods.length).map((i) => candidate.foods[i]!.name.trim());
      const rows = db.select().from(foodCollection).orderBy(asc(foodCollection.importedAt), asc(foodCollection.id)).all();
      return rows
        .filter((row) => {
          if (row.contentHash !== null) return row.contentHash === candidate.contentHash;
          // Imported before fingerprints: the same count, basis and name or file, then the names at the sampled positions.
          if (row.foodCount !== candidate.foods.length || row.basis !== basis) return false;
          const sameOrigin = row.name === candidate.name.trim() || (row.fileName !== null && row.fileName === candidate.fileName);
          if (!sameOrigin) return false;
          return sampleIndexes(row.foodCount).every((position, index) => {
            const stored = db
              .select({ name: importedFood.name })
              .from(importedFood)
              .where(eq(importedFood.collectionId, row.id))
              .orderBy(asc(importedFood.seq))
              .limit(1)
              .offset(position)
              .get();
            return stored?.name === sample[index];
          });
        })
        .map(toCollection);
    },

    async duplicateGroups(options = {}) {
      const rows = db.select().from(foodCollection).orderBy(asc(foodCollection.importedAt), asc(foodCollection.id)).all();
      const groups = new Map<string, ImportedCollection[]>();
      for (const row of rows) {
        let hash = row.contentHash;
        if (hash === null) {
          const foods = db.select().from(importedFood).where(eq(importedFood.collectionId, row.id)).orderBy(asc(importedFood.seq)).all();
          hash = contentFingerprint(
            row.basis,
            foods.map((f) => ({ name: f.name, group: f.foodGroup, per100g: JSON.parse(f.per100gJson) as NutrientAmounts })),
          );
          db.update(foodCollection).set({ contentHash: hash }).where(eq(foodCollection.id, row.id)).run();
          await options.yieldToUi?.();
        }
        groups.set(hash, [...(groups.get(hash) ?? []), toCollection({ ...row, contentHash: hash })]);
      }
      return [...groups.values()].filter((group) => group.length > 1);
    },

    async listCollections() {
      return db.select().from(foodCollection).orderBy(asc(foodCollection.importedAt), asc(foodCollection.id)).all().map(toCollection);
    },

    async renameCollection(id, name) {
      if (name.trim() === '') throw invalid('name must not be blank');
      requireMaxLength(name.trim(), TEXT_LIMITS.label, 'name');
      const updated = db.update(foodCollection).set({ name: name.trim() }).where(eq(foodCollection.id, id)).returning().all();
      if (updated.length === 0) throw new DataError('not_found', `imported table not found: ${id}`);
      return toCollection(updated[0]!);
    },

    async removeCollection(id) {
      return db.transaction((tx) => ({ foods: removeIn(tx, id) }));
    },

    async getFood(id) {
      const row = db.select().from(importedFood).where(eq(importedFood.id, id)).get();
      return row ? (hitsFor([row])[0] ?? null) : null;
    },

    async search(query, limit) {
      const words = cueFree(searchWords(query));
      if (words.length === 0 || limit <= 0) return [];
      const sets = words.map((word, index) => seqsForWord(word, index === words.length - 1));
      let seqs = [...(sets.reduce((acc, set) => new Set([...acc].filter((s) => set.has(s)))) as Set<number>)];
      // Too few foods have every word ("arroz negro"): any word will do; the caller's scoring puts the best first.
      if (seqs.length < limit && words.length > 1) seqs = [...new Set([...seqs, ...sets.flatMap((s) => [...s])])];
      seqs.sort((a, b) => a - b);
      return hitsFor(foodsBySeq(seqs.slice(0, Math.max(limit, DEFAULT_CANDIDATES))));
    },

    async originsOf(ids) {
      const out = new Map<string, { collectionName: string; basis: CollectionBasis }>();
      for (const batch of chunks([...new Set(ids)], LOOKUP_CHUNK)) {
        const rows = db
          .select({ id: importedFood.id, name: foodCollection.name, basis: foodCollection.basis })
          .from(importedFood)
          .innerJoin(foodCollection, eq(importedFood.collectionId, foodCollection.id))
          .where(inArray(importedFood.id, batch))
          .all();
        for (const row of rows) out.set(row.id, { collectionName: row.name, basis: row.basis });
      }
      return out;
    },
  };
}
