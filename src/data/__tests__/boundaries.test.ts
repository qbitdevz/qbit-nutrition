/** @jest-environment node */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx|js)$/.test(name) ? [full] : [];
  });
}

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]!);

describe('module boundaries (docs/06 section 4, S10)', () => {
  it('src/core imports nothing from src/data, React or Expo', () => {
    const offenders = files(path.join(SRC, 'core')).flatMap((file) =>
      importsOf(file)
        .filter((spec) => {
          if (/^(react|react-native|expo)(\/|-|$)/.test(spec) || spec.startsWith('drizzle-orm')) return true;
          if (spec.startsWith('@/') && spec.slice(2).startsWith('data')) return true;
          if (!spec.startsWith('.')) return false;
          const target = path.resolve(path.dirname(file), spec);
          return target === path.join(SRC, 'data') || target.startsWith(path.join(SRC, 'data') + path.sep);
        })
        .map((spec) => `${path.relative(SRC, file)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it('the data layer keeps the Expo-only modules in src/data/expo', () => {
    const offenders = files(path.join(SRC, 'data'))
      .filter((file) => !file.includes(`${path.sep}expo${path.sep}`) && !file.includes(`${path.sep}__tests__${path.sep}`))
      .flatMap((file) =>
        importsOf(file)
          .filter((spec) => /^(react-native|expo-)/.test(spec))
          .map((spec) => `${path.relative(SRC, file)} -> ${spec}`),
      );
    expect(offenders).toEqual([]);
  });
});
