import { CancelledError, assertSecureBaseUrl, type ProviderErrorCode } from '@/core/ai';
import type { ProviderProfile } from '@/core/ai/types';
import { DataError } from '@/data';
import type { AiAdapterId, AiOutputMode, AiProvider, AiProviderInput, AiProviderRepository, SettingsRepository } from '@/data';
import { SecretStoreError, type SecretStore } from '@/platform/secretStore';
import type { AiClient } from './aiClient';
import { SAMPLE_MEAL_JPEG_BASE64 } from './sampleMeal';

/** `setting` key that records the one-time "this photo will be sent to [provider]" notice (docs/12 section 4), per profile. */
export const noticeKey = (providerId: string): string => `ai_notice_ack.${providerId}`;
/** `setting` key of the one-time "these numbers will be sent to [provider]" notice before food suggestions (S6, S9), per profile. */
export const suggestNoticeKey = (providerId: string): string => `notice_ack.suggest.${providerId}`;

/**
 * `setting` key that marks a profile as imported from a file and not yet looked at by the person. It exists only on this installation:
 * it is never exported, and a file cannot carry it (`settingsPolicy.ts`).
 */
export const importedKey = (providerId: string): string => `ai_imported.${providerId}`;

/** An imported profile that has not been confirmed was asked to do something that needs the person to have looked at its address first. */
export class ProviderNotConfirmedError extends Error {
  readonly code = 'not_confirmed' as const;
  constructor() {
    super('This profile was imported and has not been confirmed.');
    this.name = 'ProviderNotConfirmedError';
  }
}

/** Some keys could not be removed, or the secure store could not be listed so that keys without a profile could not be looked for. */
export class KeysNotRemovedError extends Error {
  readonly code = 'keys_not_removed' as const;
  constructor(
    /** Keys that were tried and could not be removed. */
    readonly failed: number,
    /** True when the store could not be read for what it holds (not merely "unavailable"). */
    readonly unlistable: boolean,
  ) {
    super('Some AI provider keys could not be removed.');
    this.name = 'KeysNotRemovedError';
  }
}

/** A profile as screens see it: whether a key is stored, never the key. */
export interface ProviderView extends AiProvider {
  hasKey: boolean;
  /** Came from an import and has not been confirmed: it is never active, and takes no key, until it is. */
  imported: boolean;
}

/** What "Test connection" tells the screen. Only the code: the redacted detail stays inside `core/ai`. */
export type TestOutcome = { ok: true; outputMode: AiOutputMode } | { ok: false; code: ProviderErrorCode | 'key_storage' };

/** What a save returns: the profile, and whether the test result that came with it could be kept (the save itself succeeded either way). */
export type SaveResult = ProviderView & { testRecorded: boolean };

/**
 * A create that did not finish cleanly and could not be undone: the profile exists (`provider`) without
 * its key. The form switches to editing that profile, so a retry cannot duplicate it.
 */
