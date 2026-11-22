import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { DataPlatformProvider } from '../../data/DataPlatformContext';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { ImportTableScreen } from '../ImportTableScreen';
import { ImportedTablesScreen } from '../ImportedTablesScreen';
import { READ_LIMITS } from '../readFile';
import { SPANISH_CSV, makeWorkbook, utf8 } from '../testing/synthetic';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let platform: FakeDataPlatform;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
  platform = createFakeDataPlatform();
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

const withPlatform = (ui: React.ReactElement) => <DataPlatformProvider platform={platform}>{ui}</DataPlatformProvider>;

async function openList(locale: 'en' | 'es' = 'en', props: Partial<Parameters<typeof ImportedTablesScreen>[0]> = {}) {
  return renderApp(withPlatform(<ImportedTablesScreen onAdd={() => undefined} {...props} />), { services, locale });
}
async function openImport(locale: 'en' | 'es' = 'en', props: Partial<Parameters<typeof ImportTableScreen>[0]> = {}) {
  return renderApp(withPlatform(<ImportTableScreen onClose={() => undefined} {...props} />), { services, locale });
}

describe('Imported tables list', () => {
  it('shows the loading state, then the empty state with the one action that fills it', async () => {
    const onAdd = jest.fn();
    let release: (tables: never[]) => void = () => undefined;
    jest.spyOn(h.repos.importedFoods, 'listCollections').mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    await openList('en', { onAdd });
    expect(screen.getByTestId('tables-loading')).toBeTruthy();
    release([]);
    expect(await screen.findByText('No tables yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('add-table'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('shows an error with a retry when the tables cannot be read, and nothing is lost', async () => {
    const failing = jest.spyOn(h.repos.importedFoods, 'listCollections').mockRejectedValueOnce(new Error('db'));
    await openList();
    expect(await screen.findByText(/could not be read/)).toBeTruthy();
    await press('Try again');
    expect(await screen.findByText('No tables yet')).toBeTruthy();
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('lists each table with its count, file, date and flags, in both languages', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Mi tabla', fileName: 'tabla.csv', basis: 'ml' }, [
      { name: 'A', per100g: { kcal: 1 } },
      { name: 'B', per100g: { kcal: 2 } },
    ]);
    await openList();
    const card = await screen.findByTestId('table-Mi tabla');
    expect(within(card).getByText('2 foods')).toBeTruthy();
    expect(within(card).getByText(/From tabla\.csv/)).toBeTruthy();
    expect(within(card).getByText(/Values per 100 ml/)).toBeTruthy();
    await cleanup();
    await openList('es');
    expect(within(await screen.findByTestId('table-Mi tabla')).getByText('2 alimentos')).toBeTruthy();
  });

  it('renames a table, and refuses an empty name without closing the sheet', async () => {
    const created = await h.repos.importedFoods.importCollection({ name: 'Vieja' }, [{ name: 'A', per100g: { kcal: 1 } }]);
    await openList();
    await screen.findByTestId('table-Vieja');
    await press('Rename');
    await fireEvent.changeText(await screen.findByTestId('rename-field'), '   ');
    await fireEvent.press(screen.getByTestId('rename-save'));
    expect(await screen.findByText('The name cannot be empty.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('rename-field'), 'Nueva');
    await fireEvent.press(screen.getByTestId('rename-save'));
    expect(await screen.findByTestId('table-Nueva')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toEqual([{ ...created, name: 'Nueva' }]);
  });

  it('asks before removing, naming how many foods go, and removing leaves logged meals alone', async () => {
    const created = await h.repos.importedFoods.importCollection({ name: 'Mi tabla' }, [
      { name: 'Manzana inventada', per100g: { kcal: 52 } },
      { name: 'Pera inventada', per100g: { kcal: 57 } },
    ]);
    const [apple] = await h.repos.importedFoods.search('manzana', 1);
    await h.repos.meals.save({ eatenAt: new Date('2026-06-15T18:30:00.000Z'), timeZone: 'UTC', slot: 'dinner', source: 'manual', items: [{ displayName: apple!.name, grams: 100, foodSource: 'custom', foodRef: apple!.id, origin: 'manual', nutrients: { kcal: 52 } }] });
    const before = await h.repos.meals.getDay('2026-06-15');
    const onChanged = jest.fn();
    await openList('en', { onChanged });
    await screen.findByTestId('table-Mi tabla');

    await press('Remove');
    expect(await screen.findByText('Remove “Mi tabla”?')).toBeTruthy();
    expect(screen.getByText(/removes its 2 foods/)).toBeTruthy();
    await press('Keep it');
    await waitFor(() => expect(screen.queryByText('Remove “Mi tabla”?')).toBeNull());
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);

    await press('Remove');
    await press('Remove table');
    expect(await screen.findByText('No tables yet')).toBeTruthy();
    expect(await h.repos.importedFoods.getFood(apple!.id)).toBeNull();
    expect(await h.repos.meals.getDay('2026-06-15')).toEqual(before);
    expect(onChanged).toHaveBeenCalled();
    expect(created.id).toBeTruthy();
  });

  it('keeps the table and says so when removing fails', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Mi tabla' }, [{ name: 'A', per100g: { kcal: 1 } }]);
    jest.spyOn(h.repos.importedFoods, 'removeCollection').mockRejectedValueOnce(new Error('locked'));
    await openList();
    await screen.findByTestId('table-Mi tabla');
    await press('Remove');
    await press('Remove table');
    expect(await screen.findByText(/could not be removed/)).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
  });
});

describe('Adding a table', () => {
  const pick = (name: string, bytes: Uint8Array) => {
    platform.state.nextPick = { name, bytes };
  };
  /** A file that states its basis, units and names: the importer is confident, so nothing has to be confirmed. */
  const CLEAN = 'Alimento;Energía (kcal/100 g);Proteínas (g/100 g)\nA;1;2\n';
  /** What a person does when they want to look at the columns: from the batch, "Change columns". */
  const openColumns = async () => fireEvent.press(await screen.findByTestId('change-columns-0'));

  it('starts with the license notice, the formats and the size limit, before any file is chosen', async () => {
    await openImport();
    const notice = screen.getByTestId('license-notice');
    expect(within(notice).getByText(/Download the table yourself from its publisher/)).toBeTruthy();
    expect(within(notice).getByText(/do not share the file or a data export that contains it/)).toBeTruthy();
    expect(within(notice).getByText(/Files up to 25 MB/)).toBeTruthy();
    expect(within(notice).getByText(/pick several files at once/)).toBeTruthy();
    expect(platform.state.readCount).toBe(0);
  });

  it('goes from the file to the foods on the phone: what was found, the columns when asked for, the preview, import, done', async () => {
    const onImported = jest.fn();
    const onClose = jest.fn();
    await openImport('en', { onImported, onClose });
    pick('Mi tabla inventada.csv', utf8(`${SPANISH_CSV}\nAceite ficticio;Grasas;5000;0;0;100;0\n`));
    await fireEvent.press(screen.getByTestId('choose-file'));

    // The default path is honest: the table does not say what its values are per, so that is asked, and the import waits for the answer.
    expect(await screen.findByText('Confirm before importing')).toBeTruthy();
    expect(screen.getByText('The file does not say what the values are per. They are taken as per 100 g.')).toBeTruthy();
    expect(screen.getByTestId('confirm-import').props.accessibilityState?.disabled).toBe(true);

    // The columns are optional: here they are, as columns with units.
    await openColumns();
    expect(await screen.findByTestId('map-kcal')).toBeTruthy();
    expect(screen.getByTestId('map-kcal').props.accessibilityLabel).toMatch(/Column C · Energía \(kcal\) · kcal/);
    expect(screen.getByTestId('map-sodium').props.accessibilityLabel).toMatch(/Sodio \(mg\) · mg/);
    expect(screen.getByTestId('map-vit_a').props.accessibilityLabel).toMatch(/Not in this table/);
    expect(screen.getByTestId('rules')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('review-import'));
    // Preview: counts, the row left out and why, unknown values, the sample, the name. What the person saw on the columns screen is not asked again.
    expect(await screen.findByText('3 foods will be imported')).toBeTruthy();
    expect(screen.getByText('5 nutrients matched')).toBeTruthy();
    expect(screen.getByText(/1 with a value no food can have/)).toBeTruthy();
    expect(screen.getByText(/2 cells without a value are stored as unknown, not as zero/)).toBeTruthy();
    expect(within(screen.getByTestId('preview-sample')).getByText('Manzana inventada')).toBeTruthy();
    expect(screen.getByTestId('table-name').props.value).toBe('Mi tabla inventada');
    expect(screen.queryByText('Confirm before importing')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('table-name'), 'Tabla de prueba');
    await fireEvent.press(screen.getByTestId('confirm-import'));
    expect(await screen.findByTestId('import-done')).toBeTruthy();
    expect(screen.getByText('3 foods were added to “Tabla de prueba”.')).toBeTruthy();
    expect(screen.getByText('1 row was left out; the review listed why.')).toBeTruthy();
    expect(onImported).toHaveBeenCalled();
    expect((await h.repos.importedFoods.listCollections())[0]).toMatchObject({ name: 'Tabla de prueba', fileName: 'Mi tabla inventada.csv', foodCount: 3 });
    // The picker's copy is gone.
    expect([...platform.state.cache.keys()]).toEqual([]);
    await fireEvent.press(screen.getByTestId('import-finish'));
    expect(onClose).toHaveBeenCalled();
  });

  it('a table that states what it is imports without the columns screen: one line says what was recognised', async () => {
    await openImport();
    pick('limpia.csv', utf8(CLEAN));
    await fireEvent.press(screen.getByTestId('choose-file'));
    expect(await screen.findByText('Columns recognised from their headers: 2 nutrients, values per 100 g')).toBeTruthy();
    expect(screen.queryByText('Confirm before importing')).toBeNull();
    await fireEvent.press(screen.getByTestId('confirm-import'));
    expect(await screen.findByTestId('import-done')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
  });

  it('lets the person correct a column and its unit before importing', async () => {
    await openImport();
    pick('t.csv', utf8('Alimento;Energía;Notas\nA;1000;3\n'));
    await fireEvent.press(screen.getByTestId('choose-file'));
    // The unit of "Energía" is not stated: the batch says exactly that and asks, instead of importing on the assumption.
    expect(await screen.findByText(/The file does not state the unit of: Energy: kcal\./)).toBeTruthy();
    await openColumns();
    expect(await screen.findByTestId('map-kcal')).toBeTruthy();
    // "Energía" has no unit in the file: kcal is assumed, and the screen says so.
    expect(screen.getByTestId('map-kcal').props.accessibilityLabel).toMatch(/kcal \(Not stated: kcal assumed\)/);
    await fireEvent.press(screen.getByTestId('map-kcal'));
    await fireEvent.press(await screen.findByRole('radio', { name: 'kJ' }));
    await fireEvent.press(screen.getByTestId('column-done'));
    await fireEvent.press(screen.getByTestId('review-import'));
    expect(await screen.findByText('1 food will be imported')).toBeTruthy();
    const sample = screen.getByTestId('preview-sample');
    // 1000 kJ / 4.184 = 239.006 kcal, shown to three decimals.
    expect(within(sample).getByText(/Energy 239\.006 kcal/)).toBeTruthy();
  });

  it('blocks the review while the mapping cannot be imported, and says why', async () => {
    await openImport();
    pick('t.csv', utf8('Alimento;Energía (kcal)\nA;1\n'));
    await fireEvent.press(screen.getByTestId('choose-file'));
    await openColumns();
    await screen.findByTestId('map-kcal');
    await fireEvent.press(screen.getByRole('radio', { name: 'Something else' }));
    expect(screen.getAllByText(/cannot be imported/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('review-import').props.accessibilityState?.disabled).toBe(true);
  });

  it('a per 100 ml table is flagged, and asks to confirm that 100 ml is used as 100 g', async () => {
    await openImport();
    pick('t.csv', utf8('Bebida;Energía (kcal/100 ml)\nJugo inventado;45\n'));
    await fireEvent.press(screen.getByTestId('choose-file'));
    expect(await screen.findByText(/The values are per 100 ml\. The app counts what you eat in grams/)).toBeTruthy();
    expect(screen.getByText(/Per 100 ml: the foods will be flagged/)).toBeTruthy();
    await openColumns();
    await screen.findByTestId('map-kcal');
    expect(screen.getByText(/Per 100 ml is kept as written and flagged/)).toBeTruthy();
  });

  it('refuses an oversized file with the limit named, before reading it, and offers another', async () => {
    await openImport();
    pick('enorme.csv', new Uint8Array(READ_LIMITS.maxFileBytes + 1));
    await fireEvent.press(screen.getByTestId('choose-file'));
    expect(await screen.findByText('This file can’t be used')).toBeTruthy();
    expect(screen.getByText(/bigger than 25 MB/)).toBeTruthy();
    expect(screen.getByText('Nothing was imported.')).toBeTruthy();
    expect(platform.state.readCount).toBe(0);
    pick('t.csv', utf8(CLEAN));
    await fireEvent.press(screen.getByTestId('choose-another'));
    expect(await screen.findByTestId('change-columns-0')).toBeTruthy();
  });

  it('explains a PDF and a damaged workbook in plain words', async () => {
    await openImport();
    pick('tabla.pdf', utf8('%PDF-1.7'));
    await fireEvent.press(screen.getByTestId('choose-file'));
    expect(await screen.findByText(/look for the spreadsheet version/)).toBeTruthy();
    pick('roto.xlsx', makeWorkbook([{ name: 'S', rows: [['a'], [1]] }]).slice(0, 40));
    await fireEvent.press(screen.getByTestId('choose-another'));
    expect(await screen.findByText(/looks damaged/)).toBeTruthy();
  });

  it('stays on the first step when the picker is closed without a file', async () => {
    await openImport();
    platform.state.nextPick = null;
    await fireEvent.press(screen.getByTestId('choose-file'));
    await waitFor(() => expect(screen.getByTestId('choose-file')).toBeTruthy());
    expect(screen.queryByTestId('import-busy')).toBeNull();
  });

  it('keeps the work and says nothing was written when saving fails, then retries', async () => {
    await openImport();
    pick('t.csv', utf8(CLEAN));
    await fireEvent.press(screen.getByTestId('choose-file'));
    await screen.findByTestId('confirm-import');
    jest.spyOn(h.repos.importedFoods, 'importCollection').mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.press(screen.getByTestId('confirm-import'));
    expect(await screen.findByText('Nothing was imported')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toEqual([]);
    await fireEvent.press(screen.getByTestId('retry-save'));
    expect(await screen.findByTestId('import-done')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
  });

  it('asks for a name instead of saving with none', async () => {
    await openImport();
    pick('t.csv', utf8(CLEAN));
    await fireEvent.press(screen.getByTestId('choose-file'));
    await screen.findByTestId('confirm-import');
    await fireEvent.changeText(screen.getByTestId('table-name'), '  ');
    await fireEvent.press(screen.getByTestId('confirm-import'));
    expect(await screen.findByText('Give the table a name.')).toBeTruthy();
    expect(await h.repos.importedFoods.listCollections()).toEqual([]);
  });

  it('a table whose layout a preset recognises arrives filled in, named after it, says so in one line, and is listed as recognised', async () => {
    await openImport();
    const rows = [
      [null, 'GRUPO INVENTADO'],
      [null, 'Por 100 g de porción comestible'],
      ['Nº', 'Alimento', 'Género - especie - variedad', null, 'Energía (Kcal)', 'Proteínas (g)', 'Sodio (mg)'],
      [null, null, null, null, '<ENERC>', '<PROTCNT>', '<NA>'],
      [null, null, null, null, '2*1', '3*1', '13*1'],
      [1, 'Alimento inventado uno', null, null, 130, 7.25, '...'],
      [2, 'Alimento inventado dos', null, null, 90, 3, 12.5],
    ];
    pick('Hoja inventada.xls', makeWorkbook([{ name: 'Hoja1', rows }], 'xls'));
    await fireEvent.press(screen.getByTestId('choose-file'));
    expect(await screen.findByText('ARGENFOODS format recognised: 3 nutrients, values per 100 g')).toBeTruthy();
    expect(screen.queryByText('Confirm before importing')).toBeNull();
    expect(await screen.findByText('2 foods will be imported')).toBeTruthy();
    expect(screen.getByTestId('table-name').props.value).toBe('ARGENFOODS · Grupo inventado');
    await fireEvent.press(screen.getByTestId('confirm-import'));
    await screen.findByTestId('import-done');
    expect((await h.repos.importedFoods.listCollections())[0]).toMatchObject({ name: 'ARGENFOODS · Grupo inventado', presetId: 'argenfoods', foodCount: 2 });
    expect((await h.repos.importedFoods.search('inventado', 5)).find((f) => f.name === 'Alimento inventado uno')).toMatchObject({ group: 'Grupo inventado', per100g: { kcal: 130, protein: 7.25 } });
    await cleanup();
    await openList();
    expect(within(await screen.findByTestId('table-ARGENFOODS · Grupo inventado')).getByText(/Recognised as ARGENFOODS/)).toBeTruthy();
  });

  it('is fully in Spanish', async () => {
    await openImport('es');
    expect(screen.getByText(/Descarga la tabla por tu cuenta desde su editor/)).toBeTruthy();
    pick('t.csv', utf8(SPANISH_CSV));
    await fireEvent.press(screen.getByTestId('choose-file'));
    expect(await screen.findByText('Confirma antes de importar')).toBeTruthy();
    expect(screen.getByText('El archivo no dice por qué cantidad son los valores. Se toman como por 100 g.')).toBeTruthy();
    expect(screen.getByText('Se importarán 3 alimentos')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('change-columns-0'));
    expect(await screen.findByText('Relaciona las columnas')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('review-import'));
    expect(await screen.findByText('Revisa antes de importar')).toBeTruthy();
  });
});
