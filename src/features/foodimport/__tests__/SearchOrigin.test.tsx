import { cleanup, fireEvent, screen, within } from '@testing-library/react-native';
import { useState } from 'react';

import { computeItemNutrients } from '@/core/nutrition';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { FoodSearchScreen } from '../../logging/FoodSearchScreen';
import { MealDraftProvider } from '../../logging/draft';
import { ReviewScreen } from '../../logging/ReviewScreen';
import { MealDetailScreen } from '../../meals/MealDetailScreen';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';

const LUNCH = new Date(2026, 10, 21, 12, 0);
let h: Harness;
let services: ReturnType<typeof createTestServices>;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
});

function Flow() {
  const [view, setView] = useState<'search' | 'review'>('search');
  return (
    <MealDraftProvider>
      {view === 'search' ? <FoodSearchScreen onAdded={() => setView('review')} onOpenReview={() => setView('review')} onCreateCustom={() => undefined} /> : null}
      {view === 'review' ? <ReviewScreen now={() => new Date(LUNCH)} onAddItem={() => setView('search')} onSaved={() => undefined} onClose={() => setView('search')} /> : null}
    </MealDraftProvider>
  );
}

const search = async (query: string) => fireEvent.changeText(await screen.findByLabelText(/^(Search foods|Buscar alimentos)$/), query);

describe('imported foods on the screens (S5)', () => {
  it('search: a result carries a tag with the table name, unknown values are dashes, and it can be starred', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Mi tabla' }, [{ name: 'Alimento incompleto', per100g: { kcal: 50 } }]);
    await renderApp(<Flow />, { services });
    await search('incompleto');
    const tag = await screen.findByTestId('imported-tag');
    expect(within(tag).getByText('Imported · Mi tabla')).toBeTruthy();
    expect(screen.getByText('50 kcal · P – · C – · F – per 100 g')).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'Add Alimento incompleto to favorites' }));
    expect((await h.repos.foodUsage.favorites()).map((f) => f.foodRef)).toHaveLength(1);
  });

  it('search finds it without accents, in Spanish, with the tag', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Mi tabla' }, [{ name: 'Plátano de ejemplo', per100g: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3 } }]);
    await renderApp(<Flow />, { services, locale: 'es' });
    await search('platano');
    expect(await screen.findByText('Importada · Mi tabla')).toBeTruthy();
  });

  it('portion sheet, review row: the origin shows, a per 100 ml table says how ml is counted, and unknown stays a dash', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Bebidas', basis: 'ml' }, [{ name: 'Jugo inventado', per100g: { kcal: 45 } }]);
    await renderApp(<Flow />, { services });
    await search('jugo');
    await fireEvent.press(await screen.findByRole('button', { name: /^Jugo inventado/ }));
    const origin = await screen.findByTestId('imported-origin');
    expect(within(origin).getByText('Imported · Bebidas · per 100 ml')).toBeTruthy();
    expect(within(origin).getByText(/1 ml counts as 1 g/)).toBeTruthy();
    expect(within(origin).getByText(/never counted as zero/)).toBeTruthy();
    expect(screen.getByText('45 kcal · – g protein · – g carbs · – g fat')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount in grams'), '200');
    await fireEvent.press(screen.getByRole('button', { name: 'Add to meal' }));
    // The review row keeps the tag.
    expect(await screen.findByText('Imported · Bebidas · per 100 ml')).toBeTruthy();
  });
});

describe('imported foods in a saved meal', () => {
  it('meal detail names the table; after the table is removed the meal and its totals stay and the tag goes', async () => {
    const table = await h.repos.importedFoods.importCollection({ name: 'Mi tabla' }, [{ name: 'Lenteja de ejemplo', per100g: { kcal: 116, protein: 9 } }]);
    const [food] = await h.repos.importedFoods.search('lenteja', 1);
    const meal = await h.repos.meals.save({
      eatenAt: new Date('2026-06-15T12:00:00.000Z'),
      timeZone: 'UTC',
      slot: 'lunch',
      source: 'manual',
      items: [{ displayName: food!.name, grams: 200, foodSource: 'custom', foodRef: food!.id, origin: 'manual', nutrients: computeItemNutrients({ per100g: food!.per100g }, 200) }],
    });
    await renderApp(<MealDetailScreen mealId={meal.id} onClose={() => undefined} onCopied={() => undefined} />, { services });
    expect(await screen.findByText('Imported · Mi tabla')).toBeTruthy();
    expect(screen.getAllByText('Lenteja de ejemplo').length).toBeGreaterThan(0);
    await cleanup();

    await h.repos.importedFoods.removeCollection(table.id);
    await renderApp(<MealDetailScreen mealId={meal.id} onClose={() => undefined} onCopied={() => undefined} />, { services });
    expect((await screen.findAllByText('Lenteja de ejemplo')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Imported · Mi tabla')).toBeNull();
    expect((await h.repos.meals.getDay('2026-06-15')).totals.kcal).toBeCloseTo(232);
  });
});
