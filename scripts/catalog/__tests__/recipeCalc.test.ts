/** @jest-environment node */
import { calculateRecipe, SIGNIFICANT_SHARE, type CalcIngredient } from '../recipeCalc';

/**
 * The calculator of recipe-calculated foods (odd/tasks/catalog-expansion.md T4, S7). Every expected number below is
 * worked out by hand in the comment above it; docs/catalog-recipes.md section 2 gives the formulas.
 */
const ing = (over: Partial<CalcIngredient> & Pick<CalcIngredient, 'grams'>): CalcIngredient => ({ per100g: {}, ...over });

describe('calculateRecipe', () => {
  it('adds ingredients by weight and divides by the final weight: 100 g (200 kcal) + 100 g (400 kcal) = 300 kcal per 100 g', () => {
    // total kcal = 100/100*200 + 100/100*400 = 600; final weight 200 g; 600 / 200 * 100 = 300.
    // protein: 100/100*10 + 100/100*2 = 12 g; 12 / 200 * 100 = 6 g.
    const r = calculateRecipe({
      ingredients: [ing({ grams: 100, per100g: { kcal: 200, protein: 10 } }), ing({ grams: 100, per100g: { kcal: 400, protein: 2 } })],
    });
    expect(r.finalGrams).toBe(200);
    expect(r.per100g.kcal).toBeCloseTo(300, 9);
    expect(r.per100g.protein).toBeCloseTo(6, 9);
  });

  it('applies a cooking yield to the final weight: 100 g raw at 72 % yield is 72 g cooked, so every value rises by 1 / 0.72', () => {
    // 100 g raw chicken: 120 kcal, 22.5 g protein per 100 g. Cooked weight 72 g. kcal 120 / 72 * 100 = 166.667; protein 22.5 / 72 * 100 = 31.25.
    const r = calculateRecipe({ ingredients: [ing({ grams: 100, yieldFactor: 0.72, per100g: { kcal: 120, protein: 22.5 } })] });
    expect(r.finalGrams).toBeCloseTo(72, 9);
    expect(r.per100g.kcal).toBeCloseTo(166.6667, 3);
    expect(r.per100g.protein).toBeCloseTo(31.25, 9);
  });

  it('the ingredient weights sum through their yields: final weight = sum of grams x yield', () => {
    const r = calculateRecipe({
      ingredients: [ing({ grams: 200, yieldFactor: 0.8, per100g: { kcal: 100 } }), ing({ grams: 50, per100g: { kcal: 100 } }), ing({ grams: 10, yieldFactor: 1, per100g: { kcal: 884 } })],
    });
    expect(r.rawGrams).toBe(260);
    expect(r.finalGrams).toBeCloseTo(200 * 0.8 + 50 + 10, 9); // 220
  });

  it('applies a retention factor to that nutrient only: vitamin C 10 mg/100 g kept at 80 % in 100 g that ends at 72 g', () => {
    // vit_c: 100/100*10*0.8 = 8 mg; 8 / 72 * 100 = 11.111. kcal has no retention: 50 / 72 * 100 = 69.444.
    const r = calculateRecipe({ ingredients: [ing({ grams: 100, yieldFactor: 0.72, retention: { vit_c: 0.8 }, per100g: { kcal: 50, vit_c: 10 } })] });
    expect(r.per100g.vit_c).toBeCloseTo(11.1111, 3);
    expect(r.per100g.kcal).toBeCloseTo(69.4444, 3);
  });

  it('reports a nutrient as unknown when a significant ingredient lacks it, instead of understating it', () => {
    // Ingredient B is 50 % of the weight and has no vitamin D: the dish value would be at most half of the truth, so it is left out.
    const r = calculateRecipe({
      ingredients: [ing({ grams: 100, per100g: { kcal: 100, vit_d: 2 } }), ing({ grams: 100, per100g: { kcal: 100 } })],
    });
    expect(r.per100g.kcal).toBeCloseTo(100, 9);
    expect(r.per100g).not.toHaveProperty('vit_d');
    expect(r.unknown).toContain('vit_d');
  });

  it('reports a nutrient nobody has as unknown, never as zero', () => {
    const r = calculateRecipe({ ingredients: [ing({ grams: 100, per100g: { kcal: 100 } })] });
    expect(r.per100g).not.toHaveProperty('vit_c');
    expect(r.unknown).toContain('vit_c');
  });

  it('keeps a nutrient a minor ingredient lacks (under 5 % of the weight), and records which ingredient is missing it', () => {
    // Spice: 4 g of 104 g (3.8 %) with no iron: iron = 100/100*2 = 2 mg; 2 / 104 * 100 = 1.923 mg. Index 1 is noted.
    const r = calculateRecipe({ ingredients: [ing({ grams: 100, per100g: { kcal: 100, iron: 2 } }), ing({ grams: 4, per100g: { kcal: 250 } })] });
    expect(r.per100g.iron).toBeCloseTo(1.9231, 3);
    expect(r.unknown).not.toContain('iron');
    expect(r.understatedBy.iron).toEqual([1]);
  });

  it('treats exactly the significant share as significant (5 % of the raw weight)', () => {
    expect(SIGNIFICANT_SHARE).toBe(0.05);
    // 5 g of 100 g is exactly 5 %: significant, so a missing value makes the nutrient unknown.
    const r = calculateRecipe({ ingredients: [ing({ grams: 95, per100g: { kcal: 100, iron: 2 } }), ing({ grams: 5, per100g: { kcal: 100 } })] });
    expect(r.unknown).toContain('iron');
  });

  it('a nutrient reported as zero is a value, not a gap', () => {
    const r = calculateRecipe({ ingredients: [ing({ grams: 100, per100g: { kcal: 100, sugars: 0 } }), ing({ grams: 100, per100g: { kcal: 100, sugars: 4 } })] });
    expect(r.per100g.sugars).toBeCloseTo(2, 9);
  });

  it('dough that bakes to the moisture of a reference food: solids are kept, water is lost down to the target', () => {
    // 100 g flour (12 g water per 100 g) + 60 g water: solids = 88 + 0 = 88 g. Target moisture 30 %: final = 88 / (1 - 0.30) = 125.714 g.
    // kcal: 100/100*360 = 360; 360 / 125.714 * 100 = 286.364.
    const r = calculateRecipe({
      ingredients: [ing({ grams: 100, group: 'dough', water: 12, per100g: { kcal: 360 } }), ing({ grams: 60, group: 'dough', water: 100, per100g: { kcal: 0 } })],
      groups: { dough: { moisture: 30 } },
    });
    expect(r.finalGrams).toBeCloseTo(125.7143, 3);
    expect(r.per100g.kcal).toBeCloseTo(286.3636, 3);
  });

  it('adds a moisture group to the ingredients outside it: filling 100 g at 80 % yield + dough group', () => {
    // filling: 100 * 0.8 = 80 g. dough: 50 g flour (water 10) -> solids 45 g; target 25 % -> 45 / 0.75 = 60 g. final = 140 g.
    const r = calculateRecipe({
      ingredients: [ing({ grams: 100, yieldFactor: 0.8, per100g: { kcal: 100 } }), ing({ grams: 50, group: 'dough', water: 10, per100g: { kcal: 360 } })],
      groups: { dough: { moisture: 25 } },
    });
    expect(r.finalGrams).toBeCloseTo(140, 9);
    // kcal total = 100 + 180 = 280; 280 / 140 * 100 = 200.
    expect(r.per100g.kcal).toBeCloseTo(200, 9);
  });

  it('uses the declared final weight of the batch when the recipe gives one, ignoring yields', () => {
    // 1,000 g of ingredients with 1,000 kcal in total, declared to end at 800 g: 1000 / 800 * 100 = 125.
    const r = calculateRecipe({ ingredients: [ing({ grams: 1000, yieldFactor: 0.5, per100g: { kcal: 100 } })], finalGrams: 800 });
    expect(r.finalGrams).toBe(800);
    expect(r.per100g.kcal).toBeCloseTo(125, 9);
  });

  it.each([
    ['no ingredients', { ingredients: [] }, /no ingredients/i],
    ['zero grams', { ingredients: [ing({ grams: 0 })] }, /grams/i],
    ['a yield of zero', { ingredients: [ing({ grams: 10, yieldFactor: 0 })] }, /yield/i],
    ['a yield above 2', { ingredients: [ing({ grams: 10, yieldFactor: 2.5 })] }, /yield/i],
    ['a retention above 1', { ingredients: [ing({ grams: 10, retention: { vit_c: 1.2 } })] }, /retention/i],
    ['a group without its moisture', { ingredients: [ing({ grams: 10, group: 'dough', water: 10 })] }, /group/i],
    ['a group ingredient without water', { ingredients: [ing({ grams: 10, group: 'dough' })], groups: { dough: { moisture: 20 } } }, /water/i],
    ['a target moisture of 100', { ingredients: [ing({ grams: 10, group: 'dough', water: 10 })], groups: { dough: { moisture: 100 } } }, /moisture/i],
    ['a declared weight of zero', { ingredients: [ing({ grams: 10 })], finalGrams: 0 }, /final/i],
  ])('refuses %s with a clear message', (_name, input, message) => {
    expect(() => calculateRecipe(input as never)).toThrow(message);
  });
});
