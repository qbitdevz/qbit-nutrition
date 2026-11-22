/**
 * Where API keys live (docs/06 section 6, NFR-04): in the device's secure storage, one entry per AI
 * provider profile, named by the profile id. A key is never a database column, never part of an
 * export, never logged, and never handed back to the UI: only `has` is for screens; `get` is for
 * the code that makes the request.
 */
export interface SecretStore {
  /** True when a secret is stored for this profile id. Never reads the secret into a screen. */
  has(id: string): Promise<boolean>;
  /** The secret, or null. Only the scan gateway and the connection test call this. */
  get(id: string): Promise<string | null>;
  /** Stores or replaces the secret. Rejects an empty secret. */
  set(id: string, secret: string): Promise<void>;
  /**
   * Removing a secret that is not there is not an error, and neither is removing under an id that cannot hold a
   * secret (`isValidSecretId` is false): nothing is stored under it, so such an id never blocks a removal.
   */
  remove(id: string): Promise<void>;
  /** The ids that hold a secret, as far as the store tracks them (an index on a device), so a secret whose profile is gone can be found and removed. */
  list(): Promise<string[]>;
  /** Adds ids that already hold a secret to the tracked list (secrets stored before tracking existed). Ids without a secret, or invalid, are ignored. */
  track(ids: readonly string[]): Promise<void>;
}

/** Secure-store names may contain only letters, digits, `.`, `-` and `_`; profile ids are UUIDs. One rule for the device store and the test store. */
export const SECRET_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
export const isValidSecretId = (id: string): boolean => SECRET_ID_PATTERN.test(id);

export type SecretStoreErrorCode = 'unavailable' | 'failed' | 'invalid';

/** A storage failure. By design it carries no cause and no value: the platform's own error could echo the secret. */
export class SecretStoreError extends Error {
  readonly code: SecretStoreErrorCode;
  constructor(code: SecretStoreErrorCode, message: string) {
    super(message);
    this.name = 'SecretStoreError';
    this.code = code;
  }
}
