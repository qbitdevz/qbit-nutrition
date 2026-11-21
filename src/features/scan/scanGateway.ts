import type { AnalyzeInput, AnalyzeOutput } from '@/core/ai/types';
import type { AiProvider, AiProviderRepository, SettingsRepository } from '@/data';
import type { SecretStore } from '@/platform/secretStore';
import type { AiClient } from '../settings/aiClient';
import { noticeKey } from '../settings/providerService';

export class ScanSetupError extends Error {
  readonly code = 'no_provider' as const;
  constructor() {
    super('No AI provider is active.');
    this.name = 'ScanSetupError';
  }
}

export interface ScanGateway {
  /** The profile a scan would use, without its key; null when none is active. */
  activeProvider(): Promise<AiProvider | null>;
  /**
   * Analyzes one photo with the active profile: reads its key from secure storage and calls
   * `core/ai` with the redirect-safe fetch. Rejects with `ScanSetupError` when no profile is active, with
   * a `ProviderError` for provider failures, `NoFoodDetectedError` for "no food", `CancelledError` on abort.
   */
  analyze(input: Omit<AnalyzeInput, 'profile' | 'apiKey'>): Promise<AnalyzeOutput>;
  /** Whether the one-time "this photo will be sent to [provider]" notice was acknowledged for this profile (docs/12 section 4). */
  noticeAcknowledged(providerId: string): Promise<boolean>;
  acknowledgeNotice(providerId: string): Promise<void>;
}

export interface ScanGatewayDeps {
  aiProviders: AiProviderRepository;
  settings: SettingsRepository;
  secrets: SecretStore;
  client: AiClient;
  now?: () => Date;
}

export function createScanGateway({ aiProviders, settings, secrets, client, now = () => new Date() }: ScanGatewayDeps): ScanGateway {
  return {
    activeProvider: () => aiProviders.getActive(),

    async analyze(input) {
      const active = await aiProviders.getActive();
      if (!active) throw new ScanSetupError();
      const apiKey = await secrets.get(active.id);
      return client.analyzeMeal({
        ...input,
        apiKey,
        profile: {
          id: active.id,
          adapter: active.adapter,
          baseUrl: active.baseUrl,
          model: active.model,
          outputMode: active.outputMode ?? undefined,
          timeoutS: active.timeoutS,
        },
      });
    },

    async noticeAcknowledged(providerId) {
      return (await settings.get(noticeKey(providerId))) !== null;
    },

    async acknowledgeNotice(providerId) {
      await settings.set(noticeKey(providerId), now().toISOString());
    },
  };
}
