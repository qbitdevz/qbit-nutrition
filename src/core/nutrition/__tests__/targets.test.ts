import {
  ACTIVITY_FACTORS,
  DEFAULT_MINIMUM_DAILY_KCAL,
  FORMULA_VERSION,
  GOAL_ADJUSTMENT,
  PROTEIN_G_PER_KG,
  TARGET_SOURCES,
  proposeTargets,
} from '..';
import type { ActivityLevel, ProfileInput, TargetProposal } from '..';

const REF = '2026-06-15';

// Man, 30 years old on REF, 80 kg, 180 cm.
const man: ProfileInput = {
  sex: 'male',
  birthDate: '1996-06-15',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'sedentary',
};
// Woman, 30 years old on REF, 65 kg, 165 cm.
const woman: ProfileInput = {
  sex: 'female',
  birthDate: '1996-06-15',
  heightCm: 165,
  weightKg: 65,
  activityLevel: 'sedentary',
};

function proposal(result: ReturnType<typeof proposeTargets>): TargetProposal {
  if (result.kind !== 'proposal') throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
  return result;
}

describe('proposeTargets - Mifflin-St Jeor resting energy', () => {
  it('man: 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780', () => {
    const p = proposal(proposeTargets(man, { type: 'maintain' }, { referenceDate: REF }));
    expect(p.restingKcal).toBe(1780);
    expect(p.ageYears).toBe(30);
  });

  it('woman: 10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161 = 1370.25 -> 1370', () => {
    const p = proposal(proposeTargets(woman, { type: 'maintain' }, { referenceDate: REF }));
    expect(p.restingKcal).toBe(1370);
  });
});

describe('proposeTargets - activity levels (maintenance)', () => {
  // Man, resting 1780: 1780 x factor, no goal adjustment.
  const manCases: [ActivityLevel, number, number][] = [
    ['sedentary', 1.4, 2492], // 1780 * 1.40
    ['light', 1.55, 2759], // 1780 * 1.55
    ['moderate', 1.75, 3115], // 1780 * 1.75
    ['active', 1.9, 3382], // 1780 * 1.90
    ['very_active', 2.0, 3560], // 1780 * 2.00
  ];
  it.each(manCases)('man, %s (x%s) -> %s kcal', (level, factor, kcal) => {
    expect(ACTIVITY_FACTORS[level]).toBe(factor);
    const p = proposal(proposeTargets({ ...man, activityLevel: level }, { type: 'maintain' }, { referenceDate: REF }));
    expect(p.maintenanceKcal).toBe(kcal);
    expect(p.kcal).toBe(kcal);
  });

  // Woman, resting 1370.25 (unrounded).
  const womanCases: [ActivityLevel, number][] = [
    ['sedentary', 1918], // 1370.25 * 1.40 = 1918.35
    ['light', 2124], // 1370.25 * 1.55 = 2123.8875
    ['moderate', 2398], // 1370.25 * 1.75 = 2397.9375
    ['active', 2603], // 1370.25 * 1.90 = 2603.475
    ['very_active', 2741], // 1370.25 * 2.00 = 2740.5 -> rounds half up
  ];
  it.each(womanCases)('woman, %s -> %s kcal', (level, kcal) => {
    const p = proposal(proposeTargets({ ...woman, activityLevel: level }, { type: 'maintain' }, { referenceDate: REF }));
    expect(p.kcal).toBe(kcal);
  });
});

