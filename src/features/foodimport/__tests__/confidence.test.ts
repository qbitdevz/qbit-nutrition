/** @jest-environment node */
import { assessMapping, recognitionLine, type Assessment } from '../confidence';
import { isNameHeader, labelStrength, suggestMapping } from '../headers';
import { buildPreview } from '../mapping';
import { detectPreset } from '../presets';
import { readTableFile } from '../readFile';
import { utf8 } from '../testing/synthetic';

/** Reads a synthetic CSV and assesses what the importer would do with it by default (no preset, nothing reviewed by hand). */
async function assess(csv: string, options: { reviewed?: boolean } = {}): Promise<Assessment> {
  const file = await readTableFile(utf8(csv), 'tabla.csv');
  const recognised = detectPreset(file);
  const mapping = recognised ? recognised.mapping : suggestMapping(file, 0).mapping;
  return assessMapping(file, mapping, buildPreview(file, mapping), { preset: recognised?.preset.name ?? null, reviewed: options.reviewed ?? false });
}

const OK_ROWS = ['Manzana inventada;52;0,3;13,8;0,2', 'Pan de ejemplo;265;9;49;3,2', 'Lenteja ficticia;116;9;20;0,4'];
const kinds = (a: Assessment) => a.confirm.map((c) => c.kind);

describe('how a header label matches (B4)', () => {
  it.each([
    ['protein', 'Proteínas (g)', 'strong'],
    ['protein', 'Protein', 'strong'],
    ['carbs', 'Hidratos de carbono (g)', 'strong'],
    ['kcal', 'Energía (kcal)', 'strong'],
    ['sodium', 'Sodio (mg)', 'strong'],
    ['protein', 'Prot (g)', 'weak'],
    ['carbs', 'CHO', 'weak'],
    ['carbs', 'Carbs (g)', 'weak'],
    ['sodium', 'Na (mg)', 'weak'],
    ['potassium', 'K', 'weak'],
    ['calcium', 'Ca (mg)', 'weak'],
    ['iron', 'Fe (mg)', 'weak'],
    ['sat_fat', 'AGS (g)', 'weak'],
  ] as const)('%s ← "%s" is a %s match', (code, label, strength) => expect(labelStrength(code, label)).toBe(strength));

  it('recognises the headers that name the foods', () => {
    expect(isNameHeader('Alimento')).toBe(true);
    expect(isNameHeader('Food name')).toBe(true);
    expect(isNameHeader('Rótulo')).toBe(false);
    expect(isNameHeader('Energía (kcal)')).toBe(false);
  });
});

describe('when the importer is confident, it says what it recognised in one line and asks nothing (B4)', () => {
  it('headers that name each nutrient with its unit and the basis: confident', async () => {
    const a = await assess(['Alimento;Energía (kcal/100 g);Proteínas (g/100 g);Hidratos de carbono (g/100 g);Grasa total (g/100 g)', ...OK_ROWS].join('\n'));
    expect(a).toMatchObject({ confident: true, recognition: 'headers', nutrients: 4, basis: 'g100', confirm: [] });
    expect(recognitionLine(a)).toEqual({ key: 'headers', nutrients: 4, basis: 'g100', preset: null });
  });

  it('a recognised published layout (a preset) is confident, and the line names it', async () => {
    const rows = [
      'GRUPO INVENTADO;;;;;',
      'Por 100 g de porción comestible;;;;;',
      'Nº;Alimento;Género - especie - variedad;Energía (Kcal);Proteínas (g);Sodio (mg)',
      ';;;<ENERC>;<PROTCNT>;<NA>',
      ';;;2*1;3*1;13*1',
      '1;Alimento inventado uno;;130;7,25;4',
      '2;Alimento inventado dos;;90;3;12,5',
    ];
    const a = await assess(rows.join('\n'));
    expect(a).toMatchObject({ confident: true, recognition: 'preset', presetName: 'ARGENFOODS', nutrients: 3, basis: 'g100', confirm: [] });
    expect(recognitionLine(a)).toEqual({ key: 'preset', nutrients: 3, basis: 'g100', preset: 'ARGENFOODS' });
  });
});

