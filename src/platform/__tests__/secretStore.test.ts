import { createExpoSecretStore } from '../expoSecretStore';
import { createMemorySecretStore } from '../memorySecretStore';
import { SecretStoreError } from '../secretStore';

const mockVault = new Map<string, string>();
const mockCalls: { fn: string; name: string; options?: unknown }[] = [];
let mockFail: Error | null = null;
let mockUnavailable = false;
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  isAvailableAsync: async () => !mockUnavailable,
  setItemAsync: async (name: string, value: string, options?: unknown) => {
    mockCalls.push({ fn: 'set', name, options });
    if (mockFail) throw mockFail;
    mockVault.set(name, value);
  },
  getItemAsync: async (name: string) => {
    mockCalls.push({ fn: 'get', name });
    if (mockFail) throw mockFail;
    return mockVault.get(name) ?? null;
  },
  deleteItemAsync: async (name: string) => {
    mockCalls.push({ fn: 'delete', name });
    if (mockFail) throw mockFail;
    mockVault.delete(name);
  },
}));

const ID = '3f2b1c9e-0000-4000-8000-000000000001';

describe('memory secret store', () => {
  it('stores, reads, reports and removes a secret by id', async () => {
    const store = createMemorySecretStore();
    expect(await store.has('a')).toBe(false);
    await store.set('a', 'k-1');
    expect(await store.has('a')).toBe(true);
    expect(await store.get('a')).toBe('k-1');
    await store.set('a', 'k-2');
    expect(await store.get('a')).toBe('k-2');
    await store.remove('a');
    expect(await store.get('a')).toBeNull();
    await expect(store.remove('a')).resolves.toBeUndefined();
  });

  it('rejects an empty secret', async () => {
    await expect(createMemorySecretStore().set('a', '')).rejects.toBeInstanceOf(SecretStoreError);
  });
});

describe('expo secret store', () => {
  beforeEach(() => {
    mockVault.clear();
    mockCalls.length = 0;
    mockFail = null;
    mockUnavailable = false;
  });

  it('keeps each secret under its own profile id, in a name expo-secure-store accepts', async () => {
    const store = createExpoSecretStore();
    await store.set(ID, 'sk-abc');
    expect(mockCalls[0]!.name).toBe(`ai_key.${ID}`);
    expect(mockCalls[0]!.name).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(await store.get(ID)).toBe('sk-abc');
    expect(await store.has(ID)).toBe(true);
    await store.remove(ID);
    expect(await store.has(ID)).toBe(false);
  });

  it('does not let the secret migrate to another device on iOS', async () => {
    await createExpoSecretStore().set('p', 'sk-abc');
    expect(mockCalls[0]!.options).toMatchObject({ keychainAccessible: 'afterFirstUnlockThisDeviceOnly' });
  });

  it('rejects an id that is not a safe name instead of building a strange one', async () => {
    await expect(createExpoSecretStore().set('../x y', 'sk-abc')).rejects.toBeInstanceOf(SecretStoreError);
    expect(mockCalls).toHaveLength(0);
  });

  it('turns a platform failure into a SecretStoreError that carries neither the secret nor the cause', async () => {
    mockFail = new Error('keystore broke while writing sk-abc-very-secret');
    const error = await createExpoSecretStore()
      .set('p', 'sk-abc-very-secret')
      .then(() => undefined, (e: unknown) => e as SecretStoreError);
    expect(error).toBeInstanceOf(SecretStoreError);
    expect(error?.code).toBe('failed');
    expect(String(error)).not.toContain('sk-abc-very-secret');
    expect((error as { cause?: unknown }).cause).toBeUndefined();
  });

  it('says unavailable when the device (or the web preview) has no secure storage', async () => {
    mockUnavailable = true;
    mockFail = new Error('native module missing');
    const error = await createExpoSecretStore().set('p', 'sk-abc').then(() => undefined, (e: unknown) => e as SecretStoreError);
    expect(error?.code).toBe('unavailable');
  });
});
