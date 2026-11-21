/** One third-party package in the license report (`scripts/licenses/collect.ts` writes it). */
export interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  repository: string | null;
  text: string | null;
}

export interface LicenseReport {
  generatedFrom: string;
  packages: LicenseEntry[];
}

/**
 * The report generated from the installed dependencies, as a Metro asset. `catalog-build/` is git-ignored: `npm install` writes it
 * (postinstall), and `npm run licenses:build` writes it again. Metro fails to resolve this require when the file is missing, on
 * purpose: a build without its license list must not ship.
 */
export const licenseReport: LicenseReport = require('../../../catalog-build/licenses.json');