describe('proposeTargets - goals, paces and macros', () => {
  // Man, sedentary: maintenance 2492 kcal, 80 kg. Carbohydrate is the remainder after rounded protein and fat.
  const cases: {
    name: string;
    goal: Parameters<typeof proposeTargets>[1];
    kcal: number;
    proteinG: number;
    fatG: number;
    carbsG: number;
  }[] = [
    {
      // 2492 * 0.90 = 2242.8 -> 2243. Protein 80*1.8 = 144 g (576 kcal). Fat 20%: 2243*0.2 = 448.6 kcal / 9 = 49.8 -> 50 g (450 kcal).
      // Carbs (2243 - 576 - 450) / 4 = 304.25 -> 304 g.
      name: 'lose fat, gentle (-10%)',
      goal: { type: 'lose_fat', pace: 'gentle' },
      kcal: 2243,
      proteinG: 144,
      fatG: 50,
      carbsG: 304,
    },
    {
      // 2492 * 0.81 = 2018.52 -> 2019. Protein 144 g (576). Fat 2019*0.2 = 403.8 / 9 = 44.9 -> 45 g (405).
      // Carbs (2019 - 576 - 405) / 4 = 259.5 -> 260 g.
      name: 'lose fat, moderate (-19%)',
      goal: { type: 'lose_fat', pace: 'moderate' },
      kcal: 2019,
      proteinG: 144,
      fatG: 45,
      carbsG: 260,
    },
    {
      // 2492. Protein 80*1.4 = 112 g (448). Fat 2492*0.2 = 498.4 / 9 = 55.4 -> 55 g (495). Carbs (2492 - 448 - 495) / 4 = 387.25 -> 387 g.
      name: 'maintain',
      goal: { type: 'maintain' },
      kcal: 2492,
      proteinG: 112,
      fatG: 55,
      carbsG: 387,
    },
    {
      // 2492 * 1.10 = 2741.2 -> 2741. Protein 80*1.6 = 128 g (512). Fat 2741*0.2 = 548.2 / 9 = 60.9 -> 61 g (549). Carbs (2741 - 512 - 549) / 4 = 420 g.
      name: 'gain muscle, gentle (+10%)',
      goal: { type: 'gain_muscle', pace: 'gentle' },
      kcal: 2741,
      proteinG: 128,
      fatG: 61,
      carbsG: 420,
    },
    {
      // 2492 * 1.20 = 2990.4 -> 2990. Protein 128 g (512). Fat 2990*0.2 = 598 / 9 = 66.4 -> 66 g (594). Carbs (2990 - 512 - 594) / 4 = 471 g.
      name: 'gain muscle, moderate (+20%)',
      goal: { type: 'gain_muscle', pace: 'moderate' },
      kcal: 2990,
      proteinG: 128,
      fatG: 66,
      carbsG: 471,
    },
  ];

  it.each(cases)('$name', ({ goal, kcal, proteinG, fatG, carbsG }) => {
    const p = proposal(proposeTargets(man, goal, { referenceDate: REF }));
    expect(p).toMatchObject({ kcal, proteinG, fatG, carbsG, formulaVersion: FORMULA_VERSION });
    // The split adds up to the energy target within rounding of whole grams (at most 2 kcal).
    expect(Math.abs(p.proteinG * 4 + p.carbsG * 4 + p.fatG * 9 - p.kcal)).toBeLessThanOrEqual(2);
  });

  it('ignores the pace for maintain', () => {
    const p = proposal(proposeTargets(man, { type: 'maintain', pace: 'moderate' }, { referenceDate: REF }));
    expect(p.kcal).toBe(2492);
  });

  it('caps protein at 35% of energy and gives the freed energy to carbohydrate', () => {
    // Woman, 40 years old, 100 kg, 154 cm, sedentary, lose fat gentle.
    // Resting 1000 + 962.5 - 200 - 161 = 1601.5; x1.40 = 2242.1; x0.90 = 2017.89 -> 2018 kcal.
    // Default protein 100*1.8 = 180 g = 720 kcal = 35.7% > 35%, so protein = 0.35*2018 = 706.3 kcal / 4 = 176.6 -> 177 g (708).
    // Fat 2018*0.2 = 403.6 / 9 = 44.8 -> 45 g (405). Carbs (2018 - 708 - 405) / 4 = 226.25 -> 226 g.
    const p = proposal(
      proposeTargets(
        { sex: 'female', birthDate: '1986-06-15', heightCm: 154, weightKg: 100, activityLevel: 'sedentary' },
        { type: 'lose_fat', pace: 'gentle' },
        { referenceDate: REF },
      ),
    );
    expect(p).toMatchObject({ kcal: 2018, proteinG: 177, fatG: 45, carbsG: 226 });
  });

  it('carries the constants tables the screen cites, and TARGET_SOURCES agrees with them', () => {
    expect(GOAL_ADJUSTMENT.lose_fat.moderate).toBe(-0.19);
    expect(PROTEIN_G_PER_KG.lose_fat).toBe(1.8);
    expect(TARGET_SOURCES['activityFactor.sedentary'].value).toBe(ACTIVITY_FACTORS.sedentary);
    expect(TARGET_SOURCES['minimumKcal.female'].value).toBe(DEFAULT_MINIMUM_DAILY_KCAL.female);
  });
});

