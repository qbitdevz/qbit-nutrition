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

  it('enforces the id rule of the real store, so a test cannot store a key under a name the device would refuse', async () => {
    const store = createMemorySecretStore();
    for (const bad of ['bad id/with slash', '../x', '', 'a'.repeat(129), 'ünï']) {
      await expect(store.set(bad, 'k')).rejects.toMatchObject({ code: 'invalid' });
      expect(await store.has(bad)).toBe(false);
      expect(await store.get(bad)).toBeNull();
      await expect(store.remove(bad)).resolves.toBeUndefined(); // an id that cannot hold a key never blocks a removal
    }
    expect(await store.list()).toEqual([]);
  });

  it('lists the ids that hold a key', async () => {
    const store = createMemorySecretStore();
    await store.set('b', 'k-1');
    await store.set('a', 'k-2');
    expect((await store.list()).sort()).toEqual(['a', 'b']);
    await store.remove('a');
    expect(await store.list()).toEqual(['b']);
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
    const write = mockCalls.find((c) => c.fn === 'set' && c.name === `ai_key.${ID}`);
    expect(write).toBeDefined();
    expect(mockCalls.every((c) => /^[A-Za-z0-9._-]+$/.test(c.name))).toBe(true);
    expect(await store.get(ID)).toBe('sk-abc');
    expect(await store.has(ID)).toBe(true);
    await store.remove(ID);
    expect(await store.has(ID)).toBe(false);
  });

  it('does not let the secret migrate to another device on iOS', async () => {
    await createExpoSecretStore().set('p', 'sk-abc');
    expect(mockCalls.find((c) => c.name === 'ai_key.p')!.options).toMatchObject({ keychainAccessible: 'afterFirstUnlockThisDeviceOnly' });
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


describe('expo secret store: the index of stored ids', () => {
  beforeEach(() => {
    mockVault.clear();
    mockCalls.length = 0;
    mockFail = null;
    mockUnavailable = false;
  });

  it('lists the ids it stored, and writes the index before the key so the index never misses a key', async () => {
    const store = createExpoSecretStore();
    await store.set('a', 'k-1');
    await store.set('b', 'k-2');
    expect((await store.list()).sort()).toEqual(['a', 'b']);
    const firstIndexWrite = mockCalls.findIndex((c) => c.fn === 'set' && c.name === 'ai_key_index');
    const firstKeyWrite = mockCalls.findIndex((c) => c.fn === 'set' && c.name === 'ai_key.a');
    expect(firstIndexWrite).toBeGreaterThanOrEqual(0);
    expect(firstIndexWrite).toBeLessThan(firstKeyWrite);
    await store.remove('a');
    expect(await store.list()).toEqual(['b']);
    expect(await store.has('a')).toBe(false);
  });

  it('never lets an id that cannot hold a key block a removal or a lookup', async () => {
    const store = createExpoSecretStore();
    await expect(store.remove('bad id/with slash')).resolves.toBeUndefined();
    expect(await store.has('bad id/with slash')).toBe(false);
    expect(await store.get('bad id/with slash')).toBeNull();
    await expect(store.set('bad id/with slash', 'k')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('adopts keys stored before the index existed', async () => {
    mockVault.set('ai_key.legacy', 'old-key');
    const store = createExpoSecretStore();
    expect(await store.list()).toEqual([]);
    await store.track(['legacy', 'no-key-here', 'bad id']);
    expect(await store.list()).toEqual(['legacy']);
  });

  it('survives a damaged index', async () => {
    mockVault.set('ai_key_index', '{not json');
    const store = createExpoSecretStore();
    expect(await store.list()).toEqual([]);
    await store.set('a', 'k-1');
    expect(await store.list()).toEqual(['a']);
  });
});
