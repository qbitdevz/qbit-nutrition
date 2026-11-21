import { eq } from 'drizzle-orm';
import { HEADLINE_FIELDS, type BarcodeProduct, type ProductField } from '../../core/barcode';
import type { NutrientAmounts } from '../../core/nutrition';
import { barcodeProduct } from '../schema';
import { HEADLINE_CODES, TEXT_LIMITS, invalid, isHeadline, nutrientEntries, requireFinite, requireMaxLength, type RepositoryContext } from './shared';

type Row = typeof barcodeProduct.$inferSelect;

/** A product as cached: what the lookup (or the person) produced, and when it was fetched. */
export interface BarcodeProductRecord extends BarcodeProduct {
  /** UTC ISO 8601. The cache is refreshed when this is older than `BARCODE_CACHE_MAX_AGE_DAYS`. */
  fetchedAt: string;
}

export interface BarcodeProductRepository {
  get(barcode: string): Promise<BarcodeProductRecord | null>;
  /** Inserts or replaces the product with this barcode (a refresh replaces what was cached). */
  put(record: BarcodeProductRecord): Promise<void>;
}

/** What `raw_json` holds: the app's own notes about the row (the columns cannot say that a value is missing). */
interface Meta {
  v: 1;
  missing: ProductField[];
  inconsistent: boolean;
  edited: boolean;
}

const PRODUCT_FIELDS: readonly string[] = ['name', ...HEADLINE_FIELDS];
const BARCODE = /^\d{8}$|^\d{13}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function readMeta(json: string | null): Meta {
  const none: Meta = { v: 1, missing: [], inconsistent: false, edited: false };
  if (!json) return none;
  try {
    const parsed = JSON.parse(json) as Partial<Meta>;
    return {
      v: 1,
      missing: Array.isArray(parsed.missing) ? parsed.missing.filter((f): f is ProductField => PRODUCT_FIELDS.includes(f)) : [],
      inconsistent: parsed.inconsistent === true,
      edited: parsed.edited === true,
    };
  } catch {
    return none;
  }
}

/** Per-100 g values of a row; a headline value the lookup did not have is left out, never 0. */
export function barcodePer100g(row: Row, missing: readonly ProductField[]): NutrientAmounts {
  const other = row.otherNutrientsJson ? (JSON.parse(row.otherNutrientsJson) as NutrientAmounts) : {};
  const headline: NutrientAmounts = { kcal: row.kcal100g, protein: row.protein100g, carbs: row.carbs100g, fat: row.fat100g };
  for (const code of HEADLINE_CODES) if (missing.includes(code)) delete headline[code];
  return { ...headline, ...other };
}

export function toBarcodeRecord(row: Row): BarcodeProductRecord {
  const meta = readMeta(row.rawJson);
  return {
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    per100g: barcodePer100g(row, meta.missing),
    servingG: row.servingG,
    missing: meta.missing,
    inconsistent: meta.inconsistent,
    edited: meta.edited,
    fetchedAt: row.fetchedAt,
  };
}

/** The row for a record, validated. Shared with the backup repository. */
export function toBarcodeRow(record: BarcodeProductRecord): Row {
  if (!BARCODE.test(record.barcode)) throw invalid(`barcode must be 8 or 13 digits, got "${record.barcode}"`);
  if (typeof record.name !== 'string') throw invalid('name must be text');
  requireMaxLength(record.name, TEXT_LIMITS.name, 'name');
  requireMaxLength(record.brand, TEXT_LIMITS.name, 'brand');
  if (record.servingG !== null) requireFinite(record.servingG, 'servingG', { min: Number.MIN_VALUE });
  if (!ISO_INSTANT.test(record.fetchedAt)) throw invalid(`fetchedAt must be a UTC timestamp, got "${record.fetchedAt}"`);
  const entries = nutrientEntries(record.per100g, 'per100g');

  const other = Object.fromEntries(entries.filter(([code]) => !isHeadline(code)));
  const value = (code: (typeof HEADLINE_CODES)[number]) => record.per100g[code] ?? 0;
  const meta: Meta = { v: 1, missing: record.missing, inconsistent: record.inconsistent, edited: record.edited };
  return {
    barcode: record.barcode,
    name: record.name,
    brand: record.brand,
    kcal100g: value('kcal'),
    protein100g: value('protein'),
    carbs100g: value('carbs'),
    fat100g: value('fat'),
    otherNutrientsJson: Object.keys(other).length > 0 ? JSON.stringify(other) : null,
    servingG: record.servingG,
    fetchedAt: record.fetchedAt,
    rawJson: JSON.stringify(meta),
  };
}

export function createBarcodeProductRepository({ db }: RepositoryContext): BarcodeProductRepository {
  return {
    async get(barcode) {
      const row = db.select().from(barcodeProduct).where(eq(barcodeProduct.barcode, barcode)).get();
      return row ? toBarcodeRecord(row) : null;
    },

    async put(record) {
      const row = toBarcodeRow(record);
      db.insert(barcodeProduct).values(row).onConflictDoUpdate({ target: barcodeProduct.barcode, set: row }).run();
    },
  };
}
