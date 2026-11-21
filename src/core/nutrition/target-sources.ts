import {
  ACTIVITY_FACTORS,
  DEFAULT_MINIMUM_DAILY_KCAL,
  FAT_MIN_SHARE,
  GOAL_ADJUSTMENT,
  KCAL_PER_GRAM,
  MIFFLIN_ST_JEOR,
  PROTEIN_G_PER_KG,
  PROTEIN_MAX_SHARE,
} from './target-constants';
import { FIBER_MIN_G_PER_1000_KCAL, SODIUM_LIMIT_MG } from './insight-constants';

/** Where a value comes from. Every field is text the app can show as is; the quote is in English, as published. */
export interface TargetSource {
  title: string;
  publisher: string;
  url: string;
  /** Table, section, or page of the source. */
  locator: string;
  /** The sentence or table row the value comes from, as read. */
  quote: string;
}

export interface TargetSourceEntry {
  /** The value in code, referenced from the constants so the two cannot drift apart. */
  value: number | Readonly<Record<string, number>>;
  unit: string;
  /**
   * `sourced`: the source states this value. `sourced_range`: the source states a range and the value is
   * a point inside it chosen by the implementer. `unsourced`: no citable source was found; the value is the
   * most conservative reasonable choice and `source` is null.
   */
  status: 'sourced' | 'sourced_range' | 'unsourced';
  source: TargetSource | null;
  /** Caveats shown with the value: who the evidence is about, how the value was chosen. */
  note: string;
}

const MIFFLIN: TargetSource = {
  title: 'A new predictive equation for resting energy expenditure in healthy individuals',
  publisher: 'The American Journal of Clinical Nutrition 51(2):241-247 (Mifflin, St Jeor, Hill, Scott, Daugherty, Koh, 1990)',
  url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
  locator: 'Abstract',
  quote:
    'REE (males) = 10 x weight (kg) + 6.25 x height (cm) - 5 x age (y) + 5; REE (females) = 10 x weight (kg) + 6.25 x height (cm) - 5 x age (y) - 161.',
};

const FAO_2001 = {
  title: 'Human energy requirements: Report of a Joint FAO/WHO/UNU Expert Consultation (2001), chapter 5, Energy requirements of adults',
  publisher: 'Food and Agriculture Organization of the United Nations (FAO Food and Nutrition Technical Report Series 1)',
  url: 'https://www.fao.org/4/y5686e/y5686e07.htm',
};

const FAO_NOTE =
  'FAO classifies lifestyles in three ranges; the five app levels are points inside or at the limits of them. The factors multiply resting energy and describe populations, so an individual can differ.';

const GARTHE: TargetSource = {
  title: 'Effect of two different weight-loss rates on body composition and strength and power-related performance in elite athletes',
  publisher: 'International Journal of Sport Nutrition and Exercise Metabolism 21(2):97-104 (Garthe, Raastad, Refsnes, Koivisto, Sundgot-Borgen, 2011)',
  url: 'https://pubmed.ncbi.nlm.nih.gov/21558571/',
  locator: 'Abstract',
  quote:
    'Energy intake was reduced by 19% +/- 2% and 30% +/- 4% in SR and FR, respectively (SR: 0.7% of body weight lost per week; FR: 1.4%).',
};

const IRAKI: TargetSource = {
  title: 'Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review',
  publisher: 'Sports 7(7):154 (Iraki, Fitschen, Espinar, Helms, 2019)',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/',
  locator: 'Table 1 and section 8',
  quote:
    'Calories: +10-20% above maintenance (novice/intermediate), +5-10% above maintenance (advanced). ... a slightly hyper-energetic diet (~10-20% above maintenance calories) in the off-season.',
};

const JAGER: TargetSource = {
  title: 'International Society of Sports Nutrition Position Stand: protein and exercise',
  publisher: 'Journal of the International Society of Sports Nutrition 14:20 (Jager et al., 2017)',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/',
  locator: 'Position stand, point 2',
  quote:
    'For building muscle mass and for maintaining muscle mass through a positive muscle protein balance, an overall daily protein intake in the range of 1.4-2.0 g protein/kg body weight/day (g/kg/d) is sufficient for most exercising individuals.',
};

const MORTON: TargetSource = {
  title:
    'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults',
  publisher: 'British Journal of Sports Medicine 52(6):376-384 (Morton et al., 2018)',
  url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
  locator: 'Abstract, summary',
  quote:
    'With protein supplementation, protein intakes at amounts greater than ~1.6 g/kg/day do not further contribute RET-induced gains in FFM.',
};

const ROBERTS: TargetSource = {
  title: 'Nutritional Recommendations for Physique Athletes',
  publisher: 'Journal of Human Kinetics 71:79-108 (Roberts, Helms, Trexler, Fitschen, 2020)',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7052702/',
  locator: 'Protein section',
  quote:
    'Since there is currently little evidence that high protein intake negatively impacts health in non-clinical populations, we recommend 1.8-2.7 g/kg/day',
};

