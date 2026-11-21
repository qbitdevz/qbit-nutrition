import { eq } from 'drizzle-orm';
import { setting } from '../schema';
import type { RepositoryContext } from './shared';

/** Key-value settings (`keep_photos`, `theme`, the minimum-energy override, ...). Values are text. */
export interface SettingsRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
  /** Removing a key that is not there is not an error. */
  remove(key: string): Promise<void>;
}

export function createSettingsRepository({ db }: RepositoryContext): SettingsRepository {
  return {
    async get(key) {
      return db.select().from(setting).where(eq(setting.key, key)).get()?.value ?? null;
    },

    async set(key, value) {
      db.insert(setting).values({ key, value }).onConflictDoUpdate({ target: setting.key, set: { value } }).run();
    },

    async getAll() {
      return Object.fromEntries(db.select().from(setting).all().map((r) => [r.key, r.value]));
    },

    async remove(key) {
      db.delete(setting).where(eq(setting.key, key)).run();
    },
  };
}
