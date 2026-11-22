import { cleanup, fireEvent, screen, within } from '@testing-library/react-native';
import { useState } from 'react';

import { RECIPE_ID_BASE } from '@/core/catalog';
import { computeItemNutrients } from '@/core/nutrition';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { MealDetailScreen } from '../../meals/MealDetailScreen';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { FoodSearchScreen } from '../FoodSearchScreen';
import { MealDraftProvider } from '../draft';
import { ReviewScreen } from '../ReviewScreen';
import { FIXTURE_RECIPE } from '../../../../scripts/catalog/testing/fixture';

/**
 * S8 (odd/tasks/catalog-expansion.md T4): a food calculated from a recipe is marked as such wherever the app shows where a
 * value came from: search results, the portion sheet, the review row and the meal detail, in English and Spanish, with a way
 * to read the method. It is distinct from catalog data ("Catalog") and from the AI estimate.
 */
const LUNCH = new Date(2026, 10, 21, 12, 0);
const RECIPE_ID = String(RECIPE_ID_BASE + FIXTURE_RECIPE.id);

let h: Harness;
let services: ReturnType<typeof createTestServices>;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h, { recipes: true });
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

function Flow({ start = 'search' }: { start?: 'search' | 'review' }) {
  const [view, setView] = useState<'search' | 'review'>(start);
  return (
    <MealDraftProvider>
      {view === 'search' ? <FoodSearchScreen onAdded={() => setView('review')} onOpenReview={() => setView('review')} onCreateCustom={jest.fn()} /> : null}
      {view === 'review' ? <ReviewScreen now={() => new Date(LUNCH)} onAddItem={() => setView('search')} onSaved={jest.fn()} onClose={() => setView('search')} /> : null}
    </MealDraftProvider>
  );
}

async function search(query: string) {
  await fireEvent.changeText(await screen.findByLabelText(/^(Search foods|Buscar alimentos)$/), query);
}
async function foodRow(name: RegExp) {
  const matches = await screen.findAllByRole('button', { name });
  return matches.find((m) => !/favorites$|favoritos$/.test(String(m.props.accessibilityLabel)))!;
}

describe('search results', () => {
  it('mark a recipe-calculated food, in English, and leave catalog foods unmarked', async () => {
    await renderApp(<Flow />, { services });
    await search('chicken and rice');
    const row = await foodRow(/Chicken with rice, home style/);
    expect(within(row).getByText('Calculated from a recipe')).toBeOnTheScreen();
    // "rice" also finds the recipe; the catalog rice row beside it carries no mark.
    await search('rice white');
    const rice = await foodRow(/^Rice, white/);
    expect(within(rice).queryByText('Calculated from a recipe')).not.toBeOnTheScreen();
  });

  it('mark it in Spanish too', async () => {
    await renderApp(<Flow />, { services, locale: 'es' });
    await search('arroz con pollo');
    const row = await foodRow(/Arroz con pollo casero/);
    expect(within(row).getByText('Calculado a partir de una receta')).toBeOnTheScreen();
  });
});

describe('portion sheet', () => {
  it('marks the food and opens the method: ingredients with grams and yield, preparation, weights, sources and what is not reported', async () => {
    await renderApp(<Flow />, { services });
    await search('chicken and rice');
    await fireEvent.press(await foodRow(/Chicken with rice, home style/));
    // The mark shows on the result row behind the sheet and at the top of the sheet.
    expect(await screen.findAllByText('Calculated from a recipe')).toHaveLength(2);
    await fireEvent.press(await screen.findByRole('button', { name: 'How it was calculated' }));
    expect(await screen.findByText('Roast the chicken and serve it on the rice.')).toBeOnTheScreen();
    expect(screen.getByText('A home preparation written for the tests.')).toBeOnTheScreen();
    expect(screen.getByText('Chicken, breast, meat only, raw · 150 g · cooks to 72 % of its weight')).toBeOnTheScreen();
    expect(screen.getByText('Rice, white, long-grain, regular, cooked · 200 g')).toBeOnTheScreen();
    expect(screen.getByText('Ingredients 350 g, finished dish 308 g')).toBeOnTheScreen();
    expect(screen.getByText('Fixture yield table: 5060, Baked or Roasted, unspecified, 72 %')).toBeOnTheScreen();
    expect(screen.getByText(/Not reported because an ingredient lacks it: .*Vitamin D/)).toBeOnTheScreen();
    expect(screen.getByText('Recipe set fixture-recipes@1')).toBeOnTheScreen();
  });

  it('reads the method in Spanish', async () => {
    await renderApp(<Flow />, { services, locale: 'es' });
    await search('arroz con pollo');
    await fireEvent.press(await foodRow(/Arroz con pollo casero/));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cómo se calculó' }));
    expect(await screen.findByText('Asar el pollo y servirlo sobre el arroz.')).toBeOnTheScreen();
    expect(screen.getByText('Arroz blanco, cocido · 200 g')).toBeOnTheScreen();
    expect(screen.getByText('Ingredientes 350 g, plato terminado 308 g')).toBeOnTheScreen();
  });

  it('shows no recipe mark and no method button for a catalog food', async () => {
    await renderApp(<Flow />, { services });
    await search('banana');
    await fireEvent.press(await foodRow(/^Bananas, raw/));
    await screen.findByLabelText('Amount in grams');
    expect(screen.queryByText('Calculated from a recipe')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'How it was calculated' })).not.toBeOnTheScreen();
  });
});