const DGA = {
  title: 'Dietary Guidelines for Americans 2015-2020 (8th edition)',
  publisher: 'U.S. Department of Health and Human Services and U.S. Department of Agriculture',
  url: 'https://odphp.health.gov/sites/default/files/2019-09/2015-2020_Dietary_Guidelines.pdf',
};

const DGA_AMDR_LOCATOR = 'Appendix 7, Table A7-1, Daily Nutritional Goals for Age-Sex Groups (pp. 96-97)';

export type TargetConstantId =
  | 'restingEnergy.mifflinStJeor'
  | `activityFactor.${keyof typeof ACTIVITY_FACTORS}`
  | 'goalAdjustment.lose_fat.gentle'
  | 'goalAdjustment.lose_fat.moderate'
  | 'goalAdjustment.gain_muscle.gentle'
  | 'goalAdjustment.gain_muscle.moderate'
  | `proteinPerKg.${keyof typeof PROTEIN_G_PER_KG}`
  | 'fatMinShare'
  | 'proteinMaxShare'
  | 'kcalPerGram'
  | 'minimumKcal.female'
  | 'minimumKcal.male'
  | 'insight.fiberMinGramsPer1000Kcal'
  | 'insight.sodiumLimitMg';

const factor = (id: keyof typeof ACTIVITY_FACTORS, locator: string, quote: string, status: TargetSourceEntry['status']): TargetSourceEntry => ({
  value: ACTIVITY_FACTORS[id],
  unit: 'x resting energy',
  status,
  source: { ...FAO_2001, locator, quote },
  note: FAO_NOTE,
});

/**
 * Sources of every constant used to propose targets, for the "how this is calculated" screen (S4).
 * Read from the sources themselves on 2026-11-21; the quotes are what was read there.
 */
