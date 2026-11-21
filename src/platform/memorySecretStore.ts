import { SecretStoreError, isValidSecretId, type SecretStore } from './secretStore';

/** An in-memory `SecretStore` for tests. Nothing is ever written anywhere. It enforces the same id rule as the device store. */
export function createMemorySecretStore(): SecretStore {
  const vault = new Map<string, string>();
  return {
    async has(id) {
      return vault.has(id);
    },
    async get(id) {
      return vault.get(id) ?? null;
    },
    async set(id, secret) {
      if (!isValidSecretId(id)) throw new SecretStoreError('invalid', 'The provider id is not a valid storage name.');
      if (secret === '') throw new SecretStoreError('invalid', 'A secret cannot be empty.');
      vault.set(id, secret);
    },
    async remove(id) {
      vault.delete(id);
    },
    async list() {
      return [...vault.keys()];
    },
    async track() {
      // The vault is always exact: there is nothing to adopt.
    },
  };
}
