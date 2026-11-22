import { SecretStoreError, type SecretStore } from './secretStore';

/** An in-memory `SecretStore` for tests. Nothing is ever written anywhere. */
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
      if (secret === '') throw new SecretStoreError('invalid', 'A secret cannot be empty.');
      vault.set(id, secret);
    },
    async remove(id) {
      vault.delete(id);
    },
  };
}
