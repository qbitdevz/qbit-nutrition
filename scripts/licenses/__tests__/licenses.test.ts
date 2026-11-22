/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ALLOWED_LICENSES, MAX_TEXT, collectLicenses, declaredLicense, isAllowed } from '../collect';

const ROOT = path.resolve(__dirname, '../../..');

function makeProject(files: Record<string, string | object>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qn-licenses-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

describe('collectLicenses', () => {
  it('reads the app dependencies and what they depend on, once each, with license, repository and text', () => {
    const dir = makeProject({
      'package.json': { name: 'app', version: '1.2.3', dependencies: { alpha: '^1' }, devDependencies: { devonly: '^1' } },
      'node_modules/alpha/package.json': { name: 'alpha', version: '1.0.0', license: 'MIT', repository: { url: 'git+https://github.com/x/alpha.git' }, dependencies: { beta: '^1' } },
      'node_modules/alpha/LICENSE': 'MIT License\r\n\r\nCopyright (c) alpha\r\n',
      'node_modules/beta/package.json': { name: 'beta', version: '2.0.0', license: 'ISC', dependencies: { alpha: '^1' } },
      'node_modules/devonly/package.json': { name: 'devonly', version: '1.0.0', license: 'GPL-3.0' },
    });
    const report = collectLicenses(dir, []);
    expect(report.generatedFrom).toBe('app@1.2.3');
    expect(report.packages).toEqual([
      { name: 'alpha', version: '1.0.0', license: 'MIT', repository: 'https://github.com/x/alpha', text: 'MIT License\n\nCopyright (c) alpha' },
      { name: 'beta', version: '2.0.0', license: 'ISC', repository: null, text: null },
    ]);
    // A dev dependency is not part of the app.
    expect(report.packages.map((p) => p.name)).not.toContain('devonly');
  });

  it('lists two versions of the same package, and finds a nested one before the hoisted one', () => {
    const dir = makeProject({
      'package.json': { name: 'app', version: '1.0.0', dependencies: { a: '*', b: '*' } },
      'node_modules/a/package.json': { name: 'a', version: '1.0.0', license: 'MIT', dependencies: { shared: '^1' } },
      'node_modules/a/node_modules/shared/package.json': { name: 'shared', version: '1.0.0', license: 'MIT' },
      'node_modules/b/package.json': { name: 'b', version: '1.0.0', license: 'MIT', dependencies: { shared: '^2' } },
      'node_modules/shared/package.json': { name: 'shared', version: '2.0.0', license: 'BSD-3-Clause' },
    });
    const shared = collectLicenses(dir, []).packages.filter((p) => p.name === 'shared');
    expect(shared.map((p) => `${p.version}:${p.license}`)).toEqual(['1.0.0:MIT', '2.0.0:BSD-3-Clause']);
  });

  it('skips an optional dependency that is not installed, and does not walk below the build tooling', () => {
    const dir = makeProject({
      'package.json': { name: 'app', version: '1.0.0', dependencies: { lib: '*', tool: '*' } },
      'node_modules/lib/package.json': { name: 'lib', version: '1.0.0', license: 'MIT', optionalDependencies: { 'native-only': '*' } },
      'node_modules/tool/package.json': { name: 'tool', version: '1.0.0', license: 'MIT', dependencies: { 'tool-child': '*' } },
      'node_modules/tool-child/package.json': { name: 'tool-child', version: '1.0.0', license: 'MIT' },
    });
    expect(collectLicenses(dir, ['tool']).packages.map((p) => p.name)).toEqual(['lib', 'tool']);
  });

  it('cuts a very long license text', () => {
    const dir = makeProject({
      'package.json': { name: 'app', version: '1.0.0', dependencies: { big: '*' } },
      'node_modules/big/package.json': { name: 'big', version: '1.0.0', license: 'Apache-2.0' },
      'node_modules/big/LICENSE.md': 'x'.repeat(MAX_TEXT * 2),
    });
    const text = collectLicenses(dir, []).packages[0]!.text!;
    expect(text.length).toBeLessThan(MAX_TEXT + 5);
    expect(text.endsWith('…')).toBe(true);
  });

  it('reads the older license fields, and names a package without one UNKNOWN', () => {
    expect(declaredLicense({ license: { type: 'MIT' } })).toBe('MIT');
    expect(declaredLicense({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe('MIT OR Apache-2.0');
    expect(declaredLicense({})).toBe('UNKNOWN');
  });
});

describe('isAllowed', () => {
  it('accepts the licenses compatible with MIT distribution, as SPDX expressions', () => {
    for (const id of ['MIT', 'ISC', 'BSD-3-Clause', 'Apache-2.0', '(MIT OR CC0-1.0)', '(BSD-3-Clause OR GPL-2.0)', 'MIT AND OFL-1.1']) expect(isAllowed(id)).toBe(true);
  });

  it('refuses copyleft and unknown licenses unless an allowed alternative exists', () => {
    for (const id of ['GPL-3.0', 'AGPL-3.0-only', 'LGPL-2.1', 'UNKNOWN', 'SEE LICENSE IN LICENSE.txt', 'MIT AND GPL-3.0']) expect(isAllowed(id)).toBe(false);
  });

  it('keeps the allowed list free of copyleft', () => {
    expect(ALLOWED_LICENSES.filter((id) => /GPL|AGPL|LGPL|MPL|EUPL|CC-BY-SA|CC-BY-NC/.test(id))).toEqual([]);
  });
});

describe('the installed dependencies of this app (docs/12 section 7: "Dependency license report reviewed")', () => {
  const report = collectLicenses(ROOT);

  it('finds the packages the app is built on', () => {
    const names = report.packages.map((p) => p.name);
    for (const name of ['react', 'react-native', 'expo', 'drizzle-orm', 'react-native-health-connect', 'fflate']) expect(names).toContain(name);
    expect(report.packages.length).toBeGreaterThan(100);
  });

  it('has no license outside the MIT-compatible list; a new one needs a recorded decision, not a quiet pass', () => {
    const outside = report.packages.filter((p) => !isAllowed(p.license)).map((p) => `${p.name}@${p.version} (${p.license})`);
    expect(outside).toEqual([]);
  });

  it('has no analytics, crash reporting, or advertising package', () => {
    const banned = /sentry|firebase|analytics|crashlytics|amplitude|mixpanel|segment|admob|appsflyer|adjust|bugsnag|datadog|posthog/i;
    expect(report.packages.map((p) => p.name).filter((n) => banned.test(n))).toEqual([]);
  });
});
