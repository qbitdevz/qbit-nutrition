/** @jest-environment node */
import { buildPreview, buildPreviewAsync, type ImportMapping } from '../mapping';
import { detectBasis, suggestMapping } from '../headers';
import { readTableFile, type TableFile } from '../readFile';
import { SPANISH_CSV, makeWorkbook, utf8, type SyntheticCell } from '../testing/synthetic';

const fileOf = (rows: SyntheticCell[][], name = 'Hoja'): TableFile => ({ fileName: 'x.xlsx', kind: 'xlsx', sheets: [{ name, rows }] });
const build = (file: TableFile, mutate?: (m: ImportMapping) => void) => {
  const { mapping } = suggestMapping(file, 0);
  mutate?.(mapping);
  return buildPreview(file, mapping);
};

describe('header auto-detection', () => {
  const columns = (file: TableFile) => {
    const { mapping } = suggestMapping(file, 0);
    const sheet = mapping.sheets[0]!;
    return { name: sheet.nameColumn, group: sheet.groupColumn, nutrients: Object.fromEntries(Object.entries(sheet.nutrients).map(([code, c]) => [code, [c!.column, c!.unit]])) };
  };

  it('maps Spanish headers', async () => {
    const file = await readTableFile(utf8(SPANISH_CSV), 'tabla.csv');
    expect(columns(file)).toEqual({
      name: 0,
      group: 1,
      nutrients: { kcal: [2, 'kcal'], protein: [3, 'g'], carbs: [4, 'g'], fat: [5, 'g'], sodium: [6, 'mg'] },
    });
  });

  it('maps English headers, preferring kcal over kJ and reading units from the header', () => {
    const file = fileOf([
      ['Food name', 'Food group', 'Energy (kJ)', 'Energy (kcal)', 'Protein (g)', 'Carbohydrate (g)', 'Total fat (g)', 'Dietary fibre (g)', 'Total sugars (g)', 'Saturated fat (g)', 'Potassium (mg)', 'Vitamin A (µg RAE)', 'Folate (µg)', 'Vitamin D (IU)'],
      ['Imaginary apple', 'Fruit', 218, 52, 0.3, 13.8, 0.2, 2.4, 10.4, 0.03, 107, 3, 3, 0],
    ]);
    expect(columns(file)).toEqual({
      name: 0,
      group: 1,
      nutrients: {
        kcal: [3, 'kcal'], protein: [4, 'g'], carbs: [5, 'g'], fat: [6, 'g'], fiber: [7, 'g'], sugars: [8, 'g'], sat_fat: [9, 'g'], potassium: [10, 'mg'], vit_a: [11, 'ug'], folate: [12, 'ug'], vit_d: [13, 'iu'],
      },
    });
  });

  it('uses the kJ column when there is no kcal column', () => {
    const file = fileOf([['Food', 'Energy (kJ)', 'Protein (g)'], ['Imaginary pear', 239, 1]]);
    expect(columns(file).nutrients).toEqual({ kcal: [1, 'kj'], protein: [2, 'g'] });
  });

  it('maps Portuguese headers', () => {
    const file = fileOf([
      ['Nome do alimento', 'Grupo', 'Energia (kcal)', 'Proteína (g)', 'Carboidrato (g)', 'Lipídeos (g)', 'Fibra alimentar (g)', 'Sódio (mg)', 'Cálcio (mg)', 'Ferro (mg)', 'Vitamina C (mg)', 'Zinco (mg)'],
      ['Mamão inventado', 'Frutas', 40, 0.5, 10, 0.1, 1.8, 3, 20, 0.2, 60, 0.1],
    ]);
    expect(columns(file)).toEqual({
      name: 0,
      group: 1,
      nutrients: { kcal: [2, 'kcal'], protein: [3, 'g'], carbs: [4, 'g'], fat: [5, 'g'], fiber: [6, 'g'], sodium: [7, 'mg'], calcium: [8, 'mg'], iron: [9, 'mg'], vit_c: [10, 'mg'], zinc: [11, 'mg'] },
    });
  });

  it('maps French headers, with the basis in the unit text', () => {
    const file = fileOf([
      ["Nom de l'aliment", "Groupe d'aliments", 'Énergie (kcal/100 g)', 'Protéines (g/100 g)', 'Glucides (g/100 g)', 'Lipides (g/100 g)', 'Sucres (g/100 g)', 'AG saturés (g/100 g)', 'Fibres alimentaires (g/100 g)', 'Magnésium (mg/100 g)', 'Vitamine B12 (µg/100 g)', 'Vitamine D (µg/100 g)'],
      ['Poire imaginaire', 'fruits', 57, 0.4, 13, 0.1, 9.7, 0.02, 3, 7, 0, 0],
    ]);
    expect(columns(file)).toEqual({
      name: 0,
      group: 1,
      nutrients: { kcal: [2, 'kcal'], protein: [3, 'g'], carbs: [4, 'g'], fat: [5, 'g'], sugars: [6, 'g'], sat_fat: [7, 'g'], fiber: [8, 'g'], magnesium: [9, 'mg'], vit_b12: [10, 'ug'], vit_d: [11, 'ug'] },
    });
    expect(suggestMapping(file, 0).mapping.basis).toBe('g100');
  });

  it('finds a header row that is not the first, and a row of units under it', () => {
    const file = fileOf([
      ['Tabla inventada de composición'],
      [],
      ['Valores por 100 g de parte comestible'],
      ['Alimento', 'Energía', 'Proteínas', 'Sodio'],
      [null, 'kcal', 'g', 'mg'],
      ['Mango inventado', 60, 0.8, 1],
    ]);
    const { mapping } = suggestMapping(file, 0);
    const sheet = mapping.sheets[0]!;
    expect(sheet.headerRow).toBe(3);
    expect(sheet.firstDataRow).toBe(5);
    expect(sheet.nutrients.kcal).toMatchObject({ column: 1, unit: 'kcal', unitAssumed: false });
    expect(sheet.nutrients.sodium).toMatchObject({ column: 3, unit: 'mg' });
    expect(buildPreview(file, mapping).foods).toEqual([expect.objectContaining({ name: 'Mango inventado', per100g: { kcal: 60, protein: 0.8, sodium: 1 } })]);
  });

  it('marks a unit that the header does not state as assumed (the nutrient unit), so the screen says so', () => {
    const file = fileOf([['Alimento', 'Calcio', 'Proteína'], ['Queso ficticio', 700, 25]]);
    const { mapping } = suggestMapping(file, 0);
    expect(mapping.sheets[0]!.nutrients.calcium).toMatchObject({ unit: 'mg', unitAssumed: true });
    expect(mapping.sheets[0]!.nutrients.protein).toMatchObject({ unit: 'g', unitAssumed: true });
  });

  it('does not take saturated fat for total fat, or added sugars for sugars', () => {
    const file = fileOf([['Alimento', 'Grasa saturada (g)', 'Azúcares añadidos (g)'], ['A', 1, 2]]);
    expect(columns(file).nutrients).toEqual({ sat_fat: [1, 'g'] });
  });
});

