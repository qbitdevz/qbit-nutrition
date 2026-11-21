/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' || full.endsWith(path.join('scan', 'dev')) ? [] : sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('development-only scan code (never in a release bundle)', () => {
  it('is reached only from behind `__DEV__`, or from the web preview file, never by a plain import', () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      if (rel === 'features/startup/openServices.web.ts') continue; // loaded only by the browser preview; Metro never bundles it for Android or iOS
      if (/from\s+['"][^'"]*scan\/dev\/|from\s+['"]\.\/dev\//.test(text)) offenders.push(`${rel}: static import of dev code`);
      for (const match of text.matchAll(/require\(\s*['"]([^'"]*\/dev\/[^'"]*)['"]\s*\)/g)) {
        const before = text.slice(Math.max(0, match.index! - 400), match.index);
        if (!/__DEV__/.test(before)) offenders.push(`${rel}: require of ${match[1]} without __DEV__ in front of it`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the web preview file out of the native startup path', () => {
    const native = readFileSync(path.join(SRC, 'features/startup/openServices.ts'), 'utf8');
    expect(native).not.toMatch(/scan\/dev|devServices|devAi|__DEV__/);
  });
});
