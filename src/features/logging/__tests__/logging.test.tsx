import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import type { FoodRef } from '@/core/catalog';
import { computeItemNutrients } from '@/core/nutrition';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { TodayScreen } from '../../today/TodayScreen';
import { CustomFoodScreen } from '../CustomFoodScreen';
import { FoodSearchScreen } from '../FoodSearchScreen';
import { MealDraftProvider } from '../draft';
import { pickSlot } from '../mealSlot';
import { ReviewScreen } from '../ReviewScreen';

// 21 Nov 2026, 12:00 local: lunch time.
const LUNCH = new Date(2026, 10, 21, 12, 0);
const TODAY = '2026-11-21';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let now = LUNCH;
const clock = () => new Date(now);

beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
  now = LUNCH;
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

type View = 'search' | 'review' | 'custom' | 'today';

/** Stands in for the router: the same screens the routes mount, switched by callbacks. */
function Flow({ start = 'search', customName }: { start?: View; customName?: string }) {
  const [view, setView] = useState<View>(start);
  const [query, setQuery] = useState(customName ?? '');
  return (
    <MealDraftProvider>
      {view === 'search' ? (
        <FoodSearchScreen onAdded={() => setView('review')} onOpenReview={() => setView('review')} onCreateCustom={(q) => { setQuery(q); setView('custom'); }} />
      ) : null}
      {view === 'custom' ? <CustomFoodScreen initialName={query} onCreated={() => setView('search')} /> : null}
      {view === 'review' ? <ReviewScreen now={clock} onAddItem={() => setView('search')} onSaved={() => setView('today')} onClose={() => setView('search')} /> : null}
      {view === 'today' ? <TodayScreen now={clock} onOpenSettings={jest.fn()} /> : null}
    </MealDraftProvider>
  );
}

const open = (ui = <Flow />, locale: 'en' | 'es' = 'en') => renderApp(ui, { services, locale });

async function search(query: string) {
  await fireEvent.changeText(await screen.findByLabelText(/^(Search foods|Buscar alimentos)$/), query);
}

/** The result row for a food (not its favorite star, whose name also contains the food's name). */
async function foodRow(name: RegExp) {
  const matches = await screen.findAllByRole('button', { name });
  return matches.find((m) => !/favorites$/.test(String(m.props.accessibilityLabel)))!;
}

async function addFood(query: string, name: RegExp, grams: string) {
  await search(query);
  await fireEvent.press(await foodRow(name));
  await fireEvent.changeText(await screen.findByLabelText('Amount in grams'), grams);
  return screen.getByRole('button', { name: 'Add to meal' });
}

describe('food search (S8, FR-30)', () => {
  it('finds chicken for "pollo" in Spanish', async () => {
    await open(<Flow />, 'es');
    await search('pollo');
    const results = await screen.findAllByRole('button', { name: /Pollo, pechuga/ });
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /Pollo, pechuga, a la plancha, 165 kilocalorías por 100 gramos/ })).toBeOnTheScreen();
  });

  it('finds chicken for "chicken" in English', async () => {
    await open();
    await search('chicken');
    const results = await screen.findAllByRole('button', { name: /^Chicken, breast, meat only/ });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the English name when there is no translation', async () => {
    await open(<Flow />, 'es');
    await search('lentils');
    expect(await foodRow(/Lentils, raw/)).toBeOnTheScreen();
  });

  it('finds a food through the Spanish alias without the accent', async () => {
    await open(<Flow />, 'es');
    await search('platano');
    expect(await foodRow(/Plátano, crudo/)).toBeOnTheScreen();
  });

  it('works with no network at all', async () => {
    const fetchSpy = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    await open();
    await search('rice');
    await screen.findAllByRole('button', { name: /Rice/ });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows a hint when empty, and no results with a way to create the food', async () => {
    await open();
    expect(await screen.findByText(/Type a food name to search/)).toBeOnTheScreen();
    await search('zzzz');
    expect(await screen.findByText('No results for “zzzz”')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create custom food' })).toBeOnTheScreen();
  });

  it('puts favorites and recents before the results', async () => {
    const [brown] = await services.catalog.search('brown rice', 'en', 1);
    await h.repos.foodUsage.setFavorite(brown!.ref, true);
    const [banana] = await services.catalog.search('banana', 'en', 1);
    await h.repos.foodUsage.recordUse(banana!.ref, 118);

    await open();
    expect(await screen.findByText('Favorites')).toBeOnTheScreen();
    expect(screen.getByText('Recent')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Rice, brown, long-grain, cooked/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Bananas, raw/ })).toBeOnTheScreen();

    // Searching keeps the favorite on top of equally good matches.
    await search('rice');
    const rows = await screen.findAllByRole('button', { name: /^Rice,/ });
    expect(rows[0]).toHaveAccessibleName(/^Rice, brown, long-grain, cooked/);
  });
});

