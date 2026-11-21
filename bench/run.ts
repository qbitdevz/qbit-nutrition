/// <reference types="node" />
import type { FetchLike } from '../src/core/ai';
import { ConfigError, USAGE, parseConfig } from './config';
import { DatasetError } from './dataset';
import { runBenchmark } from './harness';

/** `npx tsx bench/run.ts --adapter ... --base-url ... --model ...` (see bench/README.md). */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  try {
    const config = parseConfig(args, process.env);
    if (!config.apiKey && !config.offline) {
      console.warn(`Warning: ${config.keyEnvName} is not set; sending requests without a key.`);
    }
    await runBenchmark(config, { fetch: fetch as unknown as FetchLike });
    return 0;
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    if (error instanceof DatasetError) {
      console.error(error.message);
      return 2;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}