describe('proposeTargets - refusals return a reason and no numbers', () => {
  it('names every missing field', () => {
    expect(proposeTargets({}, { type: 'maintain' }, { referenceDate: REF })).toEqual({
      kind: 'no_proposal',
      reason: 'missing_data',
      missing: ['sex', 'birthDate', 'heightCm', 'weightKg', 'activityLevel'],
    });
  });

  it('names only the fields that are missing, null counts as missing', () => {
    expect(
      proposeTargets({ ...man, weightKg: null, activityLevel: undefined }, { type: 'maintain' }, { referenceDate: REF }),
    ).toEqual({ kind: 'no_proposal', reason: 'missing_data', missing: ['weightKg', 'activityLevel'] });
  });

  it('treats an unusable value (zero weight, malformed date) as missing', () => {
    expect(
      proposeTargets({ ...man, weightKg: 0, birthDate: '15/06/1996' }, { type: 'maintain' }, { referenceDate: REF }),
    ).toEqual({ kind: 'no_proposal', reason: 'missing_data', missing: ['birthDate', 'weightKg'] });
  });

  it('asks for the pace when the goal needs one', () => {
    expect(proposeTargets(man, { type: 'lose_fat' }, { referenceDate: REF })).toEqual({
      kind: 'no_proposal',
      reason: 'missing_data',
      missing: ['pace'],
    });
  });

  it('refuses under 18', () => {
    expect(proposeTargets({ ...man, birthDate: '2010-01-01' }, { type: 'maintain' }, { referenceDate: REF })).toEqual({
      kind: 'no_proposal',
      reason: 'under_18',
    });
  });

  it('refuses under 18 even when other data is missing', () => {
    expect(proposeTargets({ birthDate: '2010-01-01' }, { type: 'maintain' }, { referenceDate: REF })).toEqual({
      kind: 'no_proposal',
      reason: 'under_18',
    });
  });

  it.each(['pregnant', 'breastfeeding'] as const)('refuses when %s', (condition) => {
    expect(proposeTargets({ ...woman, specialCondition: condition }, { type: 'maintain' }, { referenceDate: REF })).toEqual({
      kind: 'no_proposal',
      reason: 'special_condition',
      condition,
    });
  });

  it('refuses for a special condition even when other data is missing', () => {
    expect(proposeTargets({ specialCondition: 'pregnant' }, { type: 'maintain' }, { referenceDate: REF })).toEqual({
      kind: 'no_proposal',
      reason: 'special_condition',
      condition: 'pregnant',
    });
  });
});

describe('proposeTargets - age boundary (18th birthday)', () => {
  const born = { ...man, birthDate: '2008-03-15' };

  it('the day before the 18th birthday is 17: refused', () => {
    expect(proposeTargets(born, { type: 'maintain' }, { referenceDate: '2026-03-14' })).toEqual({
      kind: 'no_proposal',
      reason: 'under_18',
    });
  });

  it('on the 18th birthday: proposed, with the age-18 macro limits', () => {
    // Resting 800 + 1125 - 90 + 5 = 1840; x1.40 = 2576 kcal. Protein 112 g (448).
    // Age 18 uses the 14-18 AMDR column: fat minimum 25% = 644 kcal / 9 = 71.6 -> 72 g (648). Carbs (2576 - 448 - 648) / 4 = 370 g.
    const p = proposal(proposeTargets(born, { type: 'maintain' }, { referenceDate: '2026-03-15' }));
    expect(p).toMatchObject({ ageYears: 18, restingKcal: 1840, kcal: 2576, proteinG: 112, fatG: 72, carbsG: 370 });
  });
});

