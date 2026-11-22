import fs from 'node:fs';
import path from 'node:path';

/**
 * Third-party software licenses, read from the dependencies that are installed (docs/12 section 7: "The About screen lists all
 * dependency licenses, generated at build time"). No generator package: it walks `node_modules` from the app's `dependencies`
 * and reads each `package.json` and license file. Pure Node, so it runs in `postinstall`, in CI and in the release build.
 */

export interface LicenseEntry {
  name: string;
  version: string;
  /** The SPDX expression the package declares, or `UNKNOWN`. */
  license: string;
  /** Where the package lives, when it declares it. */
  repository: string | null;
  /** The text of its license file, when it ships one (cut at `MAX_TEXT` characters). */
  text: string | null;
}

export interface LicenseReport {
  generatedFrom: string;
  packages: LicenseEntry[];
}

/** A license text longer than this is cut: the screen shows it on request and the bundle stays small. */
export const MAX_TEXT = 12_000;

/**
 * Build tooling that `expo` lists among its dependencies but that never runs inside the app. Their own dependencies are not
 * walked from here (a package that the app really uses is still found through its own path). The report therefore leans toward
 * listing too much, never too little, and the screen says it includes build tools.
 */
export const TOOLING_ROOTS: readonly string[] = [
  '@expo/cli',
  '@expo/config',
  '@expo/config-plugins',
  '@expo/devtools',
  '@expo/fingerprint',
  '@expo/metro-config',
  '@expo/prebuild-config',
  'babel-preset-expo',
  'expo-modules-autolinking',
];

interface PackageJson {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function readPackage(dir: string): PackageJson | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

/** Node's resolution: the nearest `node_modules/<name>` going up from `from`. */
function locate(name: string, from: string): string | null {
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function declaredLicense(pkg: PackageJson): string {
  if (typeof pkg.license === 'string' && pkg.license.trim()) return pkg.license.trim();
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) return pkg.licenses.map((l) => l.type ?? 'UNKNOWN').join(' OR ');
  return 'UNKNOWN';
}

function repositoryUrl(pkg: PackageJson): string | null {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!raw) return null;
  const url = raw.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://');
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return /^https?:\/\//.test(url) ? url : null;
}

function licenseText(dir: string): string | null {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const file = names.filter((n) => /^(licen[sc]e|copying)(\.(md|txt|markdown))?$/i.test(n)).sort()[0];
  if (!file) return null;
  try {
    const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim();
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…` : text;
  } catch {
    return null;
  }
}

/** Every package the app's `dependencies` reach, once per name and version, sorted by name. */
export function collectLicenses(root: string, tooling: readonly string[] = TOOLING_ROOTS): LicenseReport {
  const rootPackage = readPackage(root);
  if (!rootPackage) throw new Error(`No package.json in ${root}`);
  const seen = new Set<string>();
  const entries = new Map<string, LicenseEntry>();
  const stack: [string, string][] = Object.keys(rootPackage.dependencies ?? {}).map((name) => [name, root]);

  while (stack.length > 0) {
    const [name, from] = stack.pop()!;
    const dir = locate(name, from);
    if (!dir || seen.has(dir)) continue; // an optional dependency that is not installed on this platform is skipped
    seen.add(dir);
    const pkg = readPackage(dir);
    if (!pkg?.name || !pkg.version) continue;
    entries.set(`${pkg.name}@${pkg.version}`, {
      name: pkg.name,
      version: pkg.version,
      license: declaredLicense(pkg),
      repository: repositoryUrl(pkg),
      text: licenseText(dir),
    });
    if (tooling.includes(pkg.name)) continue;
    for (const child of [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]) stack.push([child, dir]);
  }

  const packages = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }));
  return { generatedFrom: `${rootPackage.name ?? 'app'}@${rootPackage.version ?? '0.0.0'}`, packages };
}

/** Licenses a dependency may carry to be shipped inside an MIT project without a recorded decision (docs/12 section 7). */
export const ALLOWED_LICENSES: readonly string[] = [
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'Unlicense',
  // Fonts (Figtree, Outfit): the SIL Open Font License 1.1, as docs/12 section 7 records.
  'OFL-1.1',
  // caniuse-lite (browser data used by the build tools; never shipped in the app): Creative Commons attribution.
  'CC-BY-4.0',
];

/** True when an SPDX expression is satisfied by the allowed list: every `AND` part, and at least one `OR` alternative. */
export function isAllowed(expression: string, allowed: readonly string[] = ALLOWED_LICENSES): boolean {
  const clean = expression.trim().replace(/^\(|\)$/g, '');
  return clean.split(/\s+AND\s+/).every((part) => part.split(/\s+OR\s+/).some((id) => allowed.includes(id.replace(/^\(|\)$/g, '').trim())));
}
