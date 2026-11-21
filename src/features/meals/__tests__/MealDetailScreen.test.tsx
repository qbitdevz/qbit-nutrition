import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { FoodRef } from '@/core/catalog';
import { computeItemNutrients } from '@/core/nutrition';
import type { SaveMealInput } from '@/data';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { TodayScreen } from '../../today/TodayScreen';
import { MealDetailScreen } from '../MealDetailScreen';

// Saturday 21 Nov 2026, 19:40. The meals below are on Friday 20 Nov: a past day (S7).
const NOW = new Date(2026, 10, 21, 19, 40);
const clock = () => new Date(NOW);
const YESTERDAY = '2026-11-20';

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
  jest.restoreAllMocks();
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

async function item(query: string, grams: number): Promise<SaveMealInput['items'][number]> {
  const [found] = await services.catalog.search(query, 'en', 1);
  const food = await services.catalog.getFood(found!.ref as FoodRef);
  return { displayName: found!.name, grams, foodSource: 'catalog', foodRef: found!.ref.id, origin: 'manual', nutrients: computeItemNutrients(food, grams) };
}

const CHICKEN = 'Chicken, breast, meat only, cooked, grilled';
const RICE = 'Rice, white, long-grain, regular, cooked';

/** Friday lunch: 150 g chicken (247.5 kcal) and 200 g rice (260 kcal). */
async function seedLunch() {
  return h.repos.meals.save({
    eatenAt: new Date(2026, 10, 20, 13, 10),
    slot: 'lunch',
    source: 'manual',
    items: [await item('grilled chicken', 150), await item('rice white cooked', 200)],
  });
}

const open = (mealId: string, extra: Partial<Parameters<typeof MealDetailScreen>[0]> = {}) =>
  renderApp(<MealDetailScreen mealId={mealId} now={clock} onClose={jest.fn()} onCopied={jest.fn()} {...extra} />, { services });

