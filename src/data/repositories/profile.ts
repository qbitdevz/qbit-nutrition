import { eq } from 'drizzle-orm';
import { profile } from '../schema';
import { VALUE_LIMITS, requireWithin } from './limits';
import { invalid, type RepositoryContext } from './shared';

export type Profile = typeof profile.$inferSelect;

export interface ProfileInput {
  sex?: Profile['sex'];
  birthDate?: string | null;
  heightCm?: number | null;
  activityLevel?: Profile['activityLevel'];
  specialCondition?: Profile['specialCondition'];
  unitSystem: Profile['unitSystem'];
  locale: Profile['locale'];
  disclaimerAcceptedAt: string;
  disclaimerVersion: string;
}

export interface ProfileRepository {
  get(): Promise<Profile | null>;
  /** Creates the single profile row, or replaces its values (id and `createdAt` are kept). */
  save(input: ProfileInput): Promise<Profile>;
}

export function createProfileRepository({ db, now, newId }: RepositoryContext): ProfileRepository {
  const read = (): Profile | null => db.select().from(profile).limit(1).get() ?? null;

  return {
    async get() {
      return read();
    },

    async save(input) {
      if (input.heightCm != null && !(input.heightCm > 0)) throw invalid('heightCm must be positive');
      if (input.heightCm != null) requireWithin(input.heightCm, VALUE_LIMITS.heightCm, 'heightCm');
      const at = now().toISOString();
      const values = {
        sex: input.sex ?? null,
        birthDate: input.birthDate ?? null,
        heightCm: input.heightCm ?? null,
        activityLevel: input.activityLevel ?? null,
        specialCondition: input.specialCondition ?? null,
        unitSystem: input.unitSystem,
        locale: input.locale,
        disclaimerAcceptedAt: input.disclaimerAcceptedAt,
        disclaimerVersion: input.disclaimerVersion,
        updatedAt: at,
      };
      return db.transaction((tx) => {
        const existing = tx.select().from(profile).limit(1).get();
        if (existing) {
          tx.update(profile).set(values).where(eq(profile.id, existing.id)).run();
        } else {
          tx.insert(profile).values({ id: newId(), createdAt: at, ...values }).run();
        }
        return tx.select().from(profile).limit(1).get()!;
      });
    },
  };
}
