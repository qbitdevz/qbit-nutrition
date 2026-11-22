import { validDocument } from '../../testing/validDocument';
import { parseExportDocument } from '../exportFormat';

const doc = (): any => JSON.parse(JSON.stringify(validDocument()));

/** The file is refused at exactly this place. */
function refusedAt(mutate: (d: any) => void, where: string, text?: (json: string) => string) {
  const d = doc();
  mutate(d);
  const raw = text ? JSON.parse(text(JSON.stringify(d))) : d;
  expect(parseExportDocument(raw)).toEqual({ ok: false, code: 'invalid', where });
}

const accepted = (mutate: (d: any) => void) => {
  const d = doc();
  mutate(d);
  expect(parseExportDocument(d)).toMatchObject({ ok: true });
};

describe('numbers are bounded to the ranges the app’s own forms enforce (S3)', () => {
  it('refuses a number that is not finite (1e999 is Infinity once parsed)', () => {
    refusedAt((d) => (d.meals[0].items[0].grams = 'GRAMS'), 'meals[0].items[0].grams', (json) => json.replace('"GRAMS"', '1e999'));
    refusedAt((d) => (d.meals[0].items[0].kcal = 'KCAL'), 'meals[0].items[0].kcal', (json) => json.replace('"KCAL"', '1e999'));
  });

  it.each([
    ['grams above the portion limit', (d: any) => (d.meals[0].items[0].grams = 5001), 'meals[0].items[0].grams'],
    ['an absurd item calorie count', (d: any) => (d.meals[0].items[0].kcal = 1e12), 'meals[0].items[0].kcal'],
    ['an absurd macro amount', (d: any) => (d.meals[0].items[0].protein_g = 1e9), 'meals[0].items[0].protein_g'],
    ['an absurd nutrient amount', (d: any) => (d.meals[0].items[0].nutrients = { sodium: 1e12 }), 'meals[0].items[0].nutrients.sodium'],
    ['a height outside 50 to 260 cm', (d: any) => (d.profile.height_cm = 10_000), 'profile.height_cm'],
    ['a height below 50 cm', (d: any) => (d.profile.height_cm = 10), 'profile.height_cm'],
    ['a weight outside 20 to 500 kg', (d: any) => (d.body_measurements[0].value = 5), 'body_measurements[0].value'],
    ['a weight above 500 kg', (d: any) => (d.body_measurements[0].value = 900), 'body_measurements[0].value'],
    ['a waist outside the range', (d: any) => (d.body_measurements[0] = { ...d.body_measurements[0], kind: 'waist', value: 5000 }), 'body_measurements[0].value'],
    ['a body fat above 70 percent', (d: any) => (d.body_measurements[0] = { ...d.body_measurements[0], kind: 'body_fat_pct', value: 95 }), 'body_measurements[0].value'],
    ['a calorie target above 10,000', (d: any) => (d.goals[0].kcal_target = 99_999), 'goals[0].kcal_target'],
    ['a calorie target below 500', (d: any) => (d.goals[0].kcal_target = 100), 'goals[0].kcal_target'],
    ['a protein target above 1,000 g', (d: any) => (d.goals[0].protein_g_target = 5000), 'goals[0].protein_g_target'],
    ['a basis weight outside the weight range', (d: any) => (d.goals[0].basis_weight_kg = 1e6), 'goals[0].basis_weight_kg'],
    ['a custom food above 1,000 kcal per 100 g', (d: any) => (d.custom_foods[0].kcal_100g = 5000), 'custom_foods[0].kcal_100g'],
    ['a custom food with more than 100 g of protein per 100 g', (d: any) => (d.custom_foods[0].protein_100g = 150), 'custom_foods[0].protein_100g'],
    ['a default portion above the portion limit', (d: any) => (d.custom_foods[0].default_portion_g = 1e6), 'custom_foods[0].default_portion_g'],
    ['an absurd use count', (d: any) => (d.food_usage[0].use_count = 1e12), 'food_usage[0].use_count'],
    ['an absurd confirmation count', (d: any) => (d.match_memory[0].times_confirmed = 1e12), 'match_memory[0].times_confirmed'],
    ['a provider timeout of a day', (d: any) => (d.ai_providers[0].timeout_s = 86_400), 'ai_providers[0].timeout_s'],
  ])('refuses %s', (_name, mutate, where) => refusedAt(mutate, where));

  it('accepts the edges of the ranges', () => {
    accepted((d) => {
      d.profile.height_cm = 50;
      d.body_measurements[0].value = 500;
      d.goals[0].kcal_target = 10_000;
      d.goals[0].protein_g_target = 1;
      d.meals[0].items[0].grams = 5000;
      d.custom_foods[0].kcal_100g = 1000;
    });
  });
});