describe('meal detail (S7)', () => {
  it('shows the meal, its items and its nutrients for a past day', async () => {
    const meal = await seedLunch();
    await open(meal.id);
    expect(await screen.findByText(CHICKEN)).toBeOnTheScreen();
    expect(screen.getByText(RICE)).toBeOnTheScreen();
    expect(screen.getByText(/Lunch · 13:10/)).toBeOnTheScreen();
    // FR-42: energy, macros and the nutrient list, with "not reported" instead of a false zero.
    expect(screen.getByLabelText('Energy, 508 kcal')).toBeOnTheScreen();
    expect(screen.getByLabelText('Protein, 51.9 g')).toBeOnTheScreen();
    expect(screen.getByLabelText('Calcium, Not reported')).toBeOnTheScreen();
  });

  it('lists fiber, sugars, saturated fat, sodium and the micronutrients', async () => {
    const meal = await h.repos.meals.save({ eatenAt: new Date(2026, 10, 20, 8, 0), slot: 'breakfast', source: 'manual', items: [await item('banana', 118)] });
    await open(meal.id);
    expect(await screen.findByLabelText('Fiber, 3.1 g')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sodium, 1.2 mg')).toBeOnTheScreen();
    for (const name of ['Sugars', 'Saturated fat', 'Potassium', 'Iron', 'Magnesium', 'Zinc', 'Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin B12', 'Folate']) {
      expect(screen.getByLabelText(new RegExp(`^${name}, `))).toBeOnTheScreen();
    }
  });

  it('flags a nutrient that only some items report', async () => {
    const meal = await h.repos.meals.save({
      eatenAt: new Date(2026, 10, 20, 8, 0),
      slot: 'breakfast',
      source: 'manual',
      items: [await item('banana', 100), await item('rice white cooked', 100)],
    });
    await open(meal.id);
    expect(await screen.findByLabelText('Fiber, 2.6 g, Some items do not report this')).toBeOnTheScreen();
  });

  it("edits an item's grams with the stepper and by typing, and the day's totals follow", async () => {
    const meal = await seedLunch();
    await open(meal.id);
    await screen.findByText(CHICKEN);

    await press(`Increase ${CHICKEN}`);
    await waitFor(async () => expect((await h.repos.meals.getDay(YESTERDAY)).totals.kcal).toBeCloseTo(264 + 260, 6));
    expect(screen.getByLabelText(`Grams of ${CHICKEN}`)).toHaveDisplayValue('160');

    const input = screen.getByLabelText(`Grams of ${CHICKEN}`);
    await fireEvent.changeText(input, '100');
    await fireEvent(input, 'submitEditing');
    await waitFor(async () => expect((await h.repos.meals.getDay(YESTERDAY)).totals.kcal).toBeCloseTo(165 + 260, 6));
    const day = await h.repos.meals.getDay(YESTERDAY);
    expect(day.totals.protein).toBeCloseTo(31 + 5.38, 6);
    expect(await screen.findByLabelText('Energy, 425 kcal')).toBeOnTheScreen();
  });

  it('refuses an impossible amount instead of saving it', async () => {
    const meal = await seedLunch();
    await open(meal.id);
    await screen.findByText(CHICKEN);
    const input = screen.getByLabelText(`Grams of ${CHICKEN}`);
    await fireEvent.changeText(input, '0');
    await fireEvent(input, 'submitEditing');
    expect(await screen.findByText('Enter grams from 1 to 5,000.')).toBeOnTheScreen();
    expect((await h.repos.meals.getDay(YESTERDAY)).totals.kcal).toBeCloseTo(507.5, 6);
  });

  it('deletes one item after confirmation and changes the totals', async () => {
    const meal = await seedLunch();
    await open(meal.id);
    await screen.findByText(CHICKEN);

    await press(`Delete ${CHICKEN}`);
    expect(await screen.findByText('Delete this item?')).toBeOnTheScreen();
    // Keeping it changes nothing.
    await press('Keep it');
    await waitFor(() => expect(screen.queryByText('Delete this item?')).toBeNull());
    expect((await h.repos.meals.getDay(YESTERDAY)).meals[0]!.items).toHaveLength(2);

    await press(`Delete ${CHICKEN}`);
    await press('Delete item');
    await waitFor(async () => expect((await h.repos.meals.getDay(YESTERDAY)).meals[0]!.items).toHaveLength(1));
    const day = await h.repos.meals.getDay(YESTERDAY);
    expect(day.totals.kcal).toBeCloseTo(260, 6);
    await waitFor(() => expect(screen.queryByText(CHICKEN)).toBeNull());
  });

  it('deletes the whole meal after confirmation, with undo', async () => {
    const meal = await seedLunch();
    const onClose = jest.fn();
    await open(meal.id, { onClose });
    await screen.findByText(CHICKEN);

    await press('Delete meal');
    expect(await screen.findByText('Delete this meal?')).toBeOnTheScreen();
    await press('Keep it');
    await waitFor(() => expect(screen.queryByText('Delete this meal?')).toBeNull());
    expect((await h.repos.meals.getDay(YESTERDAY)).meals).toHaveLength(1);

    await press('Delete meal');
    // The row button and the confirmation button share a name: the confirmation is the last one.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete meal' }).at(-1)!);
    await waitFor(async () => expect((await h.repos.meals.getDay(YESTERDAY)).meals).toHaveLength(0));
    expect((await h.repos.meals.getDay(YESTERDAY)).totals.kcal).toBe(0);
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText('Meal deleted')).toBeOnTheScreen();

    await press('Undo');
    await waitFor(async () => expect((await h.repos.meals.getDay(YESTERDAY)).meals).toHaveLength(1));
    const day = await h.repos.meals.getDay(YESTERDAY);
    expect(day.totals.kcal).toBeCloseTo(507.5, 6);
    expect(day.meals[0]).toMatchObject({ slot: 'lunch' });
    expect(day.meals[0]!.items.map((i) => i.grams)).toEqual([150, 200]);
  });

  it('deleting the only item deletes the meal', async () => {
    const meal = await h.repos.meals.save({ eatenAt: new Date(2026, 10, 20, 8, 0), slot: 'breakfast', source: 'manual', items: [await item('banana', 118)] });
    await open(meal.id);
    await screen.findAllByText('Bananas, raw');
    await press('Delete Bananas, raw');
    expect(await screen.findByText('This is the only item, so the meal is deleted too.')).toBeOnTheScreen();
    await press('Delete item');
    await waitFor(async () => expect((await h.repos.meals.getDay(YESTERDAY)).meals).toHaveLength(0));
  });

  it('changes the meal type', async () => {
    const meal = await seedLunch();
    await open(meal.id);
    await screen.findByText(CHICKEN);
    await fireEvent.press(screen.getByRole('radio', { name: 'Dinner' }));
    await waitFor(async () => expect((await h.repos.meals.getMeal(meal.id))?.slot).toBe('dinner'));
  });

  it('copies a past meal to today with the same items and totals', async () => {
    const meal = await seedLunch();
    const onCopied = jest.fn();
    await open(meal.id, { onCopied });
    await screen.findByText(CHICKEN);

    await press('Copy to today');
    await waitFor(() => expect(onCopied).toHaveBeenCalled());
    const today = await h.repos.meals.getDay('2026-11-21');
    expect(today.meals).toHaveLength(1);
    expect(today.meals[0]).toMatchObject({ slot: 'lunch', source: 'copy' });
    expect(today.totals.kcal).toBeCloseTo(507.5, 6);
    expect(today.meals[0]!.items.map((i) => [i.displayName, i.grams])).toEqual([
      [CHICKEN, 150],
      [RICE, 200],
    ]);
    // The original is untouched.
    expect((await h.repos.meals.getDay(YESTERDAY)).totals.kcal).toBeCloseTo(507.5, 6);

    // Undo removes the copy only.
    await press('Undo');
    await waitFor(async () => expect((await h.repos.meals.getDay('2026-11-21')).meals).toHaveLength(0));
    expect((await h.repos.meals.getDay(YESTERDAY)).meals).toHaveLength(1);
  });

  it('says so when the meal does not exist, and when it cannot be read', async () => {
    await open('missing-id');
    expect(await screen.findByText('This meal no longer exists.')).toBeOnTheScreen();

    await cleanup();
    const meal = await seedLunch();
    jest.spyOn(h.repos.meals, 'getMeal').mockRejectedValueOnce(new Error('boom'));
    await open(meal.id);
    expect(await screen.findByText(/The meal could not be loaded/)).toBeOnTheScreen();
    await press('Try again');
    expect(await screen.findByText(CHICKEN)).toBeOnTheScreen();
  });
});

