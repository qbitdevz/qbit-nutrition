import * as SecureStore from 'expo-secure-store';

import { SecretStoreError, type SecretStore } from './secretStore';

/** `expo-secure-store` names may contain only letters, digits, `.`, `-` and `_`. Profile ids are UUIDs. */
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;
const PREFIX = 'ai_key.';

/**
 * Secure storage for API keys on a device: Android Keystore-backed encrypted shared preferences,
 * iOS Keychain. On iOS the entry is `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so it is not migrated to
 * another device by a backup (Android ignores the option; there, `android.allowBackup` is off in
 * `app.json`, and the plugin also excludes the SecureStore preferences from backup rules).
 *
 * Every failure is rethrown as a `SecretStoreError` without the platform error: that error is not
 * ours to vouch for and could echo the value. On the web preview the native module is absent, so
 * every call fails with `unavailable` and the screens say keys cannot be saved there.
 */
export function createExpoSecretStore(): SecretStore {
  const entryName = (id: string): string => {
    if (!SAFE_ID.test(id)) throw new SecretStoreError('invalid', 'The provider id is not a valid storage name.');
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
  return {
    has: async (id) => (await guard(() => SecureStore.getItemAsync(entryName(id)))) !== null,
    get: (id) => guard(() => SecureStore.getItemAsync(entryName(id))),
    set: (id, secret) => {
      if (secret === '') return Promise.reject(new SecretStoreError('invalid', 'A secret cannot be empty.'));
      return guard(() => SecureStore.setItemAsync(entryName(id), secret, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }));
    },
    remove: (id) => guard(() => SecureStore.deleteItemAsync(entryName(id))),
  };
}
