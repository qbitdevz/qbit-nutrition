import { composeSpanish, type ComposeResult, type Glossary } from './compose';

const FRACTIONS: [RegExp, string][] = [
  [/^0\.5(?=\s)/, '1/2'],
  [/^0\.25(?=\s)/, '1/4'],
  [/^0\.75(?=\s)/, '3/4'],
  [/^0\.33(?=\s)/, '1/3'],
  [/^0\.67(?=\s)/, '2/3'],
];

/** A quantity followed only by a size ("1 medium", "1 small/regular") describes a unit of the food: "1 medium unit". */
const SIZE_ONLY = /^([\d./\s]+)((?:extra )?(?:small|medium|large|regular|jumbo|mini|miniature|thin|thick)(?:(?:\/| or )(?:very )?(?:small|medium|large|regular|thin|thick|bite size))*)(?=\s*(?:,|\(|$))/;

const SIZE = '(?:extra |very )?(?:small|medium|large|thin|thick|regular|miniature)';
/** "1 large or thick slice": English puts the sizes before the noun, Spanish after it ("1 slice large or thick"). */
const SIZES_BEFORE_NOUN = new RegExp(`^([\\d/. ]+)(${SIZE}(?:(?: or |/)${SIZE})+) ([a-z]+)(?=\\s*(?:,|\\(|$))`);

const EACH_ALONE = /^(\S+) each$/;
const EACH_BEFORE_SIZE = /^(\S+) each (?=(?:extra |very )?(?:small|medium|large|regular))/;
const UNITS = '(?:fl oz|g|kg|oz|lb|ml|cup|tbsp|tsp|tablespoon|teaspoon|quart|pint|liter|milliliter)';
/** "593 g raw meat", "1 cup penne": English drops the "of" that Spanish needs. */
const MEASURE_THEN_NOUN = new RegExp(`^(.*?\\b\\d[\\d./]*\\s*${UNITS})\\s+(?!(?:with|without|or|and|from|to|in|as|per|of|yield|excluding|equal|approx|about|no|nfs)\\b)(?!(?:cooked|raw|chopped|diced|sliced|sifted|packed|thawed|unthawed|crushed|shredded|mashed|dry|frozen|prepared)\\b\\s*(?:[,()]|$))(?=[a-z])`);
/** "1 serving 3 cookies": a counted amount after the unit goes in parentheses. */
const COUNTED_SERVING = /^(\d[\d./]*) ([a-z-]+) (\d[^()]*)$/;

/**
 * Spanish text of a household-measure label from FoodData Central ("1 cup, cooked, diced" -> "1 taza, cocida, en cubos"), made
 * with the same composer and glossaries as food names, plus the units of `data/portions/`. Only text changes: grams do not.
 */
export function portionLabelEs(label: string, glossary: Glossary): ComposeResult & { text: string } {
  let text = label.trim();
  for (const [re, to] of FRACTIONS) text = text.replace(re, to);
  text = text
    .replace(EACH_ALONE, '$1 unit')
    .replace(EACH_BEFORE_SIZE, '$1 ')
    .replace(MEASURE_THEN_NOUN, '$1 of ')
    .replace(COUNTED_SERVING, '$1 $2 ($3)')
    .replace(SIZES_BEFORE_NOUN, '$1$3 $2')
    .replace(SIZE_ONLY, '$1$2 unit');
  // A product name (two or more capitalized words, or an unknown capitalized one) stays as written.
  // (A run of capitalized words that are all in the glossary, like "Onion Edible", is just words in title case.)
  const names = (text.match(/\b[A-Z][\w'’-]*(?: [A-Z][\w'’-]*)+\b/g) ?? [])
    .filter((run) => run.split(' ').some((w) => !glossary.terms.has(w.toLowerCase()) && !glossary.keep.has(w.toLowerCase())))
    .flatMap((run) => run.split(' '));
  const g = names.length > 0 ? { ...glossary, keep: new Set([...glossary.keep, ...names.map((n) => n.toLowerCase())]) } : glossary;
  const r = composeSpanish(text, g);
  return { ...r, text: r.name.replace(/(\d)\.(\d)/g, '$1,$2') };
}
