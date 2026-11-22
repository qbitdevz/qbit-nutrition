import { VALUE_LIMITS } from '@/data';
import { TARGET_RANGES } from '../../goals/targetsForm';
import { CUSTOM_FOOD_RANGES, GRAMS_RANGE } from '../../logging/limits';
import { HEIGHT_CM, WEIGHT_KG } from '../../profile/units';
import { METRIC_LIMITS } from '../../progress/series';

describe('the forms, the repositories and the export format use one set of limits', () => {
  it('has the same numbers', () => {
    expect(GRAMS_RANGE.max).toBe(VALUE_LIMITS.gramsMax);
    expect(CUSTOM_FOOD_RANGES.kcal).toEqual(VALUE_LIMITS.per100g.kcal);
    expect(CUSTOM_FOOD_RANGES.protein).toEqual(VALUE_LIMITS.per100g.protein);
    expect(TARGET_RANGES).toEqual(VALUE_LIMITS.targets);
    expect(HEIGHT_CM).toEqual(VALUE_LIMITS.heightCm);
    expect(WEIGHT_KG).toEqual(VALUE_LIMITS.measurement.weight);
    expect(METRIC_LIMITS).toEqual(VALUE_LIMITS.measurement);
  });
});
