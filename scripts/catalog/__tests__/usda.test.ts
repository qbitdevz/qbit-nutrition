/** @jest-environment node */
/// <reference types="node" />
import { deflateRawSync } from 'node:zlib';
import { findDatasetFiles, parseUsdaJson, readZipJsonEntry } from '../usda';

const PAGE = `
<tr><td>Foundation Foods</td><td>10/2026</td><td>
  <a href="/fdc-datasets/FoodData_Central_foundation_food_json_2026-10-29.zip">JSON</a>
  <a href="/fdc-datasets/FoodData_Central_foundation_food_csv_2026-10-29.zip">CSV</a></td></tr>
<tr><td>Foundation Foods</td><td>04/2026</td><td>
  <a href="/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip">JSON</a></td></tr>
<tr><td>SR Legacy</td><td>04/2018</td><td>
  <a href="/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip">JSON</a>
  <a href="/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip">CSV</a></td></tr>
<a href="/fdc-datasets/FoodData_Central_branded_food_json_2026-10-29.zip">Branded: never used</a>
`;

describe('findDatasetFiles', () => {
  it('picks the newest JSON zip of Foundation Foods and SR Legacy only', () => {
    expect(findDatasetFiles(PAGE)).toEqual([
      {
        source: 'usda_foundation',
        fileName: 'FoodData_Central_foundation_food_json_2026-10-29.zip',
        url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-10-29.zip',
        version: '2026-10-29',
      },
      {
        source: 'usda_sr_legacy',
        fileName: 'FoodData_Central_sr_legacy_food_json_2018-04.zip',
        url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',
        version: '2018-04',
      },
    ]);
  });

  it('fails loudly when a data set link is missing, instead of guessing a URL', () => {
    expect(() => findDatasetFiles('<html>nothing here</html>')).toThrow(/usda_foundation/);
  });
});

/** Minimal single-entry zip writer, enough to exercise the reader. */
function zipOf(name: string, content: Buffer, method: 0 | 8): Buffer {
  const data = method === 8 ? deflateRawSync(content) : content;
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

describe('readZipJsonEntry', () => {
  const json = Buffer.from('{"hello":"wörld"}');

  it('reads deflated and stored entries', () => {
    expect(readZipJsonEntry(zipOf('a.json', json, 8)).toString('utf8')).toBe('{"hello":"wörld"}');
    expect(readZipJsonEntry(zipOf('a.json', json, 0)).toString('utf8')).toBe('{"hello":"wörld"}');
  });

  it('rejects data that is not a zip and a zip without a JSON file', () => {
    expect(() => readZipJsonEntry(Buffer.from('not a zip at all, just text padding'))).toThrow(/zip/i);
    expect(() => readZipJsonEntry(zipOf('readme.txt', json, 0))).toThrow(/No \.json/);
  });
});

describe('parseUsdaJson', () => {
  const foundation = JSON.stringify({
    FoundationFoods: [
      {
        fdcId: 323505,
        description: 'Kale, raw',
        foodCategory: { description: 'Vegetables and Vegetable Products' },
        foodNutrients: [
          { nutrient: { id: 1003, unitName: 'g' }, amount: 2.9 },
          { nutrient: { id: 1008, unitName: 'kcal' } }, // no amount: skipped
        ],
        foodPortions: [
          { value: 1, amount: 1, measureUnit: { name: 'cup' }, modifier: 'pieces of ~1"', gramWeight: 20.6 },
          { value: 1, measureUnit: { name: 'RACC' }, gramWeight: 85 },
          { value: 1, measureUnit: { name: 'undetermined' }, modifier: 'serving', gramWeight: 34 },
          { value: 1, measureUnit: { name: 'cup' }, modifier: 'no weight' },
        ],
      },
    ],
  });

  it('keeps id, description, category, nutrients with amounts, and usable portions', () => {
    expect(parseUsdaJson('usda_foundation', foundation)).toEqual([
      {
        source: 'usda_foundation',
        fdcId: 323505,
        description: 'Kale, raw',
        category: 'Vegetables and Vegetable Products',
        nutrients: [{ id: 1003, unit: 'g', amount: 2.9 }],
        portions: [
          { label: '1 cup pieces of ~1"', grams: 20.6 },
          { label: '1 serving', grams: 34 },
        ],
      },
    ]);
  });

  it('refuses a file with the wrong root key', () => {
    expect(() => parseUsdaJson('usda_sr_legacy', foundation)).toThrow(/SRLegacyFoods/);
  });
});
