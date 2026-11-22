/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import en from '../en.json';
import es from '../es.json';

const flatten = (value: object, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, v]) => (typeof v === 'object' && v !== null ? flatten(v, `${prefix}${key}.`) : [`${prefix}${key}`]));

const enKeys = new Set(flatten(en));
const esKeys = new Set(flatten(es));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('strings', () => {
  it('has the same keys in English and Spanish', () => {
    expect([...enKeys].filter((k) => !esKeys.has(k))).toEqual([]);
    expect([...esKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('defines every literal key the screens use', () => {
    const used = new Set<string>();
    for (const file of [...sources(path.join(__dirname, '../../features')), ...sources(path.join(__dirname, '../../app'))]) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(match[1]!);
    }
    const missing = [...used].filter((key) => !enKeys.has(key) && !enKeys.has(`${key}_one`));
    expect(missing).toEqual([]);
  });
});