describe('dates are plausible and agree with each other (S3)', () => {
  it.each([
    ['a meal day long before the app existed', (d: any) => (d.meals[0].local_date = '1850-01-01'), 'meals[0].local_date'],
    ['a meal day in the far future', (d: any) => (d.meals[0].local_date = '9999-12-31'), 'meals[0].local_date'],
    ['a meal instant in the far past', (d: any) => (d.meals[0].eaten_at = '1900-01-01T00:00:00.000Z'), 'meals[0].eaten_at'],
    ['a creation time far in the future', (d: any) => (d.meals[0].created_at = '3000-01-01T00:00:00.000Z'), 'meals[0].created_at'],
    ['a measurement day in the far future', (d: any) => (d.body_measurements[0].measured_on = '2999-01-01'), 'body_measurements[0].measured_on'],
    ['a goal starting in the year 3000', (d: any) => (d.goals[0].start_date = '3000-01-01'), 'goals[0].start_date'],
    ['a birth date more than 120 years back', (d: any) => (d.profile.birth_date = '1800-01-01'), 'profile.birth_date'],
    ['a birth date after the export', (d: any) => (d.profile.birth_date = '2030-01-01'), 'profile.birth_date'],
    ['a local date two days away from the instant, which no time zone explains', (d: any) => (d.meals[0].local_date = '2026-06-03'), 'meals[0].local_date'],
  ])('refuses %s', (_name, mutate, where) => refusedAt(mutate, where));

  it('accepts a local date one day either side of the UTC date (time zones from -12 to +14)', () => {
    accepted((d) => (d.meals[0].local_date = '2026-05-31'));
    accepted((d) => (d.meals[0].local_date = '2026-06-02'));
  });
});

describe('rows must not contradict each other (S3)', () => {
  const second = (d: any, over: object) => d.goals.push({ ...d.goals[0], id: 'goal-2', ...over });

  it('refuses goal periods that overlap', () => {
    refusedAt((d) => {
      d.goals[0].end_date = '2026-03-31';
      second(d, { start_date: '2026-03-15', end_date: null });
    }, 'goals[1].start_date');
  });

  it('refuses two periods that start the same day', () => {
    refusedAt((d) => {
      d.goals[0].end_date = '2026-03-31';
      second(d, { start_date: '2026-01-01', end_date: null });
    }, 'goals[1].start_date');
  });

  it('refuses an open goal that is not the latest one', () => {
    refusedAt((d) => second(d, { start_date: '2026-07-01', end_date: '2026-12-31' }), 'goals[0].end_date');
  });

  it('accepts consecutive periods, whatever their order in the file', () => {
    accepted((d) => {
      d.goals[0].start_date = '2026-04-01';
      second(d, { start_date: '2026-01-01', end_date: '2026-03-31' });
    });
  });

  it('refuses two items at the same position of a meal', () => {
    refusedAt((d) => d.meals[0].items.push({ ...d.meals[0].items[0], id: 'item-2' }), 'meals[0].items[1].position');
  });
});

describe('a meal always has something in it (S3)', () => {
  it('refuses a meal with no items, which the app never produces', () => {
    refusedAt((d) => (d.meals[0].items = []), 'meals[0].items');
  });
});

describe('settings: only known keys, with values the app can read (S3)', () => {
  it('accepts the settings the app writes', () => {
    accepted((d) => (d.settings = { locale: 'es', keep_photos: 'false', minimum_daily_kcal: '1400', scan_tip_count: '2' }));
  });

  it.each([
    ['an unknown key', { theme: 'dark' }, 'settings.theme'],
    ['installation state', { onboarding_completed_at: '2026-01-01T00:00:00.000Z' }, 'settings.onboarding_completed_at'],
    ['an acknowledgement', { 'ai_notice_ack.abc': 'x' }, 'settings.ai_notice_ack.abc'],
    ['a language the app has not got', { locale: 'fr' }, 'settings.locale'],
    ['a keep-photos value that is not true or false', { keep_photos: 'maybe' }, 'settings.keep_photos'],
    ['a minimum energy outside its range', { minimum_daily_kcal: '99999' }, 'settings.minimum_daily_kcal'],
    ['a minimum energy that is not a number', { minimum_daily_kcal: 'lots' }, 'settings.minimum_daily_kcal'],
    ['a tip counter that is not a whole number', { scan_tip_count: '-3' }, 'settings.scan_tip_count'],
  ])('refuses %s', (_name, settings, where) => refusedAt((d) => (d.settings = settings), where));
});