describe('Today opens meals and the goal setup', () => {
  const today = (props: Partial<Parameters<typeof TodayScreen>[0]> = {}) => (
    <TodayScreen now={clock} onOpenSettings={jest.fn()} onOpenMeal={jest.fn()} onSetupTargets={jest.fn()} {...props} />
  );

  it('opens the meal behind a row on a past day', async () => {
    const meal = await seedLunch();
    const onOpenMeal = jest.fn();
    await renderApp(today({ onOpenMeal }), { services });
    await screen.findByTestId('day-title');
    await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    await fireEvent.press(await screen.findByRole('button', { name: /Lunch at 13:10, 508 kilocalories$/ }));
    expect(onOpenMeal).toHaveBeenCalledWith(meal.id);
  });

  it('gives the no-targets notice an action that leads to the goal setup', async () => {
    const onSetupTargets = jest.fn();
    await renderApp(today({ onSetupTargets }), { services });
    expect(await screen.findByText(/No daily targets are set yet/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Set up targets' }));
    expect(onSetupTargets).toHaveBeenCalledTimes(1);
  });

  it('shows the totals of a past day, and the day again after its meal is deleted', async () => {
    const meal = await seedLunch();
    await renderApp(today(), { services });
    await screen.findByTestId('day-title');
    await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    expect(await screen.findByLabelText('508 kilocalories eaten. No calorie target is set.')).toBeOnTheScreen();

    await h.repos.meals.deleteMeal(meal.id);
    await fireEvent.press(screen.getByRole('button', { name: 'Next day' }));
    await screen.findByTestId('day-title');
    await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    expect(await screen.findByText('Nothing logged on this day')).toBeOnTheScreen();
  });
});
