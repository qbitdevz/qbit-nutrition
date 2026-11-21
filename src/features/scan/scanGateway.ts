import type { SuggestInput, SuggestOutput } from '@/core/ai';
import type { AnalyzeInput, AnalyzeOutput, ProviderProfile } from '@/core/ai/types';
import type { AiProvider, AiProviderRepository, SettingsRepository } from '@/data';
import { SecretStoreError, type SecretStore } from '@/platform/secretStore';
import type { AiClient } from '../settings/aiClient';
import { noticeKey, suggestNoticeKey } from '../settings/providerService';

export class ScanSetupError extends Error {
  readonly code: 'no_provider' | 'provider_changed';
  constructor(code: 'no_provider' | 'provider_changed' = 'no_provider') {
    super(code === 'no_provider' ? 'No AI provider is active.' : 'The AI provider changed while the scan was starting.');
    this.name = 'ScanSetupError';
    this.code = code;
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
  /**
   * Asks the active profile for food suggestions (S6): a text-only request carrying the remaining numbers, the goal type and
   * the locale, and nothing else. Same key handling as `analyze`; rejects with `ScanSetupError` when no profile is active,
   * `NothingToSuggestError` (no request made) when almost nothing is left, a `ProviderError` for provider failures.
   */
  suggest(input: Omit<SuggestInput, 'profile' | 'apiKey'>): Promise<SuggestOutput>;
  /** Whether the one-time "these numbers will be sent to [provider]" notice for suggestions was acknowledged for this profile. */
  suggestNoticeAcknowledged(providerId: string): Promise<boolean>;
  acknowledgeSuggestNotice(providerId: string): Promise<void>;
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
  // A storage failure surfaces as a SecretStoreError without the platform's own error (it could echo the key).
  const readKey = (id: string) =>
    secrets.get(id).catch((error: unknown) => {
      throw error instanceof SecretStoreError ? error : new SecretStoreError('failed', 'Secure storage did not complete the request.');
    });
  /** Reads the active profile and its key, and runs `send` with them only if the pair is still trustworthy afterwards. */
  async function withActiveProfile<T>(send: (profile: ProviderProfile, apiKey: string | null) => Promise<T>): Promise<T> {
    const active = await aiProviders.getActive();
    if (!active) throw new ScanSetupError();
    const apiKey = await readKey(active.id);
    // A key may only go to the URL it was entered for. The service changes a profile in an order that
    // keeps the two paired (key removed, row updated, new key stored), so the pair is trustworthy only if
    // the profile and the key read here are unchanged when read again afterwards. Re-reading the key
    // as well closes the case of the URL being changed away and back while this ran.
    const again = await aiProviders.get(active.id);
    if (!again || !again.isActive || again.baseUrl !== active.baseUrl || again.adapter !== active.adapter) {
      throw new ScanSetupError('provider_changed');
    }
    if ((await readKey(active.id)) !== apiKey) throw new ScanSetupError('provider_changed');
    return send(
      {
        id: again.id,
        adapter: again.adapter,
        baseUrl: again.baseUrl,
        model: again.model,
        outputMode: again.outputMode ?? undefined,
        timeoutS: again.timeoutS,
      },
      apiKey,
    );
  }

  return {
    activeProvider: () => aiProviders.getActive(),

    analyze: (input) => withActiveProfile((profile, apiKey) => client.analyzeMeal({ ...input, apiKey, profile })),

    suggest: (input) => withActiveProfile((profile, apiKey) => client.suggestFoods({ ...input, apiKey, profile })),

    async noticeAcknowledged(providerId) {
      return (await settings.get(noticeKey(providerId))) !== null;
    },

    async acknowledgeNotice(providerId) {
      await settings.set(noticeKey(providerId), now().toISOString());
    },

    async suggestNoticeAcknowledged(providerId) {
      return (await settings.get(suggestNoticeKey(providerId))) !== null;
    },

    async acknowledgeSuggestNotice(providerId) {
      await settings.set(suggestNoticeKey(providerId), now().toISOString());
    },
  };
}