export class ProviderSaveError extends Error {
  readonly code = 'key_failed' as const;
  readonly provider: ProviderView | null;
  constructor(provider: ProviderView | null) {
    super('The provider was saved without its key.');
    this.name = 'ProviderSaveError';
    this.provider = provider;
  }
}

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
  create(input: AiProviderInput & ProviderWrite): Promise<SaveResult>;
  /** Changing the base URL clears the stored key first (docs/06 section 6), unless a new key is given with it. */
  update(id: string, patch: Partial<AiProviderInput> & ProviderWrite): Promise<SaveResult>;
  removeKey(id: string): Promise<ProviderView>;
  /** The person looked at the imported profile's address and accepts it: from now on it behaves like any other profile. */
  confirmImported(id: string): Promise<ProviderView>;
  /**
   * Removes the stored keys of these profile ids, whether or not a profile row still exists (an import or a
   * delete-all clears keys that no longer have a row). Tries every id, then fails with a `SecretStoreError`
   * if any removal failed.
   */
  removeKeys(ids: readonly string[]): Promise<void>;
  /**
   * Removes every stored key: those of the profiles, and those tracked by the secure store whose profile is gone. Tries all, then
   * rejects with `KeysNotRemovedError` (how many failed; whether the store could not be listed). A store that is "unavailable" cannot hold
   * a key, so it is nothing to delete and does not block.
   */
  removeAllKeys(): Promise<void>;
  /**
   * Removes the keys whose profile no longer exists (left by an import, a crash, or a failed removal). First adopts the
   * keys of existing profiles that the secure store did not track yet (stored by an older version). Returns how many were removed.
   */
  removeOrphanKeys(): Promise<number>;
  /**
   * A test for "does this text contain a stored key?" (the key as typed, URL-encoded, or percent-encoded as a URL), built from the keys
   * of every profile. The keys stay inside the function: nothing can read one back through it. Rejects if a key cannot be read, so a
   * caller never proceeds on the assumption that nothing leaks.
   */
  keyMatcher(): Promise<(text: string) => boolean>;
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
const MIN_KEY_LENGTH = 6;

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
    get: (id: string) => store.get(id).catch(rethrowSafely),
    set: (id: string, key: string) => store.set(id, key).catch(rethrowSafely),
    remove: (id: string) => store.remove(id).catch(rethrowSafely),
  };
  const hasKey = (id: string) => secrets.has(id).catch(() => false);
  const view = async (provider: AiProvider): Promise<ProviderView> => ({
    ...provider,
    hasKey: await hasKey(provider.id),
    imported: (await settings.get(importedKey(provider.id)).catch(() => null)) !== null,
  });
  const isImported = async (id: string | undefined): Promise<boolean> => id !== undefined && (await settings.get(importedKey(id))) !== null;
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
    // A storage failure is not "no key": it propagates as a SecretStoreError (the caller says so).
    const key = await secrets.get(saved.id);
    // The key and the URL are changed in an order that keeps them paired; confirm they still are.
    const again = await aiProviders.get(saved.id);
    if (!again || normalizeBaseUrl(again.baseUrl) !== normalizeBaseUrl(saved.baseUrl)) return null;
    return key;
  }

  /** Records a test result without letting that failure undo or misreport a save that worked. */
  const recordSafely = (id: string, test: TestOutcome | null | undefined) =>
    test ? record(id, test).then(() => true, () => false) : Promise.resolve(true);

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
      if (apiKey) {
        try {
          await secrets.set(created.id, apiKey);
        } catch (error) {
          // A half-written key is removed, and so is the row: no profile is left without the key the person typed.
          await store.remove(created.id).catch(() => undefined);
          const undone = await aiProviders.remove(created.id).then(() => true, () => false);
          if (undone) throw error;
          // The row is still there: say so, so that the next save edits it instead of creating a second one.
          throw new ProviderSaveError(await view((await aiProviders.get(created.id)) ?? created).catch(() => null));
        }
      }
      const testRecorded = await recordSafely(created.id, test);
      return { ...(await view((await aiProviders.get(created.id))!)), testRecorded };
    },

    async update(id, { apiKey, test, ...patch }) {
      const current = await mustGet(id);
      // A key may only be entered for an address the person has looked at.
      if (apiKey && (await isImported(id))) throw new ProviderNotConfirmedError();
      let baseUrlChanged = false;
      if (patch.baseUrl !== undefined) {
        const baseUrl = normalizeBaseUrl(patch.baseUrl);
        assertSecureBaseUrl(baseUrl);
        patch = { ...patch, baseUrl };
        baseUrlChanged = baseUrl !== current.baseUrl;
      }
      // A key is never stored for a URL it was not entered for, at any moment: the old key goes first, the
      // row changes next, and the new key is stored last. If a step fails, the later ones do not run.
      if (baseUrlChanged) await secrets.remove(id);
      await aiProviders.update(id, patch);
      if (baseUrlChanged) {
        // the destination is new: both notices apply again
        await settings.remove(noticeKey(id));
        await settings.remove(suggestNoticeKey(id));
      }
      if (apiKey) {
        const hadKey = !baseUrlChanged && (await hasKey(id));
        try {
          await secrets.set(id, apiKey);
        } catch (error) {
          if (!hadKey) await store.remove(id).catch(() => undefined); // never leave a half-written key
          throw error;
        }
      }
      const testRecorded = await recordSafely(id, test);
      return { ...(await view(await mustGet(id))), testRecorded };
    },

    async removeKey(id) {
      const found = await mustGet(id);
      await secrets.remove(id);
      return view(found);
    },

    async removeKeys(ids) {
      let failure: unknown = null;
      for (const id of new Set(ids)) {
        try {
          await secrets.remove(id);
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
    },

    async removeAllKeys() {
      const rowIds = (await aiProviders.list()).map((p) => p.id);
      let listed: string[] = [];
      let unlistable = false;
      try {
        listed = await store.list();
      } catch (error) {
        // "Unavailable" means there is no secure storage on this device (the web preview): it holds no key, so there is nothing to find.
        unlistable = !(error instanceof SecretStoreError && error.code === 'unavailable');
      }
      let failed = 0;
      for (const id of new Set([...rowIds, ...listed])) {
        try {
          await secrets.remove(id);
        } catch {
          failed += 1;
        }
      }
      if (failed > 0 || unlistable) throw new KeysNotRemovedError(failed, unlistable);
    },

    async removeOrphanKeys() {
      // The keys are listed FIRST and the profiles read AFTER: a profile created in between has a row by the time the rows are read, so
      // its key is never taken for an orphan. (The other order would delete the key of a profile created between the two reads.)
      const tracked = await store.list();
      const rowIds = new Set((await aiProviders.list()).map((p) => p.id));
      await store.track([...rowIds]);
      const orphans = tracked.filter((id) => !rowIds.has(id));
      let failure: unknown = null;
      for (const id of orphans) {
        try {
          await secrets.remove(id);
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
      return orphans.length;
    },

    async keyMatcher() {
      const ids = new Set([...(await aiProviders.list()).map((p) => p.id), ...(await store.list())]);
      const forms: string[] = [];
      for (const id of ids) {
        const key = await secrets.get(id);
        // Same floor as `redact` in core/ai: a shorter "key" is not a key, and would match ordinary words.
        if (key && key.length >= MIN_KEY_LENGTH) forms.push(key, encodeURIComponent(key), encodeURI(key));
      }
      return (text) => forms.some((form) => text.includes(form));
    },

    async confirmImported(id) {
      await mustGet(id);
      await settings.remove(importedKey(id));
      return view(await mustGet(id));
    },

    async setActive(id) {
      if (await isImported(id)) throw new ProviderNotConfirmedError();
      return view(await aiProviders.setActive(id));
    },

    async remove(id) {
      await secrets.remove(id);
      await aiProviders.remove(id);
      await settings.remove(noticeKey(id));
      await settings.remove(suggestNoticeKey(id));
      await settings.remove(importedKey(id));
    },

    async testConnection(draft, signal) {
      if (draft.apiKey && (await isImported(draft.id))) throw new ProviderNotConfirmedError();
      const profile = profileOf(draft);
      let apiKey: string | null;
      try {
        apiKey = await keyFor(draft);
      } catch (error) {
        if (error instanceof SecretStoreError) return { ok: false, code: 'key_storage' };
        throw error;
      }
      const outcome = await client.testConnection(profile, apiKey, { sampleImageJpegBase64: SAMPLE_MEAL_JPEG_BASE64, signal });
      if (outcome.ok) return { ok: true, outputMode: outcome.outputMode };
      return { ok: false, code: outcome.error.code };
    },

    async listModels(draft, signal) {
      if (draft.apiKey && (await isImported(draft.id))) throw new ProviderNotConfirmedError();
      try {
        const apiKey = await keyFor(draft); // a SecretStoreError propagates: no list is fetched without the key
        const models = await client.listModels(profileOf(draft), apiKey, signal);
        if (!models) return null;
        const unique = [...new Set(models.map((m) => m.trim()).filter((m) => m !== ''))];
        return unique.length > 0 ? unique.slice(0, MAX_SUGGESTIONS) : null;
      } catch (error) {
        if (error instanceof CancelledError || error instanceof SecretStoreError) throw error;
        return null; // a missing list is not an error: the model field stays free text
      }
    },
  };
}