describe('the basis', () => {
  it('reads per 100 g, per 100 ml and per kg from the headers or the lines above them', () => {
    expect(detectBasis([['Valores por 100 g', 'x']])).toEqual({ basis: 'g100', assumed: false });
    expect(detectBasis([['Nutrient', 'Value per 100 ml']])).toEqual({ basis: 'ml100', assumed: false });
    expect(detectBasis([['Composición por kg de alimento']])).toEqual({ basis: 'kg1', assumed: false });
    expect(detectBasis([['Alimento', 'Energía']])).toEqual({ basis: 'g100', assumed: true });
  });
  it('refuses a basis that is not a fixed weight or volume: per portion, per serving, per 100 kcal', () => {
    expect(detectBasis([['Alimento', 'Energía por porción']]).basis).toBe('other');
    expect(detectBasis([['Food', 'Per serving (g)']]).basis).toBe('other');
    expect(detectBasis([['Alimento', 'por 100 kcal']]).basis).toBe('other');
    expect(detectBasis([['Aliment', 'par portion']]).basis).toBe('other');
  });
  it('blocks the import on a refused basis, flags per 100 ml, and converts per kg by dividing by 10', () => {
    const rows: SyntheticCell[][] = [['Alimento', 'Energía (kcal)', 'Proteínas (g)'], ['Leche inventada', 640, 32]];
    const refused = build(fileOf(rows), (m) => (m.basis = 'other'));
    expect(refused.blocking).toContainEqual({ kind: 'basis_refused' });
    const ml = build(fileOf(rows), (m) => (m.basis = 'ml100'));
    expect(ml.blocking).toEqual([]);
    expect(ml.basis).toBe('ml100');
    expect(ml.foods[0]!.per100g).toEqual({ kcal: 640, protein: 32 });
    const kg = build(fileOf(rows), (m) => (m.basis = 'kg1'));
    expect(kg.foods[0]!.per100g).toEqual({ kcal: 64, protein: 3.2 });
  });
});

