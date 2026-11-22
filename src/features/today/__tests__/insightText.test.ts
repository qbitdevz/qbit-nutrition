import type { Insight } from '@/core/nutrition';
import i18n from '@/i18n';
import type { Locale } from '@/i18n/locale';
import { insightMessage } from '../insightText';

/** One example of every insight code, so a new code without strings fails here. */
const EXAMPLES: Record<Insight['code'], Insight[]> = {
  protein_low_late: [{ code: 'protein_low_late', consumedG: 78, targetG: 150, remainingG: 72 }],
  kcal_left_empty_slot: [
    { code: 'kcal_left_empty_slot', slot: 'breakfast', remainingKcal: 1500 },
    { code: 'kcal_left_empty_slot', slot: 'lunch', remainingKcal: 1200 },
    { code: 'kcal_left_empty_slot', slot: 'dinner', remainingKcal: 700 },
  ],
  fiber_low_recent: [{ code: 'fiber_low_recent', gramsPer1000Kcal: 9.5, days: 3 }],
  sodium_high_recent: [{ code: 'sodium_high_recent', averageMg: 2750, limitMg: 2300, days: 3 }],
  target_reached: [{ code: 'target_reached', kcal: 2050, targetKcal: 2100 }],
};

describe.each(['en', 'es'] as const)('insight wording (%s)', (locale: Locale) => {
  it.each(Object.values(EXAMPLES).flat())('translates $code', async (insight) => {
    await i18n.changeLanguage(locale);
    const text = insightMessage(i18n.t, locale, insight);
    expect(text).not.toMatch(/insight\./); // an untranslated key is returned as the key itself
    expect(text).not.toMatch(/\{\{/); // every placeholder was filled
    expect(text.trim().length).toBeGreaterThan(10);
  });
});

describe('insight wording follows the voice rules (docs/05 section 8)', () => {
  it('states the numbers and uses no moral words about food', async () => {
    await i18n.changeLanguage('en');
    const all = Object.values(EXAMPLES).flat().map((i) => insightMessage(i18n.t, 'en', i));
    expect(all[0]).toBe('72 g of protein left to reach your target.');
    expect(all[1]).toBe('1,500 kcal left and no breakfast logged yet.');
    for (const text of all) expect(text).not.toMatch(/cheat|bad|guilt|clean|crush|great job/i);
  });

  it('formats numbers for the language', async () => {
    await i18n.changeLanguage('es');
    expect(insightMessage(i18n.t, 'es', EXAMPLES.fiber_low_recent[0]!)).toContain('9,5 g de fibra');
    expect(insightMessage(i18n.t, 'es', EXAMPLES.protein_low_late[0]!)).toBe('Te faltan 72 g de proteína para llegar a tu objetivo.');
  });
});
