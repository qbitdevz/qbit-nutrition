import { strToU8 } from 'fflate';

import { createFakeDataPlatform } from '@/platform/fakeDataPlatform';
import type { DataPlatform } from '@/platform/dataPlatform';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION } from '../exportFormat';

/**
 * DEVELOPMENT ONLY (QN_DEV_ONLY_DATA_PLATFORM). The browser preview has no app file folder, share sheet or document picker worth using, so
 * the data screens run on the in-memory fake: two "kept photos" are on disk, and the file picker always returns a
 * small, valid sample export so the import preview and the replace flow can be walked through. Dropped from release
 * bundles with `__DEV__` (see `app/_layout.tsx`).
 */
function sampleExport(): Uint8Array {
  const days = Array.from({ length: 21 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
    return { date, kcal: 1700 + ((i * 97) % 500) };
  });
  const iso = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const document = {
    format: EXPORT_FORMAT,
    format_version: EXPORT_FORMAT_VERSION,
    app_version: '1.0.0',
    exported_at: '2026-11-21T12:00:00.000Z',
    profile: {
      id: 'sample-profile',
      sex: 'female',
      birth_date: '1991-04-03',
      height_cm: 166,
      activity_level: 'moderate',
      special_condition: null,
      unit_system: 'metric',
      locale: 'en',
      disclaimer_accepted_at: '2026-10-01T09:00:00.000Z',
      disclaimer_version: '2026-11-21',
      created_at: '2026-10-01T09:00:00.000Z',
      updated_at: '2026-10-01T09:00:00.000Z',
    },
    goals: [],
    body_measurements: [
      { id: 'w1', measured_on: '2026-10-02', kind: 'weight', value: 68.4, source: 'manual' },
      { id: 'w2', measured_on: '2026-10-16', kind: 'weight', value: 67.9, source: 'manual' },
      { id: 'w3', measured_on: '2026-11-01', kind: 'weight', value: 67.1, source: 'manual' },
    ],
    meals: days.map((d, i) => ({
      id: `m${i}`,
      local_date: d.date,
      eaten_at: iso(d.date, 12),
      slot: 'lunch',
      name: null,
      source: 'manual',
      photo_path: null,
      note: null,
      created_at: iso(d.date, 12),
      updated_at: iso(d.date, 12),
      items: [
        {
          id: `i${i}`,
          position: 0,
          display_name: 'Sample lunch',
          grams: 400,
          food_source: 'ai_estimate',
          food_ref: null,
          origin: 'manual',
          confidence_food: null,
          confidence_portion: null,
          kcal: d.kcal,
          protein_g: 90,
          carbs_g: 200,
          fat_g: 60,
          nutrients: {},
        },
      ],
    })),
    custom_foods: [{ id: 'c1', name: 'House granola', kcal_100g: 420, protein_100g: 9, carbs_100g: 62, fat_100g: 15, other_nutrients: null, default_portion_g: 40 }],
    food_usage: [],
    match_memory: [],
    ai_providers: [
      { id: 'p1', label: 'Sample provider', preset: null, adapter: 'openai_compatible', base_url: 'https://api.example.com/v1', model: 'sample-model', output_mode: null, timeout_s: 60, is_active: true, last_test_at: null, last_test_result: null },
    ],
    settings: { locale: 'en' },
  };
  return strToU8(JSON.stringify(document));
}

/**
 * A SYNTHETIC food table for the preview: invented foods and numbers (a Spanish CSV, decimal commas, markers for missing values, one value no food can
 * have, one heading row, one energy that does not match its macros), so the import screens can be walked through. Not a row of any real table.
 */