describe('preview and validation', () => {
  it('keeps every value exactly as read, converts units only, and keeps unknown apart from zero', async () => {
    const file = await readTableFile(utf8(SPANISH_CSV), 'tabla.csv');
    const preview = build(file);
    expect(preview.foods.map((f) => [f.name, f.group, f.per100g])).toEqual([
      ['Manzana inventada', 'Frutas', { kcal: 52.5, protein: 0.3, carbs: 13.8, fat: 0.2, sodium: 1 }],
      ['Pan de ejemplo', 'Cereales', { kcal: 265, protein: 9, carbs: 49, fat: 3.2, sodium: 491 }],
      // "tr" and "nd" are unknown: the keys are absent, not zero.
      ['Yogur ficticio', 'Lácteos', { protein: 3.5, carbs: 4.7, sodium: 46 }],
    ]);
    expect(preview.counts.foods).toBe(3);
    expect(preview.counts.nutrientsMapped).toBe(5);
    expect(preview.counts.unknownCells).toBe(2);
    expect(preview.blocking).toEqual([]);
  });

  it('applies the unit of each column: kJ to kcal, mg to g, µg to mg', () => {
    const file = fileOf([
      ['Alimento', 'Energía (kJ)', 'Proteína (mg)', 'Calcio (µg)', 'Sodio (g)', 'Vitamina D (UI)'],
      ['Tostada inventada', 1000, 491, 250, 1.5, 400],
    ]);
    expect(buildPreview(file, suggestMapping(file, 0).mapping).foods[0]!.per100g).toEqual({ kcal: 1000 / 4.184, protein: 0.491, calcium: 0.25, sodium: 1500, vit_d: 10 });
  });

  it('refuses an IU column where it cannot be converted exactly, and says which', () => {
    const file = fileOf([['Alimento', 'Vitamina A (UI)', 'Proteína (g)'], ['Zanahoria ficticia', 16000, 1]]);
    expect(build(file).blocking).toContainEqual({ kind: 'unit_refused', nutrient: 'vit_a', unit: 'iu', reason: 'iu_ambiguous' });
  });

  it('reads decimal commas in a point file and the other way round', () => {
    const file = fileOf([['Alimento', 'Energía (kcal)', 'Sodio (mg)'], ['A', '52,5', '1.234,5'], ['B', '10.25', '7']]);
    expect(build(file).foods.map((f) => f.per100g)).toEqual([{ kcal: 52.5, sodium: 1234.5 }, { kcal: 10.25, sodium: 7 }]);
  });

  it('counts rows skipped with the reason of each kind, and blank rows apart', () => {
    const file = fileOf([
      ['Alimento', 'Energía (kcal)', 'Proteínas (g)'],
      ['CEREALES Y DERIVADOS', null, null],
      ['Arroz inventado', 130, 2.7],
      [],
      [null, 50, 1],
      ['Fruta sin datos', 'nd', 'tr'],
      ['Aceite inventado', 5000, 0],
      ['x'.repeat(501), 10, 1],
    ]);
    const preview = build(file);
    expect(preview.foods.map((f) => f.name)).toEqual(['Arroz inventado']);
    expect(preview.counts.skipped).toEqual({ no_name: 1, no_values: 2, out_of_range: 1, name_too_long: 1 });
    expect(preview.counts.blankRows).toBe(1);
    expect(preview.skippedExamples).toEqual(
      expect.arrayContaining([expect.objectContaining({ row: 6, reason: 'out_of_range', nutrient: 'kcal' }), expect.objectContaining({ row: 1, reason: 'no_values' })]),
    );
    expect(preview.counts.rowsRead).toBe(7);
  });

  it('reports unreadable cells and keeps them unknown', () => {
    const file = fileOf([['Alimento', 'Energía (kcal)', 'Proteínas (g)'], ['A', 'muchas', 3]]);
    const preview = build(file);
    expect(preview.counts.unreadableCells).toBe(1);
    expect(preview.foods[0]!.per100g).toEqual({ protein: 3 });
  });

  it('flags energy that does not match the macronutrients, without changing anything', () => {
    const file = fileOf([
      ['Alimento', 'Energía (kcal)', 'Proteínas (g)', 'Hidratos de carbono (g)', 'Grasa (g)'],
      ['Coherente', 130, 2.7, 28, 0.3],
      ['Incoherente', 600, 2, 10, 1],
      ['Sin grasa', 90, 3, 15, 'nd'],
    ]);
    const preview = build(file);
    expect(preview.warnings.energyMismatch.count).toBe(1);
    expect(preview.warnings.energyMismatch.examples[0]).toMatchObject({ name: 'Incoherente', kcal: 600, estimated: 4 * 2 + 4 * 10 + 9 * 1 });
    expect(preview.foods.map((f) => f.per100g.kcal)).toEqual([130, 600, 90]);
  });

  it('samples rows as they will be stored', () => {
    const file = fileOf([['Alimento', 'Energía (kcal)'], ...Array.from({ length: 20 }, (_, i) => [`F${i}`, i + 1] as SyntheticCell[])]);
    const preview = build(file);
    expect(preview.sample).toHaveLength(5);
    expect(preview.sample[0]).toMatchObject({ name: 'F0', per100g: { kcal: 1 } });
  });

  it('blocks when there is no name column or no nutrient column', () => {
    const noNutrients = build(fileOf([['Alimento', 'Notas'], ['A', 'b']]));
    expect(noNutrients.blocking).toContainEqual({ kind: 'no_nutrients' });
    const noName = build(fileOf([['Alimento', 'Energía (kcal)'], ['A', 1]]), (m) => (m.sheets[0]!.nameColumn = -1));
    expect(noName.blocking).toContainEqual({ kind: 'no_name_column' });
    expect(build(fileOf([['Alimento', 'Energía (kcal)']])).blocking).toContainEqual({ kind: 'no_foods' });
  });

  it('reads several sheets with one food group per sheet', async () => {
    const bytes = makeWorkbook([
      { name: 'Frutas', rows: [['Alimento', 'Energía (kcal)'], ['Pera inventada', 57]] },
      { name: 'Verduras', rows: [['Alimento', 'Energía (kcal)'], ['Acelga ficticia', 19], ['Berro ficticio', 11]] },
    ]);
    const file = await readTableFile(bytes, 'x.xlsx');
    const first = suggestMapping(file, 0).mapping;
    const second = suggestMapping(file, 1).mapping;
    const mapping: ImportMapping = { ...first, sheets: [{ ...first.sheets[0]!, groupFromSheetName: true }, { ...second.sheets[0]!, groupFromSheetName: true }] };
    expect(buildPreview(file, mapping).foods.map((f) => [f.name, f.group, f.sheet, f.row])).toEqual([
      ['Pera inventada', 'Frutas', 'Frutas', 1],
      ['Acelga ficticia', 'Verduras', 'Verduras', 1],
      ['Berro ficticio', 'Verduras', 'Verduras', 2],
    ]);
  });

  it('stops when cancelled', async () => {
    const rows: SyntheticCell[][] = [['Alimento', 'Energía (kcal)'], ...Array.from({ length: 20_000 }, (_, i) => [`F${i}`, 1] as SyntheticCell[])];
    const file = fileOf(rows);
    const token = { cancelled: false };
    const run = buildPreviewAsync(file, suggestMapping(file, 0).mapping, { cancel: token, onProgress: (f) => f > 0.2 && (token.cancelled = true) });
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
  });
});