describe('review row', () => {
  it('says "Calculated from a recipe" instead of "Catalog" and opens the method', async () => {
    await renderApp(<Flow />, { services });
    await search('chicken and rice');
    await fireEvent.press(await foodRow(/Chicken with rice, home style/));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add to meal' }));
    const item = await screen.findByTestId('review-item-Chicken with rice, home style');
    expect(within(item).queryByText('Catalog')).not.toBeOnTheScreen();
    await fireEvent.press(within(item).getByRole('button', { name: 'Calculated from a recipe: how it was calculated' }));
    expect(await screen.findByText('Roast the chicken and serve it on the rice.')).toBeOnTheScreen();
  });

  it('keeps "Catalog" on a food that is not a recipe', async () => {
    await renderApp(<Flow />, { services });
    await search('rice white');
    await fireEvent.press(await foodRow(/^Rice, white/));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add to meal' }));
    const item = await screen.findByTestId(/^review-item-Rice, white/);
    expect(within(item).getByText('Catalog')).toBeOnTheScreen();
    expect(within(item).queryByText('Calculated from a recipe')).not.toBeOnTheScreen();
  });
});

describe('meal detail', () => {
  async function seed() {
    const food = await services.catalog.getFood({ source: 'catalog', id: RECIPE_ID });
    const [rice] = await services.catalog.search('rice white', 'en', 1);
    const riceFood = await services.catalog.getFood(rice!.ref);
    return h.repos.meals.save({
      eatenAt: new Date(2026, 10, 20, 13, 10),
      slot: 'lunch',
      source: 'manual',
      items: [
        { displayName: 'Chicken with rice, home style', grams: 300, foodSource: 'catalog', foodRef: RECIPE_ID, origin: 'manual', nutrients: computeItemNutrients(food, 300) },
        { displayName: rice!.name, grams: 100, foodSource: 'catalog', foodRef: rice!.ref.id, origin: 'manual', nutrients: computeItemNutrients(riceFood, 100) },
        { displayName: 'Bread, estimated', grams: 60, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 150, protein: 5, carbs: 28, fat: 2 } },
      ],
    });
  }

  it('marks the recipe item, opens its method, and keeps the AI estimate mark apart', async () => {
    const meal = await seed();
    await renderApp(<MealDetailScreen mealId={meal.id} now={() => new Date(LUNCH)} onClose={jest.fn()} onCopied={jest.fn()} />, { services });
    await screen.findByText('Chicken with rice, home style');
    const marks = screen.getAllByText('Calculated from a recipe');
    expect(marks).toHaveLength(1);
    expect(screen.getAllByText('AI estimate')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Calculated from a recipe: how it was calculated' }));
    expect(await screen.findByText('Roast the chicken and serve it on the rice.')).toBeOnTheScreen();
  });

  it('marks it in Spanish', async () => {
    const meal = await seed();
    await renderApp(<MealDetailScreen mealId={meal.id} now={() => new Date(LUNCH)} onClose={jest.fn()} onCopied={jest.fn()} />, { services, locale: 'es' });
    await screen.findByText('Chicken with rice, home style');
    expect(screen.getAllByText('Calculado a partir de una receta')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Calculado a partir de una receta: cómo se calculó' }));
    expect(await screen.findByText('Asar el pollo y servirlo sobre el arroz.')).toBeOnTheScreen();
  });
});

describe('data sources text', () => {
  it('tells, in both languages, that some dishes are calculated from recipes and are not laboratory data', () => {
    const en = i18n.getFixedT('en')('about.sources.recipesNote');
    const es = i18n.getFixedT('es')('about.sources.recipesNote');
    expect(en).toMatch(/calculated/i);
    expect(en).toMatch(/recipe/i);
    expect(en).toMatch(/not laboratory/i);
    expect(es).toMatch(/calculad/i);
    expect(es).toMatch(/receta/i);
    expect(es).toMatch(/no son datos de laboratorio/i);
  });
});
