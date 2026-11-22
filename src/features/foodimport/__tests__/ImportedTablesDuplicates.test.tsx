import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { ImportedTablesScreen } from '../ImportedTablesScreen';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
});

const FOODS = [
  { name: 'Manzana inventada', per100g: { kcal: 52.5, protein: 0.3 } },
  { name: 'Pan de ejemplo', per100g: { kcal: 265, protein: 9 } },
];
const open = (locale: 'en' | 'es' = 'en') => renderApp(<ImportedTablesScreen onAdd={() => undefined} />, { services, locale });

/** The owner's phone: the same table imported three times before fingerprints existed, and one different table. */
async function ownersPhone() {
  const ids: string[] = [];
  for (const name of ['ARGENFOODS · Cereales', 'ARGENFOODS · Cereales ', 'ARGENFOODS · Cereales  ']) {
    ids.push((await h.repos.importedFoods.importCollection({ name: name.trim(), fileName: 'cereales.xls' }, FOODS)).id);
  }
  const other = await h.repos.importedFoods.importCollection({ name: 'Otra tabla' }, [{ name: 'Distinta', per100g: { kcal: 9 } }]);
  h.client.exec(`UPDATE food_collection SET content_hash = NULL`);
  return { ids, other };
}

describe('duplicates that already exist on the Imported tables screen (B1)', () => {
  it('finds them, groups the copies of one table, and says nothing about tables that are not repeated', async () => {
    await ownersPhone();
    await open();
    const card = await screen.findByTestId('duplicates-card');
    expect(within(card).getByText('1 table is repeated')).toBeTruthy();
    expect(within(card).getByText('3 copies · 2 foods each')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Remove 2 duplicates' })).toBeTruthy();
    expect(within(card).queryByText(/Otra tabla/)).toBeNull();
  });

  it('shows no card when nothing is repeated', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Única' }, FOODS);
    await open();
    await screen.findByTestId('table-Única');
    await waitFor(() => expect(screen.queryByText('Looking for duplicates…')).toBeNull());
    expect(screen.queryByTestId('duplicates-card')).toBeNull();
  });

  it('asks before removing, then leaves exactly one copy of the table and the other table untouched; meals keep their totals', async () => {
    const { ids, other } = await ownersPhone();
    const [apple] = await h.repos.importedFoods.search('manzana', 1);
    await h.repos.meals.save({ eatenAt: new Date('2026-06-15T18:30:00.000Z'), timeZone: 'UTC', slot: 'dinner', source: 'manual', items: [{ displayName: apple!.name, grams: 100, foodSource: 'custom', foodRef: apple!.id, origin: 'manual', nutrients: { kcal: 52.5 } }] });
    const day = await h.repos.meals.getDay('2026-06-15');
    const oldest = (await h.repos.importedFoods.listCollections()).find((c) => ids.includes(c.id))!.id;
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove 2 duplicates' }));
    expect(await screen.findByText('Remove the duplicates?')).toBeTruthy();
    expect(screen.getByText(/removes 2 tables \(4 foods\)/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep them' }));
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(4);

    await fireEvent.press(screen.getByRole('button', { name: 'Remove 2 duplicates' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove duplicates' }));
    await waitFor(async () => expect(await h.repos.importedFoods.listCollections()).toHaveLength(2));
    const left = (await h.repos.importedFoods.listCollections()).map((c) => c.id);
    expect(left).toEqual([oldest, other.id].sort((a, b) => left.indexOf(a) - left.indexOf(b))); // the oldest copy is kept by default
    expect(left).toContain(oldest);
    expect(left).toContain(other.id);
    expect(await screen.findByText('Removed 2 duplicates.')).toBeTruthy();
    expect(screen.queryByTestId('duplicates-card')).toBeNull();
    expect(await h.repos.meals.getDay('2026-06-15')).toEqual(day);
  });

  it('lets the person choose which copy stays', async () => {
    const { ids } = await ownersPhone();
    // The copies are listed oldest first (then by id): the third one listed is the one chosen here.
    const listed = (await h.repos.importedFoods.listCollections()).map((c) => c.id).filter((id) => ids.includes(id));
    await open();
    const card = await screen.findByTestId('duplicates-card');
    const copies = within(card).getAllByRole('radio');
    expect(copies).toHaveLength(3);
    await fireEvent.press(copies[2]!);
    await fireEvent.press(within(card).getByRole('button', { name: 'Remove 2 duplicates' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove duplicates' }));
    await waitFor(async () => expect((await h.repos.importedFoods.listCollections()).filter((c) => ids.includes(c.id))).toHaveLength(1));
    expect((await h.repos.importedFoods.listCollections()).filter((c) => ids.includes(c.id)).map((c) => c.id)).toEqual([listed[2]]);
  });

  it('says so and changes nothing when the removal fails', async () => {
    await ownersPhone();
    jest.spyOn(h.repos.importedFoods, 'removeCollections').mockRejectedValueOnce(new Error('locked'));
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove 2 duplicates' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove duplicates' }));
    expect(await screen.findByText('The duplicates could not be removed. Nothing was changed.')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(4);
  });

  it('is in Spanish too', async () => {
    await ownersPhone();
    await open('es');
    const card = await screen.findByTestId('duplicates-card');
    expect(within(card).getByText('1 tabla está repetida')).toBeTruthy();
    expect(within(card).getByText('3 copias · 2 alimentos cada una')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Quitar 2 duplicados' })).toBeTruthy();
  });
});
