import { CancelledError, assertSecureBaseUrl, type ProviderErrorCode } from '@/core/ai';
import type { ProviderProfile } from '@/core/ai/types';
import { DataError } from '@/data';
import type { AiAdapterId, AiOutputMode, AiProvider, AiProviderInput, AiProviderRepository, SettingsRepository } from '@/data';
import { SecretStoreError, type SecretStore } from '@/platform/secretStore';
import type { AiClient } from './aiClient';
import { SAMPLE_MEAL_JPEG_BASE64 } from './sampleMeal';

/** `setting` key that records the one-time "this photo will be sent to [provider]" notice (docs/12 section 4), per profile. */
export const noticeKey = (providerId: string): string => `ai_notice_ack.${providerId}`;

/** A profile as screens see it: whether a key is stored, never the key. */
export interface ProviderView extends AiProvider {
  hasKey: boolean;
}

/** What "Test connection" tells the screen. Only the code: the redacted detail stays inside `core/ai`. */
export type TestOutcome = { ok: true; outputMode: AiOutputMode } | { ok: false; code: ProviderErrorCode };

/** The form's current values, which may differ from what is saved. */
export interface ConnectionDraft {
  /** The saved profile being edited, if any; its stored key is used only while the base URL is unchanged. */
  id?: string;
  adapter: AiAdapterId;
  baseUrl: string;
  model: string;
  timeoutS: number;
  /** A key typed in the form. Wins over the stored one. */
  apiKey?: string | null;
}

export interface ProviderWrite {
  /** Stores this key under the profile id. Omit (or leave empty) to keep the stored one. */
  apiKey?: string | null;
  /** The outcome of a connection test to keep with the profile. */
  test?: TestOutcome | null;
}

export interface ProviderService {
  list(): Promise<ProviderView[]>;
  get(id: string): Promise<ProviderView | null>;
  /** Rejects with a `ProviderError` (`insecure_url`, `unknown`) for a base URL core refuses; nothing is stored then. */
  create(input: AiProviderInput & ProviderWrite): Promise<ProviderView>;
  /** Changing the base URL clears the stored key first (docs/06 section 6), unless a new key is given with it. */
  update(id: string, patch: Partial<AiProviderInput> & ProviderWrite): Promise<ProviderView>;
  removeKey(id: string): Promise<ProviderView>;
  /** Exactly one profile is active afterwards. */
  setActive(id: string): Promise<ProviderView>;
  /** Deletes the key first, then the profile and its notice mark. */
  remove(id: string): Promise<void>;
  testConnection(draft: ConnectionDraft, signal?: AbortSignal): Promise<TestOutcome>;
  /** Model identifiers to suggest, or null when the provider has no list or it could not be fetched. */
  listModels(draft: ConnectionDraft, signal?: AbortSignal): Promise<string[] | null>;
}

export interface ProviderServiceDeps {
  aiProviders: AiProviderRepository;
  settings: SettingsRepository;
  secrets: SecretStore;
  client: AiClient;
}

const MAX_SUGGESTIONS = 100;

function rethrowSafely(error: unknown): never {
  throw error instanceof SecretStoreError ? error : new SecretStoreError('failed', 'Secure storage did not complete the request.');
}

/** Trimmed, without trailing slashes: the form in which a base URL is stored and compared. */
export const normalizeBaseUrl = (url: string): string => url.trim().replace(/\/+$/, '');

