/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../..');

/** Every source file under `src`, with the files of development-only folders (`dev/`) listed apart. */
function sources(dir: string, inDev = false): { file: string; dev: boolean }[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full, inDev || name === 'dev');
    return /\.tsx?$/.test(name) ? [{ file: full, dev: inDev }] : [];
  });
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

describe('development-only code (never in a release bundle)', () => {
  it('is reached only from behind `__DEV__`, or from the web preview file, never by a plain import', () => {
    const offenders: string[] = [];
    for (const { file, dev } of sources(SRC)) {
      if (dev) continue; // development code may use other development code
      const text = readFileSync(file, 'utf8');
      const name = rel(file);
      if (name === 'features/startup/openServices.web.ts') continue; // loaded only by the browser preview; Metro never bundles it for Android or iOS
      if (/from\s+['"][^'"]*\/dev\//.test(text)) offenders.push(`${name}: static import of dev code`);
      for (const match of text.matchAll(/require\(\s*['"]([^'"]*\/dev\/[^'"]*)['"]\s*\)/g)) {
        const before = text.slice(Math.max(0, match.index! - 400), match.index);
        if (!/__DEV__/.test(before)) offenders.push(`${name}: require of ${match[1]} without __DEV__ in front of it`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the web preview file out of the native startup path', () => {
    const native = readFileSync(path.join(SRC, 'features/startup/openServices.ts'), 'utf8');
    expect(native).not.toMatch(/\/dev\/|devServices|devAi|__DEV__/);
  });

  it('marks every development-only file with a QN_DEV_ONLY string, so the exported bundle can be searched for it', () => {
    const unmarked = sources(SRC)
      .filter(({ dev }) => dev)
      .map(({ file }) => file)
      .filter((file) => !/QN_DEV_ONLY/.test(readFileSync(file, 'utf8')))
      .map(rel);
    expect(unmarked).toEqual([]);
  });
});
