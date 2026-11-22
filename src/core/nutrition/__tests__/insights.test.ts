import {
  EMPTY_SLOT_DUE_HOUR,
  FIBER_MIN_G_PER_1000_KCAL,
  LATE_DAY_HOUR,
  MIN_REMAINING_KCAL_FOR_SLOT,
  PROTEIN_WELL_BELOW_FRACTION,
  SODIUM_LIMIT_MG,
  TARGET_REACHED_KCAL_RANGE,
  pickInsight,
} from '..';
import type { DayTotals, MealSlot, Targets } from '..';

const TODAY = '2026-11-21';
const at = (hour: number, minute = 0) => new Date(2026, 10, 21, hour, minute); // local time

const targets: Targets = { kcal: 2000, proteinG: 100, carbsG: 250, fatG: 67 };
const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

const day = (totals: DayTotals['totals'], filledSlots: MealSlot[] = ALL_SLOTS, localDate = TODAY): DayTotals => ({
  localDate,
  totals,
  filledSlots,
});
// Three logged days before TODAY, each 2000 kcal, with the given fiber (g) and sodium (mg).
const recent = (fiber: number | number[], sodium: number | number[]): DayTotals[] =>
  ['2026-11-18', '2026-11-19', '2026-11-20'].map((d, i) =>
    day(
      { kcal: 2000, fiber: Array.isArray(fiber) ? fiber[i] : fiber, sodium: Array.isArray(sodium) ? sodium[i] : sodium },
      ALL_SLOTS,
      d,
    ),
  );
const okRecent = recent(30, 2000); // 15 g per 1000 kcal, 2000 mg

describe('thresholds', () => {
  it('exports each rule threshold as a named constant', () => {
    expect(LATE_DAY_HOUR).toBe(18);
    expect(PROTEIN_WELL_BELOW_FRACTION).toBe(0.6);
    expect(EMPTY_SLOT_DUE_HOUR).toEqual({ breakfast: 11, lunch: 15, dinner: 20 });
    expect(MIN_REMAINING_KCAL_FOR_SLOT).toBe(300);
    expect(FIBER_MIN_G_PER_1000_KCAL).toBe(14);
    expect(SODIUM_LIMIT_MG).toBe(2300);
    expect(TARGET_REACHED_KCAL_RANGE).toEqual({ min: 0.95, max: 1.05 });
  });
});

describe('rule 1 - protein well below target late in the day', () => {
  // 19:00, protein 40 g of 100 g (40% < 60%): 60 g remain.
  it('fires with consumed, target and remaining grams', () => {
    expect(pickInsight(day({ kcal: 1500, protein: 40 }), targets, okRecent, at(19))).toEqual({
      code: 'protein_low_late',
      consumedG: 40,
      targetG: 100,
      remainingG: 60,
    });
  });

  it('does not fire exactly at the fraction (60 of 100 g), before the late hour (17:59), or without a protein target', () => {
    expect(pickInsight(day({ kcal: 1500, protein: 60 }), targets, okRecent, at(19))).toBeNull();
    expect(pickInsight(day({ kcal: 1500, protein: 40 }), targets, okRecent, at(17, 59))).toBeNull();
    expect(pickInsight(day({ kcal: 1500, protein: 40 }), { ...targets, proteinG: null }, okRecent, at(19))).toBeNull();
  });

  it('does not fire when protein was not reported, or when nothing is logged', () => {
    expect(pickInsight(day({ kcal: 1500 }), targets, okRecent, at(19))).toBeNull();
    expect(pickInsight(day({}, []), targets, okRecent, at(19))).toBeNull();
  });
});

describe('rule 2 - calories remaining with a meal slot still empty', () => {
  // 16:00: kcal 900 of 2000 leaves 1100; breakfast is filled, lunch (due from 15:00) is empty.
  it('fires with the first due empty slot and the calories remaining', () => {
    expect(pickInsight(day({ kcal: 900, protein: 80 }, ['breakfast']), targets, okRecent, at(16))).toEqual({
      code: 'kcal_left_empty_slot',
      slot: 'lunch',
      remainingKcal: 1100,
    });
  });

  it('does not fire before the slot is due (14:59 for lunch), when every main slot is filled, or when under the minimum remaining', () => {
    expect(pickInsight(day({ kcal: 900, protein: 80 }, ['breakfast']), targets, okRecent, at(14, 59))).toBeNull();
    expect(pickInsight(day({ kcal: 900, protein: 80 }, ['breakfast', 'lunch', 'dinner']), targets, okRecent, at(16))).toBeNull();
    // 1750 consumed leaves 250 < 300.
    expect(pickInsight(day({ kcal: 1750, protein: 80 }, ['breakfast']), targets, okRecent, at(16))).toBeNull();
  });

  it('never fires once the target is passed, so it never suggests eating beyond or below it', () => {
    expect(pickInsight(day({ kcal: 2300, protein: 80 }, ['breakfast']), targets, okRecent, at(16))).toBeNull();
    expect(pickInsight(day({ kcal: 900 }, ['breakfast']), { ...targets, kcal: null }, okRecent, at(16))).toBeNull();
  });
});

