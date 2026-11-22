/** @jest-environment node */
import { calculateRecipe, type CalcIngredient } from '../recipeCalc';

/**
 * Three recipes worked out end to end by hand (docs/catalog-recipes.md section 6), with the ingredient values exactly as the catalog
 * holds them (USDA SR Legacy, per 100 g) and the factors exactly as the USDA tables publish them. No catalog is read: the numbers
 * are written here, so this test runs everywhere; recipeCatalog.test.ts checks that the built database holds the same values.
 *
 * Ingredient values used (kcal / protein g / carbs g / fat g / water g; micronutrients where noted):
 *   top round steak, 0" fat (SR 171743)      124 / 23.5 / 0 / 3.34 / 72.6      folate 4 µg, B12 1.64 µg
 *   egg, whole, raw, fresh (SR 171287)       143 / 12.6 / 0.72 / 9.51          folate 47, B12 0.89
 *   dry breadcrumbs (SR 174928)              395 / 13.4 / 72 / 5.3             folate 107, B12 0.35
 *   soybean oil (SR 172370)                  884 / 0 / 0 / 100
 *   table salt (SR 173468)                   0 / 0 / 0 / 0 / 0.2               folate 0, B12 0
 */
const ing = (grams: number, per100g: CalcIngredient['per100g'], extra: Partial<CalcIngredient> = {}): CalcIngredient => ({ grams, per100g, ...extra });

describe('hand-checked recipe 1: milanesa de carne, frita (ingredient yields and retention factors)', () => {
  // Yield of the beef: USDA cooking yield, top round steak, broiled, 72 % (13893). Retention: BEEF,FRIED folate 85 %, B12 80 % (0605);
  // EGGS,FRIED,SCRAMBLED folate 75 %, B12 85 % (0103); FLOUR/MEAL,SAUTEED folate 65 %, B12 100 % (0305).
  const result = calculateRecipe({
    ingredients: [
      ing(120, { kcal: 124, protein: 23.5, carbs: 0, fat: 3.34, folate: 4, vit_b12: 1.64 }, { yieldFactor: 0.72, retention: { folate: 0.85, vit_b12: 0.8 } }),
      ing(20, { kcal: 143, protein: 12.6, carbs: 0.72, fat: 9.51, folate: 47, vit_b12: 0.89 }, { retention: { folate: 0.75, vit_b12: 0.85 } }),
      ing(25, { kcal: 395, protein: 13.4, carbs: 72, fat: 5.3, folate: 107, vit_b12: 0.35 }, { retention: { folate: 0.65, vit_b12: 1 } }),
      ing(10, { kcal: 884, protein: 0, carbs: 0, fat: 100, folate: 0, vit_b12: 0 }),
      ing(1, { kcal: 0, protein: 0, carbs: 0, fat: 0, folate: 0, vit_b12: 0 }),
    ],
  });

  it('finished weight: 120 x 0.72 + 20 + 25 + 10 + 1 = 86.4 + 56 = 142.4 g', () => {
    expect(result.rawGrams).toBe(176);
    expect(result.finalGrams).toBeCloseTo(142.4, 9);
  });

  it('energy: 1.2 x 124 + 0.2 x 143 + 0.25 x 395 + 0.1 x 884 = 148.8 + 28.6 + 98.75 + 88.4 = 364.55 kcal; / 1.424 = 256.00 kcal per 100 g', () => {
    expect(result.per100g.kcal).toBeCloseTo(256.0042, 3);
  });

  it('protein 1.2 x 23.5 + 0.2 x 12.6 + 0.25 x 13.4 = 28.2 + 2.52 + 3.35 = 34.07 g -> 23.93 g; carbs 0 + 0.144 + 18 = 18.144 g -> 12.74 g; fat 4.008 + 1.902 + 1.325 + 10 = 17.235 g -> 12.10 g', () => {
    expect(result.per100g.protein).toBeCloseTo(23.9256, 3);
    expect(result.per100g.carbs).toBeCloseTo(12.7416, 3);
    expect(result.per100g.fat).toBeCloseTo(12.1032, 3);
  });

  it('folate: 1.2 x 4 x 0.85 + 0.2 x 47 x 0.75 + 0.25 x 107 x 0.65 = 4.08 + 7.05 + 17.3875 = 28.5175 µg -> 20.03 µg; B12: 1.2 x 1.64 x 0.80 + 0.2 x 0.89 x 0.85 + 0.25 x 0.35 = 1.5744 + 0.1513 + 0.0875 = 1.8132 µg -> 1.273 µg', () => {
    expect(result.per100g.folate).toBeCloseTo(20.0262, 3);
    expect(result.per100g.vit_b12).toBeCloseTo(1.2733, 3);
  });
});

