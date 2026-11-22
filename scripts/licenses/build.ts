import fs from 'node:fs';
import path from 'node:path';

import { ALLOWED_LICENSES, collectLicenses, isAllowed } from './collect';

/**
 * Writes catalog-build/licenses.json (git-ignored, like catalog.db): the third-party license list the About screen shows.
 * Runs after every `npm install` (postinstall) and in the release workflow (`npm run licenses:build`). It reports, but does not
 * fail on, a license outside the allowed list: the test `scripts/licenses/__tests__/licenses.test.ts` is what fails the build.
 */
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'catalog-build', 'licenses.json');

const report = collectLicenses(ROOT);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report)}\n`);

const outside = report.packages.filter((p) => !isAllowed(p.license));
console.log(`licenses: ${report.packages.length} packages -> ${path.relative(ROOT, OUT)}`);
if (outside.length > 0) {
  console.warn(`licenses: ${outside.length} package(s) outside ${ALLOWED_LICENSES.join(', ')}:`);
  for (const p of outside) console.warn(`  ${p.name}@${p.version}  ${p.license}`);
}
