/** @jest-environment node */
import { buildPreview } from '../mapping';
import { suggestMapping } from '../headers';
import { PRESETS, detectPreset, presetById } from '../presets';
import { readTableFile, type TableFile } from '../readFile';
import { SPANISH_CSV, makeWorkbook, utf8, type SyntheticCell } from '../testing/synthetic';

/**
 * SYNTHETIC files that imitate the LAYOUT of two published tables (the foods and numbers are invented, and the columns are in a
 * different order from the real ones). A preset recognises structure only; no row of any real table is in this repository (S2).
 */
const argenfoodsLike = (): SyntheticCell[][] => [
  ['Universidad inventada'],
  ['http://ejemplo.invalido\\tabla'],
  [null, 'GRUPO INVENTADO'],
  [null, null, null, 'Por 100 gramos de porción comestible'],
  ['Nº', 'Alimento', 'Género - especie - variedad', null, 'Sodio (mg)', 'Proteínas (g)', 'Energía (Kcal)', 'Energía (kj)', 'Carbohidra-tos totales (g)', 'Carbohidratos disponibles (g)', 'Fibra dietética (g)', 'Hierro (mg)'],
  [null, null, null, null, '<NA>', '<PROTCNT>', '<ENERC>', '<ENERC>', '<CHOCDF>', '<CHOAVLDF>', '<FIBTG>', '<FE>'],
  [null, null, null, null, '13*1', '3*1', '2*1', '26*1', '6*1', '7*1', '8*1', '17*1'],
  [null, 'Grupo inventado'],
  [1, 'Alimento inventado uno', 'Genus inventus', null, 12.5, 7.25, 130, 544, 28, 26, 1.5, '...'],
  [2, 'Alimento inventado dos', null, null, '...', 3, 90, 377, 15, 14, '...', 0.4],
  [3, 'Alimento inventado tres', null, null, 0, 0, 884, 3699, 0, 0, 0, 0],
];

const ciqualLike = (comma: boolean): SyntheticCell[][] => {
  const n = (v: number) => (comma ? String(v).replace('.', ',') : String(v));
  return [
    ['alim_grp_nom_fr', 'alim_code', 'alim_nom_fr', 'Energie (kJ/100 g)', 'Energie (kcal/100 g)', 'Protéines (g/100 g)', 'Glucides (g/100 g)', 'Lipides (g/100 g)', 'Sodium (mg/100 g)', 'Vitamine D (µg/100 g)', 'Folates totaux (µg/100 g)'],
    ['groupe inventé', 100, 'aliment inventé un', n(544), n(130), n(7.5), n(28.25), '-', n(12), 'traces', '< 0,5'.replace(',', comma ? ',' : '.')],
    ['groupe inventé', 101, 'aliment inventé deux', n(377), n(90), n(3), n(15), n(0.5), '< 5', n(1.2), n(35)],
  ];
};

const fileOf = (rows: SyntheticCell[][], name = 'x.xls'): TableFile => ({ fileName: name, kind: 'xls', sheets: [{ name: 'Hoja1', rows }] });