export function createProviderService({ aiProviders, settings, secrets: store, client }: ProviderServiceDeps): ProviderService {
  // Writes to secure storage fail as a `SecretStoreError` that carries no cause: whatever the platform said could echo the key.
  const secrets = {
    ...store,
    has: (id: string) => store.has(id),
    get: (id: string) => store.get(id),
    set: (id: string, key: string) => store.set(id, key).catch(rethrowSafely),
    remove: (id: string) => store.remove(id).catch(rethrowSafely),
  };
  const hasKey = (id: string) => secrets.has(id).catch(() => false);
  const view = async (provider: AiProvider): Promise<ProviderView> => ({ ...provider, hasKey: await hasKey(provider.id) });
  const mustGet = async (id: string): Promise<AiProvider> => {
    const found = await aiProviders.get(id);
    if (!found) throw new DataError('not_found', `There is no AI provider with id "${id}".`);
    return found;
  };
  const record = (id: string, test: TestOutcome) =>
    aiProviders.recordTest(id, test.ok ? { result: 'ok', outputMode: test.outputMode } : { result: test.code, outputMode: null });

  /** The key a request for this draft may carry: the typed one, or the stored one only while the destination is the saved one. */
  async function keyFor(draft: ConnectionDraft): Promise<string | null> {
    if (draft.apiKey) return draft.apiKey;
    if (!draft.id) return null;
    const saved = await aiProviders.get(draft.id);
    if (!saved || normalizeBaseUrl(saved.baseUrl) !== normalizeBaseUrl(draft.baseUrl)) return null;
    return secrets.get(saved.id).catch(() => null);
  }

  const profileOf = (draft: ConnectionDraft): ProviderProfile => ({
    id: draft.id ?? 'draft',
    adapter: draft.adapter,
    baseUrl: normalizeBaseUrl(draft.baseUrl),
    model: draft.model.trim(),
    timeoutS: draft.timeoutS,
  });

  return {
    async list() {
      return Promise.all((await aiProviders.list()).map(view));
    },

    async get(id) {
      const found = await aiProviders.get(id);
      return found ? view(found) : null;
    },

    async create({ apiKey, test, ...input }) {
      const baseUrl = normalizeBaseUrl(input.baseUrl);
      assertSecureBaseUrl(baseUrl);
      const created = await aiProviders.create({ ...input, baseUrl });
      try {
        if (apiKey) await secrets.set(created.id, apiKey);
      } catch (error) {
        await aiProviders.remove(created.id); // no profile is left behind without the key the person typed
        throw error;
      }
      if (test) await record(created.id, test);
      return view((await aiProviders.get(created.id))!);
    },

    async update(id, { apiKey, test, ...patch }) {
      const current = await mustGet(id);
      let baseUrlChanged = false;
      if (patch.baseUrl !== undefined) {
        const baseUrl = normalizeBaseUrl(patch.baseUrl);
        assertSecureBaseUrl(baseUrl);
        patch = { ...patch, baseUrl };
        baseUrlChanged = baseUrl !== current.baseUrl;
      }
      // Key first: if this fails nothing else has changed, and the old key never sees the new address.
      if (baseUrlChanged) await secrets.remove(id);
      if (apiKey) await secrets.set(id, apiKey);
      await aiProviders.update(id, patch);
      if (baseUrlChanged) await settings.remove(noticeKey(id)); // the destination is new: the notice applies again
      if (test) await record(id, test);
      return view(await mustGet(id));
    },

    async removeKey(id) {
      const found = await mustGet(id);
      await secrets.remove(id);
      return view(found);
    },

    async setActive(id) {
      return view(await aiProviders.setActive(id));
    },

    async remove(id) {
      await secrets.remove(id);
      await aiProviders.remove(id);
      await settings.remove(noticeKey(id));
    },

    async testConnection(draft, signal) {
      const profile = profileOf(draft);
      const apiKey = await keyFor(draft);
      const outcome = await client.testConnection(profile, apiKey, { sampleImageJpegBase64: SAMPLE_MEAL_JPEG_BASE64, signal });
      if (outcome.ok) return { ok: true, outputMode: outcome.outputMode };
      return { ok: false, code: outcome.error.code };
    },

    async listModels(draft, signal) {
      try {
        const models = await client.listModels(profileOf(draft), await keyFor(draft), signal);
        if (!models) return null;
        const unique = [...new Set(models.map((m) => m.trim()).filter((m) => m !== ''))];
        return unique.length > 0 ? unique.slice(0, MAX_SUGGESTIONS) : null;
      } catch (error) {
        if (error instanceof CancelledError) throw error;
        return null; // a missing list is not an error: the model field stays free text
      }
    },
  };
}