describe('when it is not confident, it says exactly which point and asks to confirm it (B4)', () => {
  it('a column guessed from an abbreviation', async () => {
    const a = await assess(['Alimento;Energía (kcal/100 g);Prot (g/100 g);CHO (g/100 g);Grasa total (g/100 g)', ...OK_ROWS].join('\n'));
    expect(a.confident).toBe(false);
    expect(a.confirm).toEqual([{ kind: 'weak_columns', nutrients: ['protein', 'carbs'] }]);
  });

  it('a unit that was assumed, because the header does not state it', async () => {
    const a = await assess(['Alimento;Energía;Proteínas (g/100 g);Hidratos de carbono (g/100 g);Grasa total (g/100 g)', ...OK_ROWS].join('\n'));
    expect(a.confirm).toEqual([{ kind: 'units_assumed', units: [{ nutrient: 'kcal', unit: 'kcal' }] }]);
  });

  it('a basis the table does not state', async () => {
    const a = await assess(['Alimento;Energía (kcal);Proteínas (g);Hidratos de carbono (g);Grasa total (g)', ...OK_ROWS].join('\n'));
    expect(kinds(a)).toEqual(['basis_assumed']);
  });

  it('values per 100 ml, which are used as if per 100 g', async () => {
    const a = await assess(['Alimento;Energía (kcal/100 ml);Proteínas (g/100 ml);Hidratos de carbono (g/100 ml);Grasa total (g/100 ml)', ...OK_ROWS].join('\n'));
    expect(kinds(a)).toEqual(['basis_ml']);
  });

  it('a name column found by looking at the data, not by a header', async () => {
    const a = await assess(['Rótulo;Energía (kcal/100 g);Proteínas (g/100 g);Hidratos de carbono (g/100 g);Grasa total (g/100 g)', ...OK_ROWS].join('\n'));
    expect(a.confirm).toEqual([{ kind: 'name_guessed', column: 0 }]);
  });

  it('many foods whose energy does not match their macros (a wrong column or unit is likely)', async () => {
    const rows = ['A;900;1;1;1', 'B;800;1;1;1', 'C;700;2;2;2', 'D;50;20;30;40'];
    const a = await assess(['Alimento;Energía (kcal/100 g);Proteínas (g/100 g);Hidratos de carbono (g/100 g);Grasa total (g/100 g)', ...rows].join('\n'));
    expect(a.confirm).toEqual([{ kind: 'energy_mismatch', count: 4, total: 4 }]);
  });

  it('many rows left out because a value is impossible (a wrong unit is likely)', async () => {
    const rows = ['A;9000;1;1;1', 'B;8000;1;1;1', 'C;7000;2;2;2', 'D;100;2;2;2'];
    const a = await assess(['Alimento;Energía (kcal/100 g);Proteínas (g/100 g);Hidratos de carbono (g/100 g);Grasa total (g/100 g)', ...rows].join('\n'));
    expect(a.confirm).toEqual([{ kind: 'many_skipped', count: 3, total: 4 }]);
  });

  it('lists every weak point at once, in a fixed order', async () => {
    const a = await assess(['Rótulo;Energía;Prot (g);CHO (g);Grasa total (g)', ...OK_ROWS].join('\n'));
    expect(kinds(a)).toEqual(['weak_columns', 'units_assumed', 'basis_assumed', 'name_guessed']);
    expect(a.confident).toBe(false);
  });
});

describe('what the person looked at on the mapping screen is not asked again (B4)', () => {
  it('drops the points the mapping screen shows, keeps the ones only the data shows', async () => {
    const guessed = ['Rótulo;Energía;Prot (g);CHO (g);Grasa total (g)', ...OK_ROWS].join('\n');
    expect((await assess(guessed, { reviewed: true })).confirm).toEqual([]);
    const rows = ['A;900;1;1;1', 'B;800;1;1;1', 'C;700;2;2;2', 'D;50;20;30;40'];
    const wrong = await assess(['Rótulo;Energía;Prot (g);CHO (g);Grasa total (g)', ...rows].join('\n'), { reviewed: true });
    expect(kinds(wrong)).toEqual(['energy_mismatch']);
  });
});