function sampleTable(): Uint8Array {
  return strToU8(
    [
      'Alimento;Grupo;Energía (kcal);Proteínas (g);Hidratos de carbono (g);Grasa total (g);Fibra (g);Sodio (mg);Vitamina C (mg)',
      'FRUTAS DE EJEMPLO;;;;;;;;',
      'Plátano de ejemplo;Frutas;89;1,1;22,8;0,3;2,6;1;8,7',
      'Manzana inventada;Frutas;52,5;0,3;13,8;0,2;2,4;1;4,6',
      'Mango ficticio;Frutas;60;0,8;15;0,4;1,6;tr;36,4',
      'Arroz inventado cocido;Cereales;130;2,7;28,2;0,3;0,4;1;nd',
      'Pan de ejemplo;Cereales;265;9;49;3,2;2,7;491;0',
      'Lenteja ficticia;Legumbres;116;9;20,1;0,4;7,9;2;1,5',
      'Yogur inventado;Lácteos;61;3,5;4,7;3,3;-;46;0,5',
      'Aceite de prueba;Grasas;5000;0;0;100;0;0;0',
      'Galleta incoherente;Dulces;600;2;10;1;0,5;300;0',
      'Queso de ejemplo;Lácteos;402;25;1,3;33;0;621;0',
    ].join('\n'),
  );
}

/** A SYNTHETIC table in the layout of a published one that comes in several files (invented foods, one file per food group). */
function sampleTablePart(group: string, foods: string[]): Uint8Array {
  return strToU8(
    [
      `${group};;;;;`,
      'Por 100 g de porción comestible;;;;;',
      'Nº;Alimento;Género - especie - variedad;Energía (Kcal);Proteínas (g);Sodio (mg)',
      ';;;<ENERC>;<PROTCNT>;<NA>',
      ';;;2*1;3*1;13*1',
      ...foods.map((food, i) => `${i + 1};${food};;${100 + i * 12};${i + 1},5;${10 + i}`),
    ].join('\n'),
  );
}

/** What the preview's picker hands out when several files are chosen on the table screens: parts of one table, a sheet with nothing usable, a loose table, a file that cannot be read. */
function sampleTableFiles(): { name: string; bytes: Uint8Array }[] {
  return [
    { name: 'Alimentos inventados 01.csv', bytes: sampleTablePart('CEREALES INVENTADOS', ['Arroz inventado', 'Avena ficticia', 'Trigo de ejemplo']) },
    { name: 'Alimentos inventados 02.csv', bytes: sampleTablePart('FRUTAS INVENTADAS', ['Manzana ficticia', 'Pera de ejemplo']) },
    { name: 'Ácidos grasos inventados.csv', bytes: strToU8('Alimento;C18:2 (g);C18:3 (g)\nAceite inventado;50;1\nManteca ficticia;2;0\n') },
    { name: 'Tabla suelta inventada.csv', bytes: sampleTable() },
    { name: 'Tabla publicada.pdf', bytes: strToU8('%PDF-1.7') },
  ];
}

export function createDevDataPlatform(): DataPlatform {
  const photo = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3, 4]);
  const platform = createFakeDataPlatform({
    photos: new Map([
      ['photos/sample-1.jpg', photo],
      ['photos/sample-2.jpg', photo],
    ]),
    nextPick: { name: 'qbit-nutrition-export-2026-11-21.json', bytes: sampleExport() },
  });
  // The import-a-table screens pick a table, the data screen an export: on the table screens the picker hands out the synthetic table.
  const pick = platform.picker.pick;
  platform.picker.pick = async () => {
    const onTableScreen = typeof window !== 'undefined' && /import-table/.test(window.location.pathname);
    platform.state.nextPick = onTableScreen ? { name: 'Tabla inventada.csv', bytes: sampleTable() } : { name: 'qbit-nutrition-export-2026-11-21.json', bytes: sampleExport() };
    return pick();
  };
  const pickMany = platform.picker.pickMany;
  platform.picker.pickMany = async () => {
    const onTableScreen = typeof window !== 'undefined' && /import-table/.test(window.location.pathname);
    platform.state.nextPicks = onTableScreen ? sampleTableFiles() : null;
    return pickMany();
  };
  return platform;
}
