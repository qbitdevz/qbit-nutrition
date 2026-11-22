import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { DataPlatformProvider } from '../../data/DataPlatformContext';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { ImportTableScreen } from '../ImportTableScreen';
import { utf8 } from '../testing/synthetic';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let platform: FakeDataPlatform;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
  platform = createFakeDataPlatform();
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
});

/** SYNTHETIC tables in the layout of a published one that comes in several files (invented foods and numbers). */
const argenCsv = (group: string, foods: string[]) =>
  [`${group};;;;;`, 'Por 100 g de porción comestible;;;;;', 'Nº;Alimento;Género - especie - variedad;Energía (Kcal);Proteínas (g);Sodio (mg)', ';;;<ENERC>;<PROTCNT>;<NA>', ';;;2*1;3*1;13*1', ...foods.map((f, i) => `${i + 1};${f};;${100 + i};${i + 1},5;${10 + i}`)].join('\n');
const CEREALES = argenCsv('CEREALES INVENTADOS', ['Arroz inventado', 'Avena ficticia', 'Trigo de ejemplo']);
const FRUTAS = argenCsv('FRUTAS INVENTADAS', ['Manzana inventada', 'Pera ficticia']);
const ACIDOS = 'Alimento;C18:2 (g);C18:3 (g)\nAceite inventado;50;1\nManteca ficticia;2;0\n';
const SUELTA = 'Alimento;Energía (kcal);Proteínas (g)\nGalleta inventada;430;6\n'; // no basis stated: asks to confirm

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const open = (locale: 'en' | 'es' = 'en') => renderApp(<DataPlatformProvider platform={platform}><ImportTableScreen onClose={() => undefined} /></DataPlatformProvider>, { services, locale });
const pickMany = (...files: [string, string | Uint8Array][]) => {
  platform.state.nextPicks = files.map(([name, content]) => ({ name, bytes: typeof content === 'string' ? utf8(content) : content }));
};
const choose = async () => fireEvent.press(screen.getByTestId('choose-file'));