describe('presets recognise the layout of a published table', () => {
  it('lists the presets of the tables published as spreadsheets', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['argenfoods', 'ciqual']);
    expect(presetById('argenfoods')?.name).toBe('ARGENFOODS');
    expect(presetById('nope')).toBeNull();
  });

  it('ARGENFOODS layout: the header on row 5, tag and factor rows skipped, the group from the file title, kcal over kJ, units from the headers, "..." as unknown', () => {
    const file = fileOf(argenfoodsLike());
    const found = detectPreset(file);
    expect(found?.preset.id).toBe('argenfoods');
    const sheet = found!.mapping.sheets[0]!;
    expect(found!.mapping.presetId).toBe('argenfoods');
    expect(found!.mapping.basis).toBe('g100');
    expect(found!.mapping.basisAssumed).toBe(false);
    expect(sheet).toMatchObject({ headerRow: 4, firstDataRow: 7, nameColumn: 1, groupText: 'Grupo inventado' });
    expect(Object.fromEntries(Object.entries(sheet.nutrients).map(([code, c]) => [code, [c!.column, c!.unit]]))).toEqual({
      sodium: [4, 'mg'], protein: [5, 'g'], kcal: [6, 'kcal'], carbs: [8, 'g'], fiber: [10, 'g'], iron: [11, 'mg'],
    });
    const preview = buildPreview(file, found!.mapping);
    expect(preview.blocking).toEqual([]);
    expect(preview.foods.map((f) => [f.name, f.group, f.per100g])).toEqual([
      ['Alimento inventado uno', 'Grupo inventado', { sodium: 12.5, protein: 7.25, kcal: 130, carbs: 28, fiber: 1.5 }],
      ['Alimento inventado dos', 'Grupo inventado', { protein: 3, kcal: 90, carbs: 15, iron: 0.4 }],
      ['Alimento inventado tres', 'Grupo inventado', { sodium: 0, protein: 0, kcal: 884, carbs: 0, fiber: 0, iron: 0 }],
    ]);
    // The "Grupo inventado" title row inside the data is not a food.
    expect(preview.counts.skipped.no_values).toBe(1);
    expect(preview.counts.unknownCells).toBe(3);
    expect(found!.tableName).toBe('ARGENFOODS · Grupo inventado');
  });

  it('ARGENFOODS: a .xls and an .xlsx of the same layout are both recognised', async () => {
    for (const format of ['xls', 'xlsx'] as const) {
      const file = await readTableFile(makeWorkbook([{ name: 'Hoja1', rows: argenfoodsLike() }], format), `a.${format}`);
      expect(detectPreset(file)?.preset.id).toBe('argenfoods');
    }
  });

  it('CIQUAL layout: identifier columns, "(unit/100 g)" in each header, decimal commas read as text, "-", "traces" and "< x" as unknown', () => {
    const file = fileOf(ciqualLike(true), 'ciqual.xls');
    const found = detectPreset(file);
    expect(found?.preset.id).toBe('ciqual');
    const sheet = found!.mapping.sheets[0]!;
    expect(sheet).toMatchObject({ headerRow: 0, firstDataRow: 1, nameColumn: 2, groupColumn: 0 });
    expect(found!.mapping.decimal).toBe(',');
    expect(Object.fromEntries(Object.entries(sheet.nutrients).map(([code, c]) => [code, [c!.column, c!.unit]]))).toEqual({
      kcal: [4, 'kcal'], protein: [5, 'g'], carbs: [6, 'g'], fat: [7, 'g'], sodium: [8, 'mg'], vit_d: [9, 'ug'], folate: [10, 'ug'],
    });
    const preview = buildPreview(file, found!.mapping);
    expect(preview.foods.map((f) => [f.name, f.group, f.per100g])).toEqual([
      ['aliment inventé un', 'groupe inventé', { kcal: 130, protein: 7.5, carbs: 28.25, sodium: 12 }],
      ['aliment inventé deux', 'groupe inventé', { kcal: 90, protein: 3, carbs: 15, fat: 0.5, vit_d: 1.2, folate: 35 }],
    ]);
    expect(preview.counts.unknownCells).toBe(4);
  });

  it('CIQUAL layout with decimal points (the English file) reads the same', () => {
    const file = fileOf(ciqualLike(false).map((row, i) => (i === 0 ? row.map((c) => String(c).replace('Energie', 'Energy').replace('Protéines', 'Protein').replace('Glucides', 'Carbohydrate').replace('Lipides', 'Fat').replace('_fr', '_eng')) : row)), 'ciqual-en.xls');
    const found = detectPreset(file);
    expect(found?.preset.id).toBe('ciqual');
    expect(found!.mapping.decimal).toBe('.');
    expect(buildPreview(file, found!.mapping).foods[1]!.per100g).toMatchObject({ kcal: 90, fat: 0.5 });
  });

  it('each preset recognises only its own layout', () => {
    expect(detectPreset(fileOf(ciqualLike(true)))?.preset.id).toBe('ciqual');
    expect(detectPreset(fileOf(argenfoodsLike()))?.preset.id).toBe('argenfoods');
    // A generic table, a table with a header on the first row, and a workbook with other sheets are nobody's.
    expect(detectPreset(fileOf([['Alimento', 'Energía (kcal)'], ['A', 1]]))).toBeNull();
    expect(detectPreset(fileOf([['Nº', 'Alimento', 'Género - especie - variedad', null, 'Energía (Kcal)'], ['1', 'A', 'b', null, '3']]))).toBeNull();
    expect(detectPreset({ fileName: 'x.csv', kind: 'csv', sheets: [{ name: 'x', rows: SPANISH_CSV.split('\n').map((l) => l.split(';')) }] })).toBeNull();
    expect(detectPreset(fileOf([['alim_code', 'Energie (kcal/100 g)'], ['1', '2']]))).toBeNull();
    expect(detectPreset({ fileName: 'x.xlsx', kind: 'xlsx', sheets: [] })).toBeNull();
    expect(detectPreset(fileOf([]))).toBeNull();
  });

  it('a preset never marks an assumption the file does not support: units stated in the headers are not "assumed"', () => {
    const found = detectPreset(fileOf(argenfoodsLike()))!;
    expect(Object.values(found.mapping.sheets[0]!.nutrients).every((c) => c!.unitAssumed === false)).toBe(true);
  });

  it('the generic import still works for the same files when no preset exists for the layout', async () => {
    const file = await readTableFile(utf8(SPANISH_CSV), 'tabla.csv');
    const { mapping } = suggestMapping(file, 0);
    expect(buildPreview(file, mapping).counts.foods).toBe(3);
  });
});
