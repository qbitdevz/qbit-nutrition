/// <reference types="node" />
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { CatalogSource, SourceFood } from './types';

/** Official FoodData Central download page; the bulk file links are read from it. */
export const DOWNLOAD_PAGE = 'https://fdc.nal.usda.gov/download-datasets';
const SITE = 'https://fdc.nal.usda.gov';

export interface DatasetFile {
  source: CatalogSource;
  /** File name, e.g. FoodData_Central_foundation_food_json_2026-10-29.zip */
  fileName: string;
  url: string;
  /** Date in the file name, used as the data version part for this source. */
  version: string;
}

const DATASETS: { source: CatalogSource; prefix: string }[] = [
  { source: 'usda_foundation', prefix: 'FoodData_Central_foundation_food_json_' },
  { source: 'usda_sr_legacy', prefix: 'FoodData_Central_sr_legacy_food_json_' },
  { source: 'usda_fndds', prefix: 'FoodData_Central_survey_food_json_' },
];

/** Picks the newest JSON zip of each data set from the download page HTML. */
export function findDatasetFiles(html: string): DatasetFile[] {
  const out: DatasetFile[] = [];
  for (const { source, prefix } of DATASETS) {
    const re = new RegExp(`/fdc-datasets/(${prefix}(\\d{4}-\\d{2}(?:-\\d{2})?)\\.zip)`, 'g');
    let best: DatasetFile | null = null;
    for (const m of html.matchAll(re)) {
      const [, fileName, version] = m as unknown as [string, string, string];
      if (!best || version > best.version) {
        best = { source, fileName, url: `${SITE}/fdc-datasets/${fileName}`, version };
      }
    }
    if (!best) throw new Error(`No ${source} JSON download found on ${DOWNLOAD_PAGE}`);
    out.push(best);
  }
  return out;
}

/** Newest already-downloaded zip of each data set, for offline re-runs. */
export function findCachedDatasetFiles(downloadDir: string): DatasetFile[] | null {
  if (!existsSync(downloadDir)) return null;
  const names = readdirSync(downloadDir);
  const out: DatasetFile[] = [];
  for (const { source, prefix } of DATASETS) {
    const hits = names
      .filter((n) => n.startsWith(prefix) && n.endsWith('.zip'))
      .sort();
    const fileName = hits[hits.length - 1];
    if (!fileName) return null;
    out.push({
      source,
      fileName,
      url: `${SITE}/fdc-datasets/${fileName}`,
      version: fileName.slice(prefix.length, -'.zip'.length),
    });
  }
  return out;
}

export async function fetchDatasetFiles(): Promise<DatasetFile[]> {
  const res = await fetch(DOWNLOAD_PAGE);
  if (!res.ok) throw new Error(`${DOWNLOAD_PAGE} answered ${res.status}`);
  return findDatasetFiles(await res.text());
}

/** Downloads `file` into `downloadDir` unless it is already there. Returns the local path. */
export async function ensureDownloaded(file: DatasetFile, downloadDir: string): Promise<string> {
  mkdirSync(downloadDir, { recursive: true });
  const dest = path.join(downloadDir, file.fileName);
  if (existsSync(dest)) return dest;
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`${file.url} answered ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const tmp = `${dest}.part`;
  writeFileSync(tmp, bytes);
  // Rename only once the whole file is on disk, so an interrupted run never leaves a bad cache.
  renameSync(tmp, dest);
  return dest;
}

/** Reads one `.json` entry out of a zip held in memory (stored or deflated, no zip64). */
export function readZipJsonEntry(zip: Buffer): Buffer {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file: end of central directory not found');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip central directory');
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!name.toLowerCase().endsWith('.json')) continue;
    if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Corrupt zip local header');
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(dataStart, dataStart + compSize);
    if (method === 0) return data;
    if (method === 8) return inflateRawSync(data);
    throw new Error(`Unsupported zip compression method ${method} for ${name}`);
  }
  throw new Error('No .json file inside the zip');
}

interface UsdaFood {
  fdcId: number;
  description: string;
  foodCategory?: { description?: string };
  /** Survey Foods (FNDDS) use WWEIA categories instead of `foodCategory`. */
  wweiaFoodCategory?: { wweiaFoodCategoryDescription?: string };
  foodNutrients?: { nutrient?: { id?: number; unitName?: string }; amount?: number }[];
  foodPortions?: {
    value?: number;
    amount?: number;
    modifier?: string;
    gramWeight?: number;
    measureUnit?: { name?: string };
    portionDescription?: string;
  }[];
}

const ROOT_KEY: Record<CatalogSource, string> = {
  usda_foundation: 'FoundationFoods',
  usda_sr_legacy: 'SRLegacyFoods',
  usda_fndds: 'SurveyFoods',
  usda_branded: 'BrandedFoods',
};

function portionLabel(p: NonNullable<UsdaFood['foodPortions']>[number]): string | null {
  const unit = p.measureUnit?.name?.trim() ?? '';
  const unitText = unit === '' || unit === 'undetermined' || unit === 'RACC' ? '' : unit;
  const modifier = p.modifier?.trim() ?? '';
  const qty = p.amount ?? p.value ?? 1;
  const label = [unitText || modifier ? String(qty) : '', unitText, modifier].filter(Boolean).join(' ');
  return label === '' ? null : label;
}

/**
 * FNDDS portions carry their label in `portionDescription` ("1 regular/large"); `modifier` is a numeric code there.
 * Placeholders ("Quantity not specified"), per-ingredient guideline amounts and geometric measures are not household portions.
 */
const NOT_A_PORTION = /^(quantity not specified|guideline amount|topping|skin from|juice of)|\b(cubic inch|surface inch|yields)\b/i;

function surveyPortionLabel(p: NonNullable<UsdaFood['foodPortions']>[number]): string | null {
  const label = p.portionDescription?.trim() ?? '';
  return label === '' || NOT_A_PORTION.test(label) ? null : label;
}

/** Parses the JSON text of a Foundation Foods, SR Legacy or Survey Foods (FNDDS) file. */
export function parseUsdaJson(source: CatalogSource, jsonText: string): SourceFood[] {
  const root = JSON.parse(jsonText) as Record<string, UsdaFood[]>;
  const foods = root[ROOT_KEY[source]];
  if (!Array.isArray(foods)) throw new Error(`Expected "${ROOT_KEY[source]}" in the ${source} file`);
  return foods.map((f) => ({
    source,
    fdcId: f.fdcId,
    description: f.description,
    category: f.foodCategory?.description ?? f.wweiaFoodCategory?.wweiaFoodCategoryDescription ?? null,
    nutrients: (f.foodNutrients ?? []).flatMap((n) =>
      n.nutrient?.id !== undefined && typeof n.amount === 'number'
        ? [{ id: n.nutrient.id, unit: n.nutrient.unitName ?? '', amount: n.amount }]
        : [],
    ),
    portions: (f.foodPortions ?? []).flatMap((p) => {
      const label = source === 'usda_fndds' ? surveyPortionLabel(p) : portionLabel(p);
      const grams = p.gramWeight;
      return label && typeof grams === 'number' && grams > 0 ? [{ label, grams }] : [];
    }),
  }));
}
