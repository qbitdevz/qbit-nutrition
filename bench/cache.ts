/// <reference types="node" />
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ScanResult } from '../src/core/ai';

export const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

/** Removes the secret (as typed and URL-encoded) from text about to be written to disk. */
export function scrub(text: string, secret: string | null): string {
  if (!secret) return text;
  const encoded = encodeURIComponent(secret);
  let out = text;
  for (const form of new Set([secret, encoded, encoded.replace(/%20/g, '+'), JSON.stringify(secret).slice(1, -1)])) {
    out = out.split(form).join('[redacted]');
  }
  return out;
}

/** Writes JSON after removing the secret from it. Every file the harness writes goes through here. */
export function writeJsonSafe(file: string, value: unknown, secret: string | null): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${scrub(JSON.stringify(value, null, 2), secret)}\n`, 'utf8');
}

export const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'x';

const Usage = z.object({ inputTokens: z.number(), outputTokens: z.number() });

/** What the model answered for one photo; provider and network failures are never cached. */
const CachedOutcome = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), result: ScanResult, usage: Usage.optional(), latencyMs: z.number(), repaired: z.boolean() }),
  z.object({ status: z.literal('no_food'), latencyMs: z.number() }),
  z.object({ status: z.literal('invalid_output'), latencyMs: z.number(), rawResponse: z.string().optional() }),
]);
export type CachedOutcome = z.infer<typeof CachedOutcome>;

export interface CacheKeyParts {
  imageHash: string;
  model: string;
  promptVersion: number;
  /** Anything else that changes the request: adapter, output mode, locale, hint. */
  variant: string;
}

export const cacheFileName = (k: CacheKeyParts): string =>
  `${k.imageHash.slice(0, 24)}__${slug(k.model)}__v${k.promptVersion}__${sha256(k.variant).slice(0, 12)}.json`;

/** Raw responses by image hash, model, and prompt version (plus the request variant). */
export class ResponseCache {
  constructor(
    private readonly dir: string,
    private readonly secret: string | null,
  ) {}

  get(key: CacheKeyParts): CachedOutcome | null {
    const file = path.join(this.dir, cacheFileName(key));
    if (!existsSync(file)) return null;
    try {
      const parsed = CachedOutcome.safeParse(JSON.parse(readFileSync(file, 'utf8')).outcome);
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // a damaged entry is treated as a miss and rewritten
    }
  }

  put(key: CacheKeyParts, outcome: CachedOutcome): void {
    writeJsonSafe(
      path.join(this.dir, cacheFileName(key)),
      { model: key.model, promptVersion: key.promptVersion, imageHash: key.imageHash, outcome },
      this.secret,
    );
  }
}
