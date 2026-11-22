import type { ProfileInput } from '@/core/nutrition';
import type { Goal, Profile, Repositories } from '@/data';
import { readMinimumKcal } from './minimum';

/** Everything the goal setup reads about the person, through the repositories. */
export interface GoalContext {
  profile: Profile | null;
  /** The profile as `proposeTargets` reads it, with the latest recorded weight. */
  input: ProfileInput;
  goal: Goal | null;
  /** The person's own minimum daily energy; null means the default applies. */
  minimumKcal: number | null;
}

export async function loadGoalContext(repos: Pick<Repositories, 'profile' | 'measurements' | 'goals' | 'settings'>): Promise<GoalContext> {
  const [profile, weight, goal, minimumKcal] = await Promise.all([
    repos.profile.get(),
    repos.measurements.latest('weight'),
    repos.goals.current(),
    readMinimumKcal(repos.settings),
  ]);
  return {
    profile,
    input: {
      sex: profile?.sex ?? null,
      birthDate: profile?.birthDate ?? null,
      heightCm: profile?.heightCm ?? null,
      weightKg: weight?.value ?? null,
      activityLevel: profile?.activityLevel ?? null,
      specialCondition: profile?.specialCondition ?? null,
    },
    goal,
    minimumKcal,
  };
}

/** True when the person gave none of the details targets are calculated from (a skipped profile). */
export const hasNoProfileData = (input: ProfileInput): boolean =>
  !input.sex && !input.birthDate && !input.heightCm && !input.weightKg && !input.activityLevel && !input.specialCondition;