export const TARGET_SOURCES: Readonly<Record<TargetConstantId, TargetSourceEntry>> = {
  'restingEnergy.mifflinStJeor': {
    value: { ...MIFFLIN_ST_JEOR },
    unit: 'kcal/day: perKg x kg + perCm x cm + perYear x age + sex term',
    status: 'sourced',
    source: MIFFLIN,
    note: 'Derived from 498 healthy adults aged 19-78 measured by indirect calorimetry. The paper gives the exact (9.99, 4.92) and the simplified (10, 5) forms; the simplified one is used.',
  },

  'activityFactor.sedentary': factor(
    'sedentary',
    'Section 5.3.2, Extremes of low and high PALs, and Table 5.3',
    'PAL of 1.40, which represents the lower limit of the sedentary lifestyle range shown in Table 5.3. (Table 5.3: sedentary or light activity lifestyle 1.40-1.69.)',
    'sourced',
  ),
  'activityFactor.light': factor(
    'light',
    'Section 5.3.2, Active or moderately active lifestyles',
    'one hour ... of moderate to vigorous exercise ... can raise a person’s average PAL from 1.55 (corresponding to the sedentary category) to 1.75 (the moderately active category).',
    'sourced',
  ),
  'activityFactor.moderate': factor(
    'moderate',
    'Section 5.3.2, Active or moderately active lifestyles',
    'one hour ... of moderate to vigorous exercise ... can raise a person’s average PAL from 1.55 (corresponding to the sedentary category) to 1.75 (the moderately active category).',
    'sourced',
  ),
  'activityFactor.active': factor(
    'active',
    'Table 5.3',
    'Active or moderately active lifestyle 1.70-1.99.',
    'sourced_range',
  ),
  'activityFactor.very_active': factor(
    'very_active',
    'Table 5.3',
    'Vigorous or vigorously active lifestyle 2.00-2.40 (PAL values > 2.40 are difficult to maintain over a long period of time).',
    'sourced',
  ),

  'goalAdjustment.lose_fat.gentle': {
    value: GOAL_ADJUSTMENT.lose_fat.gentle,
    unit: 'fraction of maintenance energy',
    status: 'unsourced',
    source: null,
    note: 'No published guideline giving a percentage for a gentle pace was found. Chosen as about half of the sourced 19%, to stay conservative. For context, the Dietary Guidelines 2015-2020 (chapter 1) advise 500 to 750 kcal/day less for 1 to 1.5 lb/week, and the NHLBI Practical Guide (2000) 500 to 1,000 kcal/day less, which are absolute amounts, not percentages.',
  },
  'goalAdjustment.lose_fat.moderate': {
    value: GOAL_ADJUSTMENT.lose_fat.moderate,
    unit: 'fraction of maintenance energy',
    status: 'sourced',
    source: GARTHE,
    note: 'Measured in 24 elite athletes doing resistance training, for a 0.7% body weight loss per week. It is the smaller of the two deficits in that study (the faster one, 30%, is not used).',
  },
  'goalAdjustment.gain_muscle.gentle': {
    value: GOAL_ADJUSTMENT.gain_muscle.gentle,
    unit: 'fraction of maintenance energy',
    status: 'sourced',
    source: IRAKI,
    note: 'Recommendation for bodybuilders in the off-season: the lower end of +10-20% (novice/intermediate), which is also the upper end of +5-10% for advanced lifters.',
  },
  'goalAdjustment.gain_muscle.moderate': {
    value: GOAL_ADJUSTMENT.gain_muscle.moderate,
    unit: 'fraction of maintenance energy',
    status: 'sourced',
    source: IRAKI,
    note: 'The upper end of +10-20% for novice and intermediate bodybuilders. The same review advises advanced lifters to stay at +5-10%; the app does not know training experience.',
  },

  'proteinPerKg.maintain': {
    value: PROTEIN_G_PER_KG.maintain,
    unit: 'g per kg of body weight per day',
    status: 'sourced',
    source: JAGER,
    note: 'Lower bound of 1.4-2.0 g/kg/day for exercising individuals. The same position stand gives the RDA as 0.8 g/kg/day for sedentary adults.',
  },
  'proteinPerKg.gain_muscle': {
    value: PROTEIN_G_PER_KG.gain_muscle,
    unit: 'g per kg of body weight per day',
    status: 'sourced',
    source: MORTON,
    note: 'Meta-analysis of resistance training trials in healthy adults; the plateau point is 1.62 g/kg/day.',
  },
  'proteinPerKg.lose_fat': {
    value: PROTEIN_G_PER_KG.lose_fat,
    unit: 'g per kg of body weight per day',
    status: 'sourced',
    source: ROBERTS,
    note: 'Lower bound of 1.8-2.7 g/kg/day, written for physique athletes in a calorie deficit.',
  },

  fatMinShare: {
    value: { ...FAT_MIN_SHARE },
    unit: 'fraction of energy',
    status: 'sourced',
    source: { ...DGA, locator: DGA_AMDR_LOCATOR, quote: 'Total Fat, % kcal, AMDR: 20-35 (ages 19 and over), 25-35 (ages 14-18).' },
    note: 'The Acceptable Macronutrient Distribution Range of the Institute of Medicine. The lower bound is the share fat gets; the 2020-2025 edition of the Guidelines carries the same adult range. The 25% applies only to a person who is exactly 18.',
  },
  proteinMaxShare: {
    value: { ...PROTEIN_MAX_SHARE },
    unit: 'fraction of energy',
    status: 'sourced',
    source: { ...DGA, locator: DGA_AMDR_LOCATOR, quote: 'Protein, % kcal, AMDR: 10-35 (ages 19 and over), 10-30 (ages 14-18).' },
    note: 'The upper bound caps the protein default so protein never exceeds the Acceptable Macronutrient Distribution Range.',
  },
  kcalPerGram: {
    value: { ...KCAL_PER_GRAM },
    unit: 'kcal per gram',
    status: 'sourced',
    source: {
      ...DGA,
      locator: 'Chapter 1, Key Recommendations (calories section)',
      quote: 'On average, carbohydrates and protein contain 4 calories per gram, fats contain 9 calories per gram',
    },
    note: 'General Atwater factors.',
  },

  'minimumKcal.female': {
    value: DEFAULT_MINIMUM_DAILY_KCAL.female,
    unit: 'kcal per day',
    status: 'sourced',
    source: {
      ...DGA,
      locator: 'Chapter 1, Key Recommendations (adults who are overweight or obese; pp. 20-21)',
      quote: 'Eating patterns that contain 1,200 to 1,500 calories each day can help most women lose weight safely',
    },
    note: 'PROPOSED, NOT YET APPROVED BY THE OWNER (RN-14 is "A confirmar" in the contract). The lower end of the range for weight loss. The person can change it in Settings.',
  },
  'minimumKcal.male': {
    value: DEFAULT_MINIMUM_DAILY_KCAL.male,
    unit: 'kcal per day',
    status: 'sourced',
    source: {
      ...DGA,
      locator: 'Chapter 1, Key Recommendations (adults who are overweight or obese; pp. 20-21)',
      quote: 'eating patterns that contain 1,500 to 1,800 calories each day are suitable for most men for weight loss',
    },
    note: 'PROPOSED, NOT YET APPROVED BY THE OWNER (RN-14 is "A confirmar" in the contract). The lower end of the range for weight loss. The person can change it in Settings.',
  },

  'insight.fiberMinGramsPer1000Kcal': {
    value: FIBER_MIN_G_PER_1000_KCAL,
    unit: 'g per 1,000 kcal',
    status: 'sourced',
    source: { ...DGA, locator: DGA_AMDR_LOCATOR, quote: 'Dietary Fiber, g: 14 g/1,000 kcal (Adequate Intake).' },
    note: 'Threshold of the "fiber is low" suggestion. Using it as a trigger is the implementer’s choice.',
  },
  'insight.sodiumLimitMg': {
    value: SODIUM_LIMIT_MG,
    unit: 'mg per day',
    status: 'sourced',
    source: {
      ...DGA,
      locator: 'Chapter 1, Key Recommendations',
      quote: 'Healthy eating patterns limit sodium to less than 2,300 mg per day for adults and children ages 14 years and older',
    },
    note: 'Threshold of the "sodium is high" suggestion. Using it as a trigger is the implementer’s choice.',
  },
};
