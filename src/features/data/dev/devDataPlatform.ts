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

export function createDevDataPlatform(): DataPlatform {
  const photo = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3, 4]);
  return createFakeDataPlatform({
    photos: new Map([
      ['photos/sample-1.jpg', photo],
      ['photos/sample-2.jpg', photo],
    ]),
    nextPick: { name: 'qbit-nutrition-export-2026-11-21.json', bytes: sampleExport() },
  });
}