describe('rule 3 - fiber low over the last three days', () => {
  // Three days of 2000 kcal and 20 g fiber: 60 g / 6000 kcal * 1000 = 10 g per 1000 kcal < 14.
  it('fires with the grams per 1000 kcal', () => {
    expect(pickInsight(day({ kcal: 500, protein: 20 }, ['breakfast']), targets, recent(20, 2000), at(10))).toEqual({
      code: 'fiber_low_recent',
      gramsPer1000Kcal: 10,
      days: 3,
    });
  });

  it('does not fire at exactly 14 g per 1000 kcal (28 g per 2000 kcal day)', () => {
    expect(pickInsight(day({ kcal: 500, protein: 20 }, ['breakfast']), targets, recent(28, 2000), at(10))).toBeNull();
  });

  it('needs all three previous days logged with fiber reported', () => {
    expect(pickInsight(day({ kcal: 500 }, ['breakfast']), targets, recent(20, 2000).slice(1), at(10))).toBeNull();
    const noFiber = recent(20, 2000);
    delete noFiber[0].totals.fiber;
    expect(pickInsight(day({ kcal: 500 }, ['breakfast']), targets, noFiber, at(10))).toBeNull();
  });

  it('uses the three days before today, in any order, and ignores today and older days', () => {
    const shuffled = [
      day({ kcal: 2000, fiber: 20, sodium: 2000 }, ALL_SLOTS, '2026-11-20'),
      day({ kcal: 2000, fiber: 99, sodium: 2000 }, ALL_SLOTS, '2026-11-16'),
      day({ kcal: 2000, fiber: 20, sodium: 2000 }, ALL_SLOTS, '2026-11-18'),
      day({ kcal: 2000, fiber: 20, sodium: 2000 }, ALL_SLOTS, '2026-11-19'),
      day({ kcal: 2000, fiber: 99, sodium: 2000 }, ALL_SLOTS, TODAY),
    ];
    expect(pickInsight(day({ kcal: 500 }, ['breakfast']), targets, shuffled, at(10))).toMatchObject({
      code: 'fiber_low_recent',
      gramsPer1000Kcal: 10,
    });
  });
});

describe('rule 4 - sodium high over the last three days', () => {
  // 2600 + 2900 + 2800 = 8300 mg / 3 = 2766.7 -> 2767 mg > 2300.
  it('fires with the average and the limit', () => {
    expect(pickInsight(day({ kcal: 500, protein: 20 }, ['breakfast']), targets, recent(30, [2600, 2900, 2800]), at(10))).toEqual({
      code: 'sodium_high_recent',
      averageMg: 2767,
      limitMg: 2300,
      days: 3,
    });
  });

  it('does not fire at exactly the limit (2300 mg average)', () => {
    expect(pickInsight(day({ kcal: 500, protein: 20 }, ['breakfast']), targets, recent(30, 2300), at(10))).toBeNull();
  });
});

describe('rule 5 - target reached', () => {
  // 1980 of 2000 kcal is 99%, inside 95%-105%.
  it('confirms with consumed and target calories', () => {
    expect(pickInsight(day({ kcal: 1980, protein: 95 }), targets, okRecent, at(10))).toEqual({
      code: 'target_reached',
      kcal: 1980,
      targetKcal: 2000,
    });
  });

  it('is inclusive at 95% (1900) and 105% (2100) and silent just outside', () => {
    expect(pickInsight(day({ kcal: 1900, protein: 95 }), targets, okRecent, at(10))).toMatchObject({ code: 'target_reached' });
    expect(pickInsight(day({ kcal: 2100, protein: 95 }), targets, okRecent, at(10))).toMatchObject({ code: 'target_reached' });
    expect(pickInsight(day({ kcal: 1899, protein: 95 }), targets, okRecent, at(10))).toBeNull();
    expect(pickInsight(day({ kcal: 2101, protein: 95 }), targets, okRecent, at(10))).toBeNull();
  });
});

describe('priority order and no insight', () => {
  // Every rule eligible at 19:00: protein 40 g, lunch empty with 500 kcal... all slots but breakfast empty,
  // fiber 10 g per 1000 kcal and sodium 2767 mg over the last three days.
  const lowFiberHighSodium = recent(20, [2600, 2900, 2800]);
  const base = { kcal: 1500, protein: 40 };

  it('1 beats 2, 3, 4', () => {
    expect(pickInsight(day(base, ['breakfast']), targets, lowFiberHighSodium, at(19))?.code).toBe('protein_low_late');
  });

  it('2 beats 3, 4 once protein is fine', () => {
    expect(pickInsight(day({ ...base, protein: 80 }, ['breakfast']), targets, lowFiberHighSodium, at(19))?.code).toBe(
      'kcal_left_empty_slot',
    );
  });

  it('3 beats 4 once no slot is empty', () => {
    expect(pickInsight(day({ ...base, protein: 80 }), targets, lowFiberHighSodium, at(19))?.code).toBe('fiber_low_recent');
  });

  it('4 beats 5 when fiber is fine', () => {
    expect(pickInsight(day({ kcal: 1980, protein: 95 }), targets, recent(30, [2600, 2900, 2800]), at(10))?.code).toBe(
      'sodium_high_recent',
    );
  });

  it('returns at most one insight, and null when no rule applies', () => {
    expect(pickInsight(day({ kcal: 1000, protein: 60 }), targets, okRecent, at(10))).toBeNull();
    expect(pickInsight(day({}, []), targets, okRecent, at(10))).toBeNull();
    expect(pickInsight(day({ kcal: 1000, protein: 60 }), { kcal: null, proteinG: null, carbsG: null, fatG: null }, [], at(10))).toBeNull();
  });
});
