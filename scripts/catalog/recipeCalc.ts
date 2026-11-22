import { NUTRIENT_CODES, type NutrientAmounts, type NutrientCode } from '../../src/core/nutrition/types';

/**
 * Recipe calculation: ingredients and factors -> per-100 g values of a dish (odd/tasks/catalog-expansion.md T4, S7;
 * method and error in docs/catalog-recipes.md). Pure: no files, no catalog; the build resolves ingredients first (recipes.ts).
 */

/** An ingredient is significant when it is at least this share of the raw ingredient weight; a gap in it makes a nutrient unknown. */
export const SIGNIFICANT_SHARE = 0.05;

export interface CalcIngredient {
  /** Per 100 g of the ingredient as the catalog states it. A missing key means "not reported", never zero. */
  per100g: NutrientAmounts;
  /** Grams as used in the recipe, before cooking (edible portion). */
  grams: number;
  /** Cooked weight / weight used (1 = no change). Default 1. */
  yieldFactor?: number;
  /** Share of each nutrient that stays after cooking (0 to 1). A nutrient not listed is kept whole. */
  retention?: Partial<Record<NutrientCode, number>>;
  /** Moisture group the ingredient belongs to (see `CalcInput.groups`). */
  group?: string;
  /** Water in g per 100 g (catalog source data); required for the ingredients of a moisture group. */
  water?: number;
}

export interface CalcInput {
  ingredients: readonly CalcIngredient[];
  /**
   * Groups whose finished weight is set by a target moisture (g water per 100 g of the finished group, taken from a
   * reference food of the catalog): solids are kept, water is lost down to the target. final = solids / (1 - moisture / 100).
   */
  groups?: Record<string, { moisture: number }>;
  /** The recipe states the weight of the finished batch; it replaces yields and groups. */
  finalGrams?: number;
}

export interface CalcResult {
  /** Sum of the grams used. */
  rawGrams: number;
  /** Weight of the finished dish. */
  finalGrams: number;
  /** Nutrients with a value, per 100 g of the finished dish. */
  per100g: NutrientAmounts;
  /** Nutrients left out because a significant ingredient (or every ingredient) does not report them. */
  unknown: NutrientCode[];
  /** Nutrients that were kept although a minor ingredient lacks them (that ingredient counts as zero): ingredient indexes. */
  understatedBy: Partial<Record<NutrientCode, number[]>>;
}

function check(input: CalcInput): void {
  if (input.ingredients.length === 0) throw new Error('The recipe has no ingredients');
  input.ingredients.forEach((i, n) => {
    if (!(i.grams > 0)) throw new Error(`Ingredient ${n + 1}: grams must be greater than 0 (got ${i.grams})`);
    const y = i.yieldFactor ?? 1;
    if (!(y > 0 && y <= 2)) throw new Error(`Ingredient ${n + 1}: the yield factor must be between 0 and 2 (got ${y})`);
    for (const [code, r] of Object.entries(i.retention ?? {})) {
      if (!(typeof r === 'number' && r >= 0 && r <= 1)) throw new Error(`Ingredient ${n + 1}: the retention of ${code} must be between 0 and 1 (got ${r})`);
    }
    if (i.group !== undefined) {
      if (!input.groups || input.groups[i.group] === undefined) throw new Error(`Ingredient ${n + 1}: the group "${i.group}" has no target moisture`);
      if (i.water === undefined) throw new Error(`Ingredient ${n + 1}: an ingredient in the group "${i.group}" needs its water content`);
    }
  });
  for (const [name, g] of Object.entries(input.groups ?? {})) {
    if (!(g.moisture >= 0 && g.moisture < 100)) throw new Error(`Group "${name}": the target moisture must be from 0 to below 100 (got ${g.moisture})`);
  }
  if (input.finalGrams !== undefined && !(input.finalGrams > 0)) throw new Error(`The final weight must be greater than 0 (got ${input.finalGrams})`);
}

/** Weight of the finished dish: the declared weight, else grams x yield outside the groups plus each group's solids / (1 - moisture). */
export function finalWeight(input: CalcInput): number {
  if (input.finalGrams !== undefined) return input.finalGrams;
  let total = 0;
  const solids = new Map<string, number>();
  for (const i of input.ingredients) {
    if (i.group === undefined) total += i.grams * (i.yieldFactor ?? 1);
    else solids.set(i.group, (solids.get(i.group) ?? 0) + i.grams * (1 - (i.water as number) / 100));
  }
  for (const [name, s] of solids) total += s / (1 - (input.groups as NonNullable<CalcInput['groups']>)[name]!.moisture / 100);
  return total;
}

export function calculateRecipe(input: CalcInput): CalcResult {
  check(input);
  const rawGrams = input.ingredients.reduce((sum, i) => sum + i.grams, 0);
  const finalGrams = finalWeight(input);
  const per100g: NutrientAmounts = {};
  const unknown: NutrientCode[] = [];
  const understatedBy: CalcResult['understatedBy'] = {};

  for (const code of NUTRIENT_CODES) {
    let total = 0;
    let reported = 0;
    let blocked = false;
    const minorMissing: number[] = [];
    input.ingredients.forEach((i, n) => {
      const value = i.per100g[code];
      if (value === undefined) {
        if (i.grams / rawGrams >= SIGNIFICANT_SHARE) blocked = true;
        else minorMissing.push(n);
        return;
      }
      reported++;
      total += (i.grams / 100) * value * (i.retention?.[code] ?? 1);
    });
    if (blocked || reported === 0) {
      unknown.push(code);
      continue;
    }
    per100g[code] = (total / finalGrams) * 100;
    if (minorMissing.length > 0) understatedBy[code] = minorMissing;
  }
  return { rawGrams, finalGrams, per100g, unknown, understatedBy };
}
