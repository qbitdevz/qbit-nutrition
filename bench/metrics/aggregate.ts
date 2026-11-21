import type { MealOutcome, Metrics, Nutrients4 } from '../types';
import { mean, median, percentile, ratio } from './stats';

const EPS = 1e-9;

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const nonNull = (values: readonly (number | null)[]): number[] => values.filter((v): v is number => v !== null);

/** Absolute percentage error of one nutrient for one meal; null when the true value is not positive. */
function relError(predicted: number, truth: number): number | null {
  return truth > 0 ? Math.abs(predicted - truth) / truth : null;
}

function nutrientMape(meals: readonly MealOutcome[], key: keyof Nutrients4): number | null {
  const errors = meals.flatMap((m) => {
    if (!m.trueNutrients || !m.predictedNutrients) return [];
    const e = relError(m.predictedNutrients[key], m.trueNutrients[key]);
    return e === null ? [] : [e];
  });
  return mean(errors);
}

/**
 * Metrics of docs/11 section B.1 over meals already scored. Rules:
 * - `failed` meals (provider or infrastructure errors) are excluded from every rate.
 * - Identification and the within-10% and within-20% shares use the food photos that got a final
 *   answer: a "no food" reply or an unusable reply counts as zero items found and as a miss.
 * - Portion, matching, and nutrient errors use only what a valid scan produced.
 * - Non-food photos only feed the operational metrics and the no-food rate.
 */
export function aggregate(meals: readonly MealOutcome[]): Metrics {
  const scored = meals.filter((m) => m.status !== 'failed');
  const foodScored = scored.filter((m) => m.isFood);
  const nonFoodScored = scored.filter((m) => !m.isFood);
  const okFood = foodScored.filter((m) => m.status === 'ok');
  const pairs = foodScored.flatMap((m) => m.pairs);

  const detected = sum(foodScored.map((m) => m.detectedCount));
  const truth = sum(foodScored.map((m) => m.truthCount));

  const valid = scored.filter((m) => m.status === 'ok' || m.status === 'no_food');
  const latencies = nonNull(scored.map((m) => m.latencyMs));

  const energyDenominator = foodScored.filter((m) => (m.trueNutrients?.kcal ?? 0) > 0);
  const within = (limit: number) =>
    ratio(
      energyDenominator.filter((m) => {
        if (m.status !== 'ok' || !m.trueNutrients || !m.predictedNutrients) return false;
        const e = relError(m.predictedNutrients.kcal, m.trueNutrients.kcal);
        return e !== null && e <= limit + EPS;
      }).length,
      energyDenominator.length,
    );

  const withTokens = scored.filter((m) => m.inputTokens !== null && m.outputTokens !== null);
  const usablePairs = pairs.filter((p) => p.trueGrams > 0);

  return {
    counts: {
      total: meals.length,
      food: meals.filter((m) => m.isFood).length,
      nonFood: meals.filter((m) => !m.isFood).length,
      scored: scored.length,
      failed: meals.length - scored.length,
    },
    itemPrecision: ratio(pairs.length, detected),
    itemRecall: ratio(pairs.length, truth),
    portionMape: mean(usablePairs.map((p) => Math.abs(p.predictedGrams - p.trueGrams) / p.trueGrams)),
    portionBias: mean(usablePairs.map((p) => (p.predictedGrams - p.trueGrams) / p.trueGrams)),
    matchingRate: ratio(pairs.filter((p) => p.matched).length, pairs.length),
    energyMape: nutrientMape(okFood, 'kcal'),
    proteinMape: nutrientMape(okFood, 'protein'),
    carbsMape: nutrientMape(okFood, 'carbs'),
    fatMape: nutrientMape(okFood, 'fat'),
    within10: within(0.1),
    within20: within(0.2),
    validFirstAttempt: ratio(valid.filter((m) => !m.repaired).length, scored.length),
    validAfterRepair: ratio(valid.length, scored.length),
    latencyMedianMs: median(latencies),
    latencyP95Ms: percentile(latencies, 0.95),
    inputTokensPerScan: mean(withTokens.map((m) => m.inputTokens as number)),
    outputTokensPerScan: mean(withTokens.map((m) => m.outputTokens as number)),
    noFoodRateFoodPhotos: ratio(foodScored.filter((m) => m.status === 'no_food').length, foodScored.length),
    noFoodRateNonFoodPhotos: ratio(nonFoodScored.filter((m) => m.status === 'no_food').length, nonFoodScored.length),
  };
}
