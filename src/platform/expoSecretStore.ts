import * as SecureStore from 'expo-secure-store';

import { SecretStoreError, isValidSecretId, type SecretStore } from './secretStore';

const PREFIX = 'ai_key.';
/** expo-secure-store cannot list its entries, so the ids that hold a key are tracked in one more entry. Not a secret: only ids. */
const INDEX = 'ai_key_index';

/**
 * Secure storage for API keys on a device: Android Keystore-backed encrypted shared preferences,
 * iOS Keychain. On iOS the entry is `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so it is not migrated to
 * another device by a backup (Android ignores the option; there, `android.allowBackup` is off in
 * `app.json`, and the plugin also excludes the SecureStore preferences from backup rules).
 *
 * Every failure is rethrown as a `SecretStoreError` without the platform error: that error is not
 * ours to vouch for and could echo the value. On the web preview the native module is absent, so
 * every call fails with `unavailable` and the screens say keys cannot be saved there.
 *
 * Tracking: the index is written BEFORE a key and cleaned AFTER its removal, so it always contains every
 * stored key (a crash can leave an index entry without a key, never the reverse). `list()` is therefore
 * complete for keys stored by this version; keys stored by an older version are adopted with `track`.
 */
export function createExpoSecretStore(): SecretStore {
  const entryName = (id: string): string => {
    if (!isValidSecretId(id)) throw new SecretStoreError('invalid', 'The provider id is not a valid storage name.');
    return `${PREFIX}${id}`;
  };
  const guard = async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      const available = await SecureStore.isAvailableAsync().catch(() => false);
      throw new SecretStoreError(available ? 'failed' : 'unavailable', 'Secure storage did not complete the request.');
    }
  };

  // Index updates are read-modify-write: run them one at a time.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const run = queue.then(action, action);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };

  const readIndex = async (): Promise<string[]> => {
    const raw = await SecureStore.getItemAsync(INDEX);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && isValidSecretId(id)) : [];
    } catch {
      return []; // a damaged index starts again; the keys themselves are not touched
    }
  };
  const writeIndex = (ids: readonly string[]) => SecureStore.setItemAsync(INDEX, JSON.stringify([...new Set(ids)]));

  return {
    has: async (id) => (isValidSecretId(id) ? (await guard(() => SecureStore.getItemAsync(entryName(id)))) !== null : false),
    get: async (id) => (isValidSecretId(id) ? guard(() => SecureStore.getItemAsync(entryName(id))) : null),
    set: (id, secret) => {
      if (!isValidSecretId(id)) return Promise.reject(new SecretStoreError('invalid', 'The provider id is not a valid storage name.'));
      if (secret === '') return Promise.reject(new SecretStoreError('invalid', 'A secret cannot be empty.'));
      return guard(() =>
        serial(async () => {
          const ids = await readIndex();
          if (!ids.includes(id)) await writeIndex([...ids, id]);
          await SecureStore.setItemAsync(entryName(id), secret, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
        }),
      );
    },
    remove: async (id) => {
      if (!isValidSecretId(id)) return; // nothing can be stored under it, so nothing blocks
      await guard(() =>
        serial(async () => {
          await SecureStore.deleteItemAsync(entryName(id));
          const ids = await readIndex();
          if (ids.includes(id)) await writeIndex(ids.filter((known) => known !== id));
        }),
      );
    },
    list: () => guard(readIndex),
    track: (ids) =>
      guard(() =>
        serial(async () => {
          const known = await readIndex();
          const adopt: string[] = [];
          for (const id of new Set(ids)) {
            if (!isValidSecretId(id) || known.includes(id)) continue;
            if ((await SecureStore.getItemAsync(entryName(id))) !== null) adopt.push(id);
          }
          if (adopt.length > 0) await writeIndex([...known, ...adopt]);
        }),
      ),
  };
}
