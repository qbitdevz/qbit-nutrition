/// <reference types="node" />
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { AdapterId, OutputMode } from '../src/core/ai';
import type { BenchConfig } from './types';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const ADAPTERS: readonly AdapterId[] = ['openai_compatible', 'anthropic', 'gemini'];
const OUTPUT_MODES: readonly OutputMode[] = ['schema', 'tool', 'prompt'];
const DEFAULT_KEY_ENV = 'BENCH_API_KEY';

export const USAGE = `Usage: npx tsx bench/run.ts --adapter <id> --base-url <url> --model <id> [options]

Provider (no defaults; each may come from a flag or an environment variable):
  --adapter <openai_compatible|anthropic|gemini>   or BENCH_ADAPTER
  --base-url <url>                                 or BENCH_BASE_URL
  --model <id>                                     or BENCH_MODEL
  --key-env <NAME>      name of the environment variable that holds the API key
                        (default name: ${DEFAULT_KEY_ENV}; unset means no key, for local servers)
  --output-mode <schema|tool|prompt>   force an output mode (default: the adapter's strongest)

Run:
  --subset <all|smoke>  smoke = at most 15 meals spread across categories (default: all)
  --delay-ms <n>        pause between provider calls (default: 0)
  --timeout-s <n>       per-request timeout in seconds (default: 60)
  --offline             score from the cache only; make no provider call
  --data <dir>          meals folder (default: bench/data/meals)
  --catalog <file>      catalog database (default: catalog-build/catalog.db)
  --cache-dir <dir>     raw response cache (default: bench/.cache)
  --out-dir <dir>       results folder (default: bench/results)
  --max-image-bytes <n> reject larger photos (default: 1048576)
`;

function number(name: string, text: string | undefined, fallback: number, min: number): number {
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isFinite(value) || value < min) {
    throw new ConfigError(`--${name} must be a number >= ${min}, got "${text}".`);
  }
  return value;
}

/** Builds the run configuration from CLI flags and environment variables only. */
export function parseConfig(argv: readonly string[], env: Record<string, string | undefined>, cwd = process.cwd()): BenchConfig {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        adapter: { type: 'string' },
        'base-url': { type: 'string' },
        model: { type: 'string' },
        'key-env': { type: 'string' },
        'output-mode': { type: 'string' },
        subset: { type: 'string' },
        'delay-ms': { type: 'string' },
        'timeout-s': { type: 'string' },
        offline: { type: 'boolean' },
        data: { type: 'string' },
        catalog: { type: 'string' },
        'cache-dir': { type: 'string' },
        'out-dir': { type: 'string' },
        'max-image-bytes': { type: 'string' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    throw new ConfigError((error as Error).message);
  }

  const adapter = values.adapter ?? env.BENCH_ADAPTER;
  const baseUrl = values['base-url'] ?? env.BENCH_BASE_URL;
  const model = values.model ?? env.BENCH_MODEL;
  if (!adapter) throw new ConfigError('Missing --adapter (or BENCH_ADAPTER). There is no default provider.');
  if (!ADAPTERS.includes(adapter as AdapterId)) {
    throw new ConfigError(`Unknown adapter "${adapter}". Use one of: ${ADAPTERS.join(', ')}.`);
  }
  if (!baseUrl) throw new ConfigError('Missing --base-url (or BENCH_BASE_URL). There is no default base URL.');
  if (!model) throw new ConfigError('Missing --model (or BENCH_MODEL). There is no default model.');

  const subset = values.subset ?? 'all';
  if (subset !== 'all' && subset !== 'smoke') throw new ConfigError(`--subset must be "all" or "smoke", got "${subset}".`);
  const outputMode = values['output-mode'];
  if (outputMode !== undefined && !OUTPUT_MODES.includes(outputMode as OutputMode)) {
    throw new ConfigError(`--output-mode must be one of: ${OUTPUT_MODES.join(', ')}.`);
  }

  const keyEnvName = values['key-env'] ?? env.BENCH_KEY_ENV ?? DEFAULT_KEY_ENV;
  const key = env[keyEnvName];
  const at = (flag: string | undefined, fallback: string) => path.resolve(cwd, flag ?? fallback);

  return {
    adapter: adapter as AdapterId,
    baseUrl,
    model,
    apiKey: key ? key : null,
    keyEnvName,
    dataDir: at(values.data, 'bench/data/meals'),
    catalogPath: at(values.catalog, 'catalog-build/catalog.db'),
    cacheDir: at(values['cache-dir'], 'bench/.cache'),
    outDir: at(values['out-dir'], 'bench/results'),
    subset,
    delayMs: number('delay-ms', values['delay-ms'], 0, 0),
    timeoutS: number('timeout-s', values['timeout-s'], 60, 1),
    ...(outputMode ? { outputMode: outputMode as OutputMode } : {}),
    maxImageBytes: number('max-image-bytes', values['max-image-bytes'], 1_048_576, 1),
    offline: values.offline === true,
  };
}