describe('hand-checked recipe 2: empanada de carne, al horno (a yield, plus dough baked down to the moisture of a reference food)', () => {
  // Dough group, baked to the water of "Biscuits, plain or buttermilk, frozen, baked" (SR 172667): 26.7 g per 100 g.
  //   flour 24 g (364 kcal, 10.3 / 76.3 / 0.98, water 11.9), lard 6 g (902 kcal, fat 100, water 0), water 9 g (99.9 % water), salt 0.4 g (water 0.2)
  //   solids = 24 x 0.881 + 6 + 9 x 0.001 + 0.4 x 0.998 = 21.144 + 6 + 0.009 + 0.3992 = 27.5522 g; dough = 27.5522 / (1 - 0.267) = 37.588 g
  // Filling, outside the group: ground beef 85/15 28 g raw at 67 % (USDA yield, ground beef crumbles, pan-fried, 23575) = 18.76 g; onion 18; hard-boiled egg 8;
  //   olives 3; lard 2; paprika 0.3; cumin 0.2; salt 0.4 = 18.76 + 18 + 8 + 3 + 2 + 0.3 + 0.2 + 0.4 = 50.66 g.
  const result = calculateRecipe({
    ingredients: [
      ing(24, { kcal: 364, protein: 10.3, carbs: 76.3, fat: 0.98 }, { group: 'dough', water: 11.9 }),
      ing(6, { kcal: 902, protein: 0, carbs: 0, fat: 100 }, { group: 'dough', water: 0 }),
      ing(9, { kcal: 0, protein: 0, carbs: 0, fat: 0 }, { group: 'dough', water: 99.9 }),
      ing(0.4, { kcal: 0, protein: 0, carbs: 0, fat: 0 }, { group: 'dough', water: 0.2 }),
      ing(28, { kcal: 215, protein: 18.6, carbs: 0, fat: 15 }, { yieldFactor: 0.67 }),
      ing(18, { kcal: 40, protein: 1.1, carbs: 9.34, fat: 0.1 }),
      ing(8, { kcal: 155, protein: 12.6, carbs: 1.12, fat: 10.6 }),
      ing(3, { kcal: 145, protein: 1.03, carbs: 3.84, fat: 15.3 }),
      ing(2, { kcal: 902, protein: 0, carbs: 0, fat: 100 }),
      ing(0.3, { kcal: 282, protein: 14.1, carbs: 54, fat: 12.9 }),
      ing(0.2, { kcal: 375, protein: 17.8, carbs: 44.2, fat: 22.3 }),
      ing(0.4, { kcal: 0, protein: 0, carbs: 0, fat: 0 }),
    ],
    groups: { dough: { moisture: 26.7 } },
  });

  it('finished weight: dough 37.588 g + filling 50.66 g = 88.248 g', () => {
    expect(result.finalGrams).toBeCloseTo(88.2478, 3);
  });

  it('energy: 87.36 (flour) + 54.12 (lard) + 60.2 (beef) + 7.2 (onion) + 12.4 (egg) + 4.35 (olives) + 18.04 (lard) + 0.846 (paprika) + 0.75 (cumin) = 245.266 kcal -> 277.93 kcal per 100 g', () => {
    expect(result.per100g.kcal).toBeCloseTo(277.927, 2);
  });

  it('protein 8.9948 g -> 10.19 g; carbs 20.4484 g -> 23.17 g; fat 13.8435 g -> 15.69 g', () => {
    expect(result.per100g.protein).toBeCloseTo(10.1925, 2);
    expect(result.per100g.carbs).toBeCloseTo(23.1717, 2);
    expect(result.per100g.fat).toBeCloseTo(15.6872, 2);
  });
});

describe('hand-checked recipe 3: medialuna de manteca (the whole pastry baked down to the moisture of a butter croissant)', () => {
  // Reference: "Croissants, butter" (SR 174987), water 23.2 g per 100 g.
  //   flour 24 g (364 kcal, water 11.9), butter 12 g (717 kcal, water 16.2), sugar 6 g (387 kcal, water 0.02), egg 4 g (143 kcal, water 76.2),
  //   milk 6 g (61 kcal, water 88.1), yeast 0.5 g (325 kcal, water 5.08), salt 0.3 g (0 kcal, water 0.2)
  //   solids = 21.144 + 10.056 + 5.9988 + 0.9520 + 0.7140 + 0.4746 + 0.2994 = 39.6388 g; finished = 39.6388 / 0.768 = 51.613 g
  const result = calculateRecipe({
    ingredients: [
      ing(24, { kcal: 364 }, { group: 'all', water: 11.9 }),
      ing(12, { kcal: 717 }, { group: 'all', water: 16.2 }),
      ing(6, { kcal: 387 }, { group: 'all', water: 0.02 }),
      ing(4, { kcal: 143 }, { group: 'all', water: 76.2 }),
      ing(6, { kcal: 61 }, { group: 'all', water: 88.1 }),
      ing(0.5, { kcal: 325 }, { group: 'all', water: 5.08 }),
      ing(0.3, { kcal: 0 }, { group: 'all', water: 0.2 }),
    ],
    groups: { all: { moisture: 23.2 } },
  });

  it('finished weight 51.613 g and energy 87.36 + 86.04 + 23.22 + 5.72 + 3.66 + 1.625 = 207.625 kcal -> 402.27 kcal per 100 g', () => {
    expect(result.finalGrams).toBeCloseTo(51.613, 3);
    expect(result.per100g.kcal).toBeCloseTo(402.27, 2);
  });
});
