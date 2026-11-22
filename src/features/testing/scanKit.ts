/**
 * Test-only: a provider profile with a key in the test secret store, the scan use case wired the way
 * the app wires it, and canned provider replies. Never import this from app code.
 */
import { SAMPLE_JPEG_BASE64, fakeFetch, openaiText, res, validScanResult, type Responder } from '@/core/ai/__fixtures__/fixtures';
import type { Harness } from '@/data/testing/harness';
import { createFakeScanPlatform, type FakeScanPlatform } from '@/platform/fakeScanPlatform';
import { createTestServices } from './testServices';

export const KEY = 'sk-SCANTEST-0123456789abcdef';
export const PROVIDER_URL = 'https://llm.example.test/v1';

export const okReply = (result: unknown = validScanResult) => res(200, openaiText(JSON.stringify(result)));

export interface ScanKit {
  services: ReturnType<typeof createTestServices>;
  platform: FakeScanPlatform;
  fetch: ReturnType<typeof fakeFetch>;
  providerId: string;
}

/** Services over the harness with an active profile and a stored key; `responders` are what the fake provider answers, in order. */
export async function createScanKit(h: Harness, responders: Responder[] = [okReply()], options: { provider?: boolean; baseUrl?: string } = {}): Promise<ScanKit> {
  const fetch = fakeFetch(...responders);
  const services = createTestServices(h, { fetch: fetch.fetch });
  const platform = createFakeScanPlatform();
  let providerId = '';
  if (options.provider !== false) {
    const provider = await h.repos.aiProviders.create({
      label: 'Test provider',
      preset: null,
      adapter: 'openai_compatible',
      baseUrl: options.baseUrl ?? PROVIDER_URL,
      model: 'test-model',
      timeoutS: 30,
    });
    await services.secrets.set(provider.id, KEY);
    providerId = provider.id;
  }
  return { services, platform, fetch, providerId };
}

export { SAMPLE_JPEG_BASE64, validScanResult };
