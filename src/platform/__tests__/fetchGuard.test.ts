/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../..');
/** The one file that hands the device fetch to the two network clients (each wraps it in the redirect-safe wrapper). */
const WIRING = 'features/startup/openServicesCore.ts';
/** The file that defines the device fetch; it may import `expo/fetch`. */
const DEFINITION = 'platform/deviceFetch.ts';
const REDIRECT_DEFINITION = 'platform/safeFetch.ts';
/**
 * The two legitimate network destinations and the one place each is wired (S9, S10): the AI provider the person
 * configured (`createAiClient`) and Open Food Facts for barcodes (`createBarcodeClient`). Each wraps the fetch it is given
 * in `createRedirectSafeFetch`; nothing else may build a client, wrap a fetch, or take one.
 */
const CLIENT_WIRING = ['features/settings/aiClient.ts', 'features/barcode/barcodeClient.ts'];
/** What those wiring points build with the fetch, and where. Only that file may call each. */
const CLIENT_BUILDERS: Record<string, string> = {
  createVisionGateway: 'features/settings/aiClient.ts',
  createOpenFoodFactsClient: 'features/barcode/barcodeClient.ts',
};
/** Where a `FetchLike` (a function that reaches the network) may be named: the clients, the platform, the startup that hands it over, and development fakes. */
const MAY_TAKE_A_FETCH: RegExp[] = [
  /^core\/ai\//,
  /^core\/barcode\//,
  /^platform\//,
  /^features\/startup\/(openServicesCore|aiServices)\.ts$/,
  /^features\/[a-z]+\/dev\//,
  ...CLIENT_WIRING.map((wiring) => new RegExp(`^${wiring.replace(/\./g, '\\.')}$`)),
];

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** What a file does that could reach the network without the redirect-safe wrapper, or beside the two wiring points. Empty when clean. */
function fetchViolations(relativePath: string, source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  if (relativePath !== DEFINITION && /['"]expo\/fetch['"]/.test(code)) found.push('imports expo/fetch');
  if (relativePath !== DEFINITION && relativePath !== WIRING && /deviceFetch/.test(code)) found.push('uses the device fetch');
  if (/(^|[^.\w$])fetch\s*\(/.test(code)) found.push('calls the global fetch');
  if (/\b(globalThis|window|global|self)\s*\.\s*fetch\b/.test(code)) found.push('reads the global fetch');
  if (/\bXMLHttpRequest\b/.test(code)) found.push('uses XMLHttpRequest');
  if (/from\s+['"](axios|node-fetch|cross-fetch|undici)['"]/.test(code)) found.push('imports an HTTP client');

  // A third caller: anything that wraps a fetch itself, builds one of the two clients, or takes a fetch of its own.
  const wrapperOwner = CLIENT_WIRING.includes(relativePath) || relativePath === REDIRECT_DEFINITION || relativePath.startsWith('platform/');
  if (!wrapperOwner && /\bcreateRedirectSafeFetch\b/.test(code)) found.push('wraps a fetch itself');
  for (const [builder, home] of Object.entries(CLIENT_BUILDERS)) {
    if (relativePath !== home && !relativePath.startsWith('core/') && new RegExp(`\\b${builder}\\s*\\(`).test(code)) found.push(`builds a network client (${builder})`);
  }
  if (!MAY_TAKE_A_FETCH.some((pattern) => pattern.test(relativePath)) && /\bFetchLike\b/.test(code)) found.push('takes a fetch of its own');
  return found;
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' || name === 'testing' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const relativeSources = () => sources(SRC).map((file) => ({ file, relative: path.relative(SRC, file).split(path.sep).join('/') }));

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
    expect(fetchViolations('core/barcode/offClient.ts', 'await options.fetch(url, init);')).toEqual([]);
    expect(fetchViolations(WIRING, "import { deviceFetch } from '@/platform/deviceFetch';")).toEqual([]);
    expect(fetchViolations(DEFINITION, "import { fetch as expoFetch } from 'expo/fetch';")).toEqual([]);
  });

  it('catches a third caller: a new client, a second wrapper, or a function that takes a fetch', () => {
    // A new feature that "just needs a request" has to be added to this guard on purpose, not by accident.
    expect(fetchViolations('features/sync/syncClient.ts', "import { createRedirectSafeFetch } from '@/platform/safeFetch';\nconst f = createRedirectSafeFetch(base);")).toContain('wraps a fetch itself');
    expect(fetchViolations('features/sync/syncClient.ts', 'const client = createOpenFoodFactsClient({ fetch, userAgent });')).toContain('builds a network client (createOpenFoodFactsClient)');
    expect(fetchViolations('features/sync/syncClient.ts', 'const gateway = createVisionGateway({ fetch });')).toContain('builds a network client (createVisionGateway)');
    expect(fetchViolations('features/sync/syncClient.ts', "import type { FetchLike } from '@/core/ai/types';")).toContain('takes a fetch of its own');
    expect(fetchViolations('core/sync/client.ts', 'export function make(fetch: FetchLike) {}')).toContain('takes a fetch of its own');
    // The two wiring points are clean ...
    expect(fetchViolations('features/barcode/barcodeClient.ts', 'createOpenFoodFactsClient({ fetch: createRedirectSafeFetch(fetch) }); const x: FetchLike = y;')).toEqual([]);
    expect(fetchViolations('features/settings/aiClient.ts', 'createVisionGateway({ fetch: createRedirectSafeFetch(fetch) }); const x: FetchLike = y;')).toEqual([]);
    // ... but neither may build the other's client.
    expect(fetchViolations('features/settings/aiClient.ts', 'createOpenFoodFactsClient({ fetch: f });')).toContain('builds a network client (createOpenFoodFactsClient)');
    expect(fetchViolations('features/barcode/barcodeClient.ts', 'createVisionGateway({ fetch: f });')).toContain('builds a network client (createVisionGateway)');
  });

  it('exactly two wiring points reach the network, each through the redirect-refusing wrapper, fed by one startup file', () => {
    for (const wiring of CLIENT_WIRING) {
      expect(stripComments(readFileSync(path.join(SRC, wiring), 'utf8'))).toMatch(/createRedirectSafeFetch\(/);
    }
    // Which files outside core and platform hold a builder or the wrapper: those two, and no other.
    const holders = relativeSources()
      .filter(({ relative }) => !relative.startsWith('platform/') && !relative.startsWith('core/'))
      .filter(({ file }) => /\b(createRedirectSafeFetch|createVisionGateway|createOpenFoodFactsClient)\s*\(/.test(stripComments(readFileSync(file, 'utf8'))))
      .map(({ relative }) => relative);
    expect(holders.sort()).toEqual([...CLIENT_WIRING].sort());
    // The device fetch is handed over in one place, to both clients.
    const startup = stripComments(readFileSync(path.join(SRC, WIRING), 'utf8'));
    expect(startup).toMatch(/createAiServices\(/);
    expect(startup).toMatch(/createBarcodeClient\(/);
  });

  it('the food table import (S6, RN-03) is a third place that must stay offline: its files name no network, no fetch type and no HTTP client', () => {
    const files = relativeSources().filter(({ relative }) => relative.startsWith('features/foodimport/'));
    // The guard really looks at the folder: it has the reader, the mapping, the service and the screens.
    expect(files.map(({ relative }) => relative)).toEqual(expect.arrayContaining(['features/foodimport/readFile.ts', 'features/foodimport/importService.ts', 'features/foodimport/ImportTableScreen.tsx']));
    const offenders = files.flatMap(({ file, relative }) => {
      const code = stripComments(readFileSync(file, 'utf8'));
      const found = fetchViolations(relative, code);
      if (/https?:\/\/|WebSocket|navigator\.sendBeacon|expo-network/.test(code)) found.push('names a network address or API');
      if (/\bfrom\s+['"](\.\.\/)+(core\/(ai|barcode)|features\/(barcode|settings\/aiClient))/.test(code)) found.push('imports a network client');
      return found.map((v) => `${relative}: ${v}`);
    });
    expect(offenders).toEqual([]);
  });

  it('nothing under src/ except the wiring point imports the device fetch or calls the global fetch', () => {
    const offenders = relativeSources().flatMap(({ file, relative }) => fetchViolations(relative, readFileSync(file, 'utf8')).map((v) => `${relative}: ${v}`));
    expect(offenders).toEqual([]);
  });
});
