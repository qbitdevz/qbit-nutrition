import { ProviderError } from '../errors';
import type { AdapterId, ProviderAdapter } from '../types';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { openaiCompatibleAdapter } from './openai';

const ADAPTERS: Record<AdapterId, ProviderAdapter> = {
  openai_compatible: openaiCompatibleAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
};

export function getAdapter(id: AdapterId): ProviderAdapter {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new ProviderError('unknown', { detail: `Unknown adapter "${String(id)}".` });
  return adapter;
}

export { anthropicAdapter, geminiAdapter, openaiCompatibleAdapter };