describe('several files in one go (B2)', () => {
  it('shows one combined preview: per-file counts, a file with nothing usable listed as such, a file that cannot be read with its reason', async () => {
    await open();
    pickMany(['cereales.csv', CEREALES], ['frutas.csv', FRUTAS], ['acidos grasos.csv', ACIDOS], ['tabla.pdf', '%PDF-1.7']);
    await choose();
    expect(await screen.findByText('4 files chosen')).toBeTruthy();
    const summary = screen.getByTestId('batch-summary');
    expect(within(summary).getByText('2 ready to import')).toBeTruthy();
    expect(within(summary).getByText('1 with nothing the app can use')).toBeTruthy();
    expect(within(summary).getByText('1 that cannot be imported as it is')).toBeTruthy();
    expect(within(screen.getByTestId('file-0')).getByText('3 foods · 3 nutrients')).toBeTruthy();
    expect(within(screen.getByTestId('file-1')).getByText('2 foods · 3 nutrients')).toBeTruthy();
    expect(within(screen.getByTestId('file-0')).getByText('ARGENFOODS format recognised: 3 nutrients, values per 100 g')).toBeTruthy();
    // Nothing usable is not an error: it is said calmly, with no way to import it.
    expect(within(screen.getByTestId('file-2')).getByText(/Nothing the app can use: no column of a nutrient it tracks\. This is not an error\./)).toBeTruthy();
    expect(within(screen.getByTestId('file-2')).queryByTestId('include-2')).toBeNull();
    expect(within(screen.getByTestId('file-3')).getByText(/cannot be read|This kind of file cannot be read/)).toBeTruthy();
    expect([...platform.state.cache.keys()]).toEqual([]);
  });

  it('files of the same recognised table are offered as one collection, imported as one, and the summary says exactly what happened', async () => {
    await open();
    pickMany(['cereales.csv', CEREALES], ['frutas.csv', FRUTAS], ['acidos grasos.csv', ACIDOS]);
    await choose();
    const group = await screen.findByTestId('group-argenfoods');
    expect(within(group).getByText('2 files are parts of one table: ARGENFOODS')).toBeTruthy();
    expect(within(group).getByText(/Removing it later removes all the files at once/)).toBeTruthy();
    expect(screen.getByTestId('table-name').props.value).toBe('ARGENFOODS');
    expect(screen.getByRole('button', { name: 'Import 5 foods' })).toBeTruthy(); // one table
    await fireEvent.press(screen.getByTestId('confirm-import'));
    const done = await screen.findByTestId('import-done');
    expect(within(done).getByText('1 table was imported, with 5 foods.')).toBeTruthy();
    expect(within(done).getByText('“ARGENFOODS”: 5 foods')).toBeTruthy();
    const left = screen.getByTestId('import-not-imported');
    expect(within(left).getByText('acidos grasos.csv: nothing the app can use.')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
  });

  it('can be imported as one table per file instead', async () => {
    await open();
    pickMany(['cereales.csv', CEREALES], ['frutas.csv', FRUTAS]);
    await choose();
    await fireEvent.press(await screen.findByRole('radio', { name: 'One table per file' }));
    expect(screen.queryByTestId('table-name')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Import 2 tables' }));
    const done = await screen.findByTestId('import-done');
    expect(within(done).getByText('2 tables were imported, with 5 foods.')).toBeTruthy();
    expect((await h.repos.importedFoods.listCollections()).map((c) => c.name).sort()).toEqual(['ARGENFOODS · Cereales inventados', 'ARGENFOODS · Frutas inventadas']);
  });

  it('lets the person deselect a file, and imports only the others', async () => {
    await open();
    pickMany(['cereales.csv', CEREALES], ['suelta.csv', SUELTA]);
    await choose();
    await screen.findByTestId('file-1');
    await fireEvent.press(screen.getByTestId('include-1')); // leave the second one out
    await fireEvent.press(screen.getByTestId('confirm-import'));
    const done = await screen.findByTestId('import-done');
    expect(within(done).getByText('1 table was imported, with 3 foods.')).toBeTruthy();
    expect(within(screen.getByTestId('import-not-imported')).getByText('suelta.csv: left out by you.')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
  });

  it('a file that is not confident waits for its confirmation; the others are not held back once it is left out', async () => {
    await open();
    pickMany(['cereales.csv', CEREALES], ['suelta.csv', SUELTA]);
    await choose();
    const card = await screen.findByTestId('confirm-1');
    expect(within(card).getByText('The file does not say what the values are per. They are taken as per 100 g.')).toBeTruthy();
    expect(screen.getByTestId('confirm-import').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('Confirm the points above, or leave those files out.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-1-basis_assumed'));
    await waitFor(() => expect(screen.getByTestId('confirm-import').props.accessibilityState?.disabled).toBeFalsy());
    await fireEvent.press(screen.getByTestId('confirm-import'));
    expect(await screen.findByTestId('import-done')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(2);
  });

  it('one file that fails to save does not undo the others and is named in the summary; retrying only tries that one', async () => {
    await open();
    pickMany(['cereales.csv', CEREALES], ['frutas.csv', FRUTAS]);
    await choose();
    await fireEvent.press(await screen.findByRole('radio', { name: 'One table per file' }));
    const real = h.repos.importedFoods.importCollection.bind(h.repos.importedFoods);
    let failFruit = true;
    jest.spyOn(h.repos.importedFoods, 'importCollection').mockImplementation(async (input, foods) => {
      if (failFruit && input.fileName === 'frutas.csv') throw new Error('disk full');
      return real(input, foods);
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Import 2 tables' }));
    const failed = await screen.findByTestId('import-failed');
    expect(within(failed).getByText('“ARGENFOODS · Frutas inventadas” could not be saved. Nothing of it was written.')).toBeTruthy();
    expect(within(screen.getByTestId('import-done')).getByText('“ARGENFOODS · Cereales inventados”: 3 foods')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
    failFruit = false;
    await fireEvent.press(screen.getByTestId('retry-failed'));
    await waitFor(async () => expect(await h.repos.importedFoods.listCollections()).toHaveLength(2));
  });
});

describe('a table that is already here (B1)', () => {
  const importFirst = async () => {
    await open();
    pickMany(['cereales.csv', CEREALES]);
    await choose();
    await fireEvent.press(await screen.findByTestId('confirm-import'));
    await screen.findByTestId('import-done');
    await cleanup();
  };

  it('importing the same file again shows the choice and does nothing until it is made', async () => {
    await importFirst();
    await open();
    pickMany(['cereales.csv', CEREALES]);
    await choose();
    const card = await screen.findByTestId('duplicate-0');
    expect(within(card).getByText('Already here')).toBeTruthy();
    expect(within(card).getByText(/This table is already here as “ARGENFOODS · Cereales inventados” \(3 foods, imported/)).toBeTruthy();
    for (const name of ['Replace it', 'Keep both', 'Do not import']) expect(within(card).getByRole('radio', { name })).toBeTruthy();
    expect(screen.getByTestId('confirm-import').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('Choose what to do with the tables that are already here.')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
  });

  it('"Replace it" leaves exactly one table, with logged meals untouched', async () => {
    await importFirst();
    const [rice] = await h.repos.importedFoods.search('arroz', 1);
    await h.repos.meals.save({ eatenAt: new Date('2026-06-15T18:30:00.000Z'), timeZone: 'UTC', slot: 'dinner', source: 'manual', items: [{ displayName: rice!.name, grams: 200, foodSource: 'custom', foodRef: rice!.id, origin: 'manual', nutrients: { kcal: 200 } }] });
    const totals = await h.repos.meals.dayTotals('2026-06-15');
    await open();
    pickMany(['cereales.csv', CEREALES]);
    await choose();
    await fireEvent.press(await screen.findByRole('radio', { name: 'Replace it' }));
    expect(await screen.findByText(/Replacing removes the old table with its favorites, recents and learned matches/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-import'));
    const done = await screen.findByTestId('import-done');
    expect(within(done).getByText('It replaced 1 table that was already here.')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
    expect(await h.repos.meals.dayTotals('2026-06-15')).toEqual(totals);
  });

  it('"Keep both" is explicit and makes two; "Do not import" makes none', async () => {
    await importFirst();
    await open();
    pickMany(['cereales.csv', CEREALES]);
    await choose();
    await fireEvent.press(await screen.findByRole('radio', { name: 'Do not import' }));
    expect(screen.getByRole('button', { name: /Import/ }).props.accessibilityState?.disabled).toBe(true); // nothing left to import
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
    await fireEvent.press(screen.getByRole('radio', { name: 'Keep both' }));
    expect(await screen.findByText(/Both will be in food search/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-import'));
    await screen.findByTestId('import-done');
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(2);
  });
});

describe('in Spanish (B5)', () => {
  it('the batch, the duplicate choice and the summary are all translated', async () => {
    await open('es');
    pickMany(['cereales.csv', CEREALES], ['frutas.csv', FRUTAS], ['acidos.csv', ACIDOS]);
    await choose();
    expect(await screen.findByText('3 archivos elegidos')).toBeTruthy();
    expect(screen.getAllByText('Formato ARGENFOODS reconocido: 3 nutrientes, valores por 100 g')).toHaveLength(2);
    expect(screen.getByText('2 archivos son partes de una misma tabla: ARGENFOODS')).toBeTruthy();
    expect(screen.getByText(/Nada que la aplicación pueda usar/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-import'));
    expect(await screen.findByText('Se importó 1 tabla, con 5 alimentos.')).toBeTruthy();
    expect(screen.getByText('acidos.csv: nada que la aplicación pueda usar.')).toBeTruthy();
  });
});

void press;
