/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../..');
/** The one file that hands the device fetch to the AI services (`createAiClient` then wraps it). */
const WIRING = 'features/startup/openServicesCore.ts';
/** The file that defines the device fetch; it may import `expo/fetch`. */
const DEFINITION = 'platform/deviceFetch.ts';

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** What a file does that could reach a provider without the redirect-safe wrapper. Empty when clean. */
function fetchViolations(relativePath: string, source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  if (relativePath !== DEFINITION && /['"]expo\/fetch['"]/.test(code)) found.push('imports expo/fetch');
  if (relativePath !== DEFINITION && relativePath !== WIRING && /deviceFetch/.test(code)) found.push('uses the device fetch');
  if (/(^|[^.\w$])fetch\s*\(/.test(code)) found.push('calls the global fetch');
  if (/\b(globalThis|window|global|self)\s*\.\s*fetch\b/.test(code)) found.push('reads the global fetch');
  if (/\bXMLHttpRequest\b/.test(code)) found.push('uses XMLHttpRequest');
  if (/from\s+['"](axios|node-fetch|cross-fetch|undici)['"]/.test(code)) found.push('imports an HTTP client');
  return found;
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' || name === 'testing' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('no unwrapped network access (S10)', () => {
  it('the checker catches each way around the wrapper', () => {
    expect(fetchViolations('features/scan/x.ts', "import { fetch } from 'expo/fetch';")).toContain('imports expo/fetch');
    expect(fetchViolations('features/scan/x.ts', "import { deviceFetch } from '@/platform/deviceFetch';")).toContain('uses the device fetch');
    expect(fetchViolations('features/scan/x.ts', 'await fetch(url, init);')).toContain('calls the global fetch');
    expect(fetchViolations('features/scan/x.ts', 'const f = globalThis.fetch;')).toContain('reads the global fetch');
    expect(fetchViolations('features/scan/x.ts', 'new XMLHttpRequest();')).toContain('uses XMLHttpRequest');
    expect(fetchViolations('features/scan/x.ts', "import axios from 'axios';")).toContain('imports an HTTP client');
  });

  it('the checker ignores comments and member calls such as deps.fetch(...)', () => {
    expect(fetchViolations('core/ai/http.ts', 'deps.fetch(url); // fetch(x)\n/* expo/fetch fetch( */')).toEqual([]);
    expect(fetchViolations(WIRING, "import { deviceFetch } from '@/platform/deviceFetch';")).toEqual([]);
    expect(fetchViolations(DEFINITION, "import { fetch as expoFetch } from 'expo/fetch';")).toEqual([]);
  });

  it('nothing under src/ except the wiring point imports the device fetch or calls the global fetch', () => {
    const offenders = sources(SRC).flatMap((file) => {
      const relative = path.relative(SRC, file).split(path.sep).join('/');
      return fetchViolations(relative, readFileSync(file, 'utf8')).map((v) => `${relative}: ${v}`);
    });
    expect(offenders).toEqual([]);
  });
});