describe('proposeTargets - minimum daily energy', () => {
  // Woman, 40 kg, 140 cm, sedentary. At 51: 400 + 875 - 255 - 161 = 859; x1.40 = 1202.6 -> 1203 kcal.
  // At 52: 854; x1.40 = 1195.6 -> 1196 kcal.
  const small = (birthDate: string): ProfileInput => ({
    sex: 'female',
    birthDate,
    heightCm: 140,
    weightKg: 40,
    activityLevel: 'sedentary',
  });
  const at51 = small('1975-06-15');
  const at52 = small('1974-06-15');

  it('exports the defaults: 1200 women, 1500 men', () => {
    expect(DEFAULT_MINIMUM_DAILY_KCAL).toEqual({ female: 1200, male: 1500 });
  });

  it('proposes 1203, above the default minimum of 1200 for a woman', () => {
    expect(proposal(proposeTargets(at51, { type: 'maintain' }, { referenceDate: REF })).kcal).toBe(1203);
  });

  it('refuses 1196, below the default minimum, with the minimum and no targets', () => {
    expect(proposeTargets(at52, { type: 'maintain' }, { referenceDate: REF })).toEqual({
      kind: 'no_proposal',
      reason: 'below_minimum',
      minimumKcal: 1200,
    });
  });

  it('refuses when the goal pushes a maintenance that is above the minimum under it', () => {
    // 1202.6 * 0.90 = 1082.34 -> 1082 < 1200. No clamping to the minimum.
    expect(proposeTargets(at51, { type: 'lose_fat', pace: 'gentle' }, { referenceDate: REF })).toEqual({
      kind: 'no_proposal',
      reason: 'below_minimum',
      minimumKcal: 1200,
    });
  });

  it('uses the sex default: the same measures give 1477 kcal for a man (below 1500) and 1245 for a woman (above 1200)', () => {
    // 45 kg, 152 cm, 70 years, sedentary. Man: 450 + 950 - 350 + 5 = 1055 x1.40 = 1477. Woman: 450 + 950 - 350 - 161 = 889 x1.40 = 1244.6 -> 1245.
    const base = { birthDate: '1956-06-15', heightCm: 152, weightKg: 45, activityLevel: 'sedentary' } as const;
    expect(proposeTargets({ ...base, sex: 'male' }, { type: 'maintain' }, { referenceDate: REF })).toEqual({
      kind: 'no_proposal',
      reason: 'below_minimum',
      minimumKcal: 1500,
    });
    expect(proposal(proposeTargets({ ...base, sex: 'female' }, { type: 'maintain' }, { referenceDate: REF })).kcal).toBe(1245);
  });

  it('adjusted minimum, exactly at the target: proposed', () => {
    expect(proposal(proposeTargets(at51, { type: 'maintain' }, { referenceDate: REF, minimumDailyKcal: 1203 })).kcal).toBe(1203);
  });

  it('adjusted minimum, one kcal above the target: refused with that minimum', () => {
    expect(proposeTargets(at51, { type: 'maintain' }, { referenceDate: REF, minimumDailyKcal: 1204 })).toEqual({
      kind: 'no_proposal',
      reason: 'below_minimum',
      minimumKcal: 1204,
    });
  });

  it('adjusted minimum lowered by the user: 1196 is proposed with a minimum of 1100', () => {
    expect(proposal(proposeTargets(at52, { type: 'maintain' }, { referenceDate: REF, minimumDailyKcal: 1100 })).kcal).toBe(1196);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('rejects a minimum of %s', (minimumDailyKcal) => {
    expect(() => proposeTargets(at51, { type: 'maintain' }, { referenceDate: REF, minimumDailyKcal })).toThrow(RangeError);
  });
});

describe('TARGET_SOURCES', () => {
  it('has, for every entry, a status; sourced entries carry title, publisher, url and the quoted text', () => {
    const entries = Object.values(TARGET_SOURCES);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(['sourced', 'sourced_range', 'unsourced']).toContain(e.status);
      if (e.status === 'unsourced') {
        expect(e.source).toBeNull();
      } else {
        expect(e.source).not.toBeNull();
        expect(e.source!.title).not.toBe('');
        expect(e.source!.publisher).not.toBe('');
        expect(e.source!.url).toMatch(/^https:\/\//);
        expect(e.source!.quote).not.toBe('');
      }
    }
  });

  it('marks the gentle fat-loss percentage as unsourced', () => {
    expect(TARGET_SOURCES['goalAdjustment.lose_fat.gentle'].status).toBe('unsourced');
  });
});
