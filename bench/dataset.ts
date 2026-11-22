/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
}

export const CATEGORIES = [
  'single_food',
  'separated_plate',
  'mixed_dish',
  'sandwich_wrap',
  'salad',
  'soup',
  'breakfast',
  'snack_fruit',
  'drink',
  'packaged',
  'restaurant',
  'regional',
] as const;

export const NON_FOOD_CATEGORY = 'non_food';

const SourceId = z.union([z.string().min(1), z.number().int().nonnegative()]).transform(String);

const TruthItem = z
  .object({
    /** English name of the food, as a person would say it. */
    name: z.string().min(1),
    /** Other names a model may use for it (any language). */
    aliases: z.array(z.string().min(1)).default([]),
    grams: z.number().positive().max(2000),
    /** `source_id` of the catalog food this maps to (the USDA FDC id, as text). */
    catalog_source_id: SourceId,
    /** Other catalog foods the matcher may pick and still count as correct. */
    also_acceptable: z.array(SourceId).default([]),
  })
  .strict();

const HiddenIngredient = z
  .object({
    name: z.string().min(1),
    grams: z.number().positive().max(2000),
    catalog_source_id: SourceId,
  })
  .strict();

const FoodMeal = z
  .object({
    is_food: z.literal(true),
    category: z.enum(CATEGORIES),
    hint: z.string().optional(),
    locale: z.enum(['en', 'es']).default('en'),
    items: z.array(TruthItem).min(1),
    hidden_ingredients: z.array(HiddenIngredient).default([]),
    notes: z.string().optional(),
  })
  .strict();

const NonFoodMeal = z
  .object({
    is_food: z.literal(false),
    hint: z.string().optional(),
    locale: z.enum(['en', 'es']).default('en'),
    notes: z.string().optional(),
  })
  .strict();

export const MealFile = z.discriminatedUnion('is_food', [FoodMeal, NonFoodMeal]);
export type MealFile = z.infer<typeof MealFile>;
export type TruthItem = z.infer<typeof TruthItem>;

export interface Meal {
  id: string;
  category: string;
  photoPath: string;
  mealPath: string;
  data: MealFile;
}

export interface LoadOptions {
  maxImageBytes: number;
}

/** Long edge of a JPEG from its first start-of-frame marker, or null when it cannot be read. */
export function jpegLongEdge(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return Math.max(width, height);
    }
    i += 2 + length;
  }
  return null;
}

function parseMeal(mealPath: string): MealFile {
  let raw: string;
  try {
    raw = readFileSync(mealPath, 'utf8');
  } catch {
    throw new DatasetError(`${mealPath}: file is missing or unreadable. Every meal folder needs meal.json.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new DatasetError(`${mealPath}: not valid JSON (${(error as Error).message}).`);
  }
  const parsed = MealFile.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new DatasetError(`${mealPath}: invalid meal.json:\n${issues}`);
  }
  return parsed.data;
}

function checkPhoto(photoPath: string, maxBytes: number): void {
  if (!existsSync(photoPath)) {
    throw new DatasetError(`${photoPath}: file is missing. Every meal folder needs photo.jpg.`);
  }
  const size = statSync(photoPath).size;
  if (size > maxBytes) {
    throw new DatasetError(
      `${photoPath}: ${size.toLocaleString('en-US')} bytes is above the limit of ${maxBytes.toLocaleString('en-US')} bytes. ` +
        'Save the photo with its long edge at most 1,024 px (the harness does not resize).',
    );
  }
  const edge = jpegLongEdge(readFileSync(photoPath));
  if (edge !== null && edge > 1024) {
    throw new DatasetError(
      `${photoPath}: the long edge is ${edge} px. Save the photo with its long edge at most 1,024 px (the harness does not resize).`,
    );
  }
}

/** Reads and validates every `<dir>/<id>/{photo.jpg,meal.json}`, sorted by id. Fails on the first problem. */
export function loadDataset(dir: string, options: LoadOptions): Meal[] {
  if (!existsSync(dir)) throw new DatasetError(`${dir}: data set folder does not exist.`);
  const ids = readdirSync(dir)
    .filter((name) => !name.startsWith('.') && statSync(path.join(dir, name)).isDirectory())
    .sort();
  if (ids.length === 0) {
    throw new DatasetError(`No meals found in ${dir}. Add folders as described in bench/README.md.`);
  }
  return ids.map((id) => {
    const mealPath = path.join(dir, id, 'meal.json');
    const photoPath = path.join(dir, id, 'photo.jpg');
    const data = parseMeal(mealPath);
    checkPhoto(photoPath, options.maxImageBytes);
    return { id, mealPath, photoPath, data, category: data.is_food ? data.category : NON_FOOD_CATEGORY };
  });
}

/**
 * The `smoke` subset: at most `limit` meals, taken round-robin across categories (ids sorted
 * inside each category) so a quick check still spans the data set.
 */
export function selectSubset<T extends { id: string; category: string }>(meals: readonly T[], subset: 'all' | 'smoke', limit = 15): T[] {
  if (subset === 'all' || meals.length <= limit) return [...meals];
  const byCategory = new Map<string, T[]>();
  for (const meal of [...meals].sort((a, b) => a.id.localeCompare(b.id))) {
    byCategory.set(meal.category, [...(byCategory.get(meal.category) ?? []), meal]);
  }
  const lanes = [...byCategory.keys()].sort().map((k) => byCategory.get(k) as T[]);
  const picked: T[] = [];
  for (let round = 0; picked.length < limit; round++) {
    let any = false;
    for (const lane of lanes) {
      if (round < lane.length && picked.length < limit) {
        picked.push(lane[round]);
        any = true;
      }
    }
    if (!any) break;
  }
  return picked.sort((a, b) => a.id.localeCompare(b.id));
}