describe('portion sheet and review (flow D)', () => {
  it('shows live calories and macros for the grams entered', async () => {
    await open();
    await addFood('chicken', /grilled/, '150');
    expect(screen.getByText('248 kcal · 46.5 g protein · 0 g carbs · 5.4 g fat')).toBeOnTheScreen();
    await type('Amount in grams', '200');
    expect(screen.getByText('330 kcal · 62 g protein · 0 g carbs · 7.2 g fat')).toBeOnTheScreen();
  });

  it('takes a household measure from the catalog', async () => {
    await open();
    await search('banana');
    await fireEvent.press(await foodRow(/^Bananas, raw/));
    await fireEvent.press(await screen.findByRole('button', { name: /^1 medium .*, 118 grams$/ }));
    expect(screen.getByLabelText('Amount in grams')).toHaveDisplayValue('118');
    expect(screen.getByText(/^105 kcal · /)).toBeOnTheScreen();
  });

  it('rejects an empty, non-numeric or impossible amount without closing the sheet', async () => {
    await open();
    await addFood('chicken', /grilled/, '');
    await press('Add to meal');
    expect(await screen.findByText('Enter an amount in grams.')).toBeOnTheScreen();
    await type('Amount in grams', 'abc');
    await press('Add to meal');
    expect(await screen.findByText('Enter a number, like 150.')).toBeOnTheScreen();
    await type('Amount in grams', '0');
    await press('Add to meal');
    expect(await screen.findByText('Enter between 1 and 5,000 grams.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Amount in grams')).toHaveDisplayValue('0');
    expect(screen.queryByRole('header', { name: 'Review your meal' })).toBeNull();
  });

  it('saves a meal whose totals match the hand-calculated values, and it appears on Today', async () => {
    await open();
    await fireEvent.press(await addFood('chicken', /Chicken, breast, meat only, cooked, grilled/, '150'));
    await screen.findByRole('header', { name: 'Review your meal' });
    await press('Add another food');
    await fireEvent.press(await addFood('rice', /white, long-grain, regular, cooked/, '200'));
    await screen.findByRole('header', { name: 'Review your meal' });

    // Lunch is preselected from the 12:00 clock; the totals are pinned above Save.
    expect(screen.getByRole('radio', { name: 'Lunch' })).toBeChecked();
    expect(screen.getByLabelText(/^508 kilocalories, 51.9 grams protein, 56.3 grams carbs, 6 grams fat$/)).toBeOnTheScreen();

    await press('Save meal');
    expect(await screen.findByTestId('day-title')).toBeOnTheScreen();

    // Hand calculation: 150 g of 165/31/0/3.6 + 200 g of 130/2.69/28.17/0.28 per 100 g.
    const day = await h.repos.meals.getDay(TODAY);
    expect(day.meals).toHaveLength(1);
    expect(day.meals[0]).toMatchObject({ slot: 'lunch', source: 'manual' });
    expect(day.meals[0]!.items.map((i) => [i.grams, i.foodSource, i.origin])).toEqual([
      [150, 'catalog', 'manual'],
      [200, 'catalog', 'manual'],
    ]);
    expect(day.totals.kcal).toBeCloseTo(507.5, 6);
    expect(day.totals.protein).toBeCloseTo(51.88, 6);
    expect(day.totals.carbs).toBeCloseTo(56.34, 6);
    expect(day.totals.fat).toBeCloseTo(5.96, 6);

    // The meal is on Today with its slot, time and calories.
    expect(await screen.findByText('Lunch · 12:00')).toBeOnTheScreen();
    expect(screen.getByText('1 meal')).toBeOnTheScreen();
  });

  it('records the food as a recent one', async () => {
    await open();
    await fireEvent.press(await addFood('chicken', /grilled/, '150'));
    await screen.findByRole('header', { name: 'Review your meal' });
    await press('Save meal');
    await screen.findByTestId('day-title');
    const recents = await h.repos.foodUsage.recents(5);
    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({ foodSource: 'catalog', lastGrams: 150, useCount: 1 });
  });

  it('changes grams with the steppers and by typing, with totals following', async () => {
    await open();
    await fireEvent.press(await addFood('chicken', /grilled/, '150'));
    await screen.findByRole('header', { name: 'Review your meal' });
    const name = 'Chicken, breast, meat only, cooked, grilled';

    await press(`Increase ${name}`);
    expect(screen.getByLabelText(`Grams of ${name}`)).toHaveDisplayValue('160');
    expect(screen.getByLabelText(/^264 kilocalories/)).toBeOnTheScreen();
    await press(`Decrease ${name}`);
    await press(`Decrease ${name}`);
    expect(screen.getByLabelText(`Grams of ${name}`)).toHaveDisplayValue('140');

    await type(`Grams of ${name}`, '200');
    expect(screen.getByLabelText(/^330 kilocalories/)).toBeOnTheScreen();

    // An impossible value is flagged and never saved.
    await type(`Grams of ${name}`, '0');
    await fireEvent(screen.getByLabelText(`Grams of ${name}`), 'blur');
    expect(screen.getByText('Enter grams from 1 to 5,000.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
  });

  it('removes an item with undo, and cannot save an empty meal', async () => {
    await open();
    await fireEvent.press(await addFood('chicken', /grilled/, '150'));
    await screen.findByRole('header', { name: 'Review your meal' });
    const name = 'Chicken, breast, meat only, cooked, grilled';

    await press(`Remove ${name}`);
    expect(screen.getByText(`${name} removed`)).toBeOnTheScreen();
    expect(screen.getByText('No items left. Add a food to save this meal.')).toBeOnTheScreen();
    expect(screen.getByText('Add at least one item to save.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();

    await press('Undo');
    expect(screen.getByLabelText(`Grams of ${name}`)).toHaveDisplayValue('150');
    expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled();
  });

  it('keeps the items and says so when saving fails', async () => {
    await open();
    await fireEvent.press(await addFood('chicken', /grilled/, '150'));
    await screen.findByRole('header', { name: 'Review your meal' });
    jest.spyOn(h.repos.meals, 'save').mockRejectedValueOnce(new Error('disk full'));

    await press('Save meal');
    expect(await screen.findByText('The meal could not be saved. Your items are still here. Try again.')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Grams of Chicken/)).toHaveDisplayValue('150');
    expect((await h.repos.meals.getDay(TODAY)).meals).toHaveLength(0);

    await press('Save meal');
    await screen.findByTestId('day-title');
    expect((await h.repos.meals.getDay(TODAY)).meals).toHaveLength(1);
  });
});

describe('meal slot from the time of day', () => {
  it.each([
    [7, 'breakfast'],
    [12, 'lunch'],
    [16, 'snack'],
    [20, 'dinner'],
    [23, 'snack'],
    [3, 'snack'],
  ] as const)('%d:00 is %s', (hour, slot) => {
    expect(pickSlot(new Date(2026, 10, 21, hour, 0))).toBe(slot);
  });

  it('preselects it on the review screen', async () => {
    now = new Date(2026, 10, 21, 8, 0);
    await open();
    await fireEvent.press(await addFood('chicken', /grilled/, '100'));
    await screen.findByRole('header', { name: 'Review your meal' });
    expect(screen.getByRole('radio', { name: 'Breakfast' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Dinner' }));
    await press('Save meal');
    await screen.findByTestId('day-title');
    expect((await h.repos.meals.getDay(TODAY)).meals[0]!.slot).toBe('dinner');
  });
});

describe('custom food (FR-32)', () => {
  it('is created from the no-results state and can be logged', async () => {
    await open();
    await search('protein bar');
    await fireEvent.press(await screen.findByRole('button', { name: 'Create custom food' }));

    // The search text is carried over as the name; the entered values stay on error.
    expect(await screen.findByLabelText('Name')).toHaveDisplayValue('protein bar');
    await type('Calories per 100 g (kcal)', '400');
    await type('Protein per 100 g (g)', '30');
    await press('Save food');
    expect(await screen.findAllByText('Enter a number, like 12.5.')).toHaveLength(2);
    expect(screen.getByLabelText('Calories per 100 g (kcal)')).toHaveDisplayValue('400');
    expect(await h.repos.customFoods.list()).toHaveLength(0);

    await type('Carbs per 100 g (g)', '40');
    await type('Fat per 100 g (g)', '10');
    await press('Save food');

    await waitFor(async () => expect(await h.repos.customFoods.list()).toHaveLength(1));
    const [food] = await h.repos.customFoods.list();
    expect(food).toMatchObject({ name: 'protein bar', kcal100g: 400, protein100g: 30, carbs100g: 40, fat100g: 10 });

    // Back in search, the custom food is found, tagged, and logged with grams.
    await search('protein bar');
    await fireEvent.press(await foodRow(/^protein bar, 400 kilocalories per 100 grams$/));
    await fireEvent.changeText(await screen.findByLabelText('Amount in grams'), '50');
    await press('Add to meal');
    await screen.findByRole('header', { name: 'Review your meal' });
    await press('Save meal');
    await screen.findByTestId('day-title');

    const day = await h.repos.meals.getDay(TODAY);
    expect(day.meals[0]!.items[0]).toMatchObject({ foodSource: 'custom', foodRef: food!.id, grams: 50, kcal: 200, proteinG: 15, carbsG: 20, fatG: 5 });
    expect(day.totals.kcal).toBe(200);
  });

  it('rejects a blank name and negative values with specific messages', async () => {
    await open(<Flow start="custom" />);
    await type('Name', '   ');
    await type('Calories per 100 g (kcal)', '-5');
    await press('Save food');
    expect(await screen.findByText('Enter a name.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a number from 0 to 1,000.', { exact: false })).toBeOnTheScreen();
    expect(await h.repos.customFoods.list()).toHaveLength(0);
  });
});

describe('numbers the review shows', () => {
  it('matches computeItemNutrients, the function the repository snapshot uses', async () => {
    const detail = await services.catalog.getFood((await services.catalog.search('banana', 'en', 1))[0]!.ref as FoodRef);
    const expected = computeItemNutrients(detail, 118);
    await open();
    await search('banana');
    await fireEvent.press(await foodRow(/^Bananas, raw/));
    await fireEvent.press(await screen.findByRole('button', { name: /^1 medium .*, 118 grams$/ }));
    await press('Add to meal');
    await screen.findByRole('header', { name: 'Review your meal' });
    await press('Save meal');
    await screen.findByTestId('day-title');
    const item = (await h.repos.meals.getDay(TODAY)).meals[0]!.items[0]!;
    expect(item.kcal).toBeCloseTo(expected.kcal!, 9);
    expect(item.nutrients.fiber).toBeCloseTo(expected.fiber!, 9);
  });
});
