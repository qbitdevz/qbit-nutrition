// Prompt: docs/07-ai-pipeline.md section 5. Written in English regardless of
// the user's language; the locale is a parameter. Bump PROMPT_VERSION with
// every prompt change (document 07, section 10) and run the benchmark.

export const PROMPT_VERSION = 1;

export type Locale = 'en' | 'es';

const LOCALE_NAME: Record<Locale, string> = { en: 'English', es: 'Spanish' };

const MAX_HINT_CHARS = 500;

const SYSTEM_PROMPT_V1 = `You analyze a photo of a meal for a nutrition log.

Your job is to identify each distinct food and estimate how much of it is on
the plate. You do not calculate the meal's nutrition; a food database does
that from your output.

Identify foods
- List each visible food as its own item. Split composite dishes into their
  main components when they are visually separable (for example chicken,
  rice, salad). Keep a dish as one item when its components cannot be
  separated or weighed apart (for example lasagna, soup, a sandwich).
- Include sauces, dressings, cheese, and drinks you can see.
- For each item give a generic English name with its preparation, such as
  "chicken breast, grilled" or "white rice, cooked", because the database is
  searched in English. Add up to four alternative search terms.
- Give the display name in the user's language: {locale}.

Estimate portions
- Estimate the edible weight in grams as served (cooked weight for cooked
  food).
- Use visible references for scale: plate and bowl size, cutlery, hands,
  packaging. A standard dinner plate is about 26 cm across.
- State the basis of each estimate in a few words.
- If the user gives a hint about a food or an amount, trust it over what you
  see.

Be honest about uncertainty
- Rate your confidence in the food identity and in the portion separately.
- Do not invent items you cannot see. If cooking fat or oil is likely but
  not visible, mention it in the hidden ingredients note instead of adding
  an item.
- If the photo does not show food, set is_food to false and return no items.

Also give your best estimate of energy and macronutrients per 100 g for each
item. This is used only when the database has no match.

User hint: {hint}`;

/**
 * A hint is user text inside the prompt: keep it on one line (so it cannot
 * open a new prompt section) and bounded.
 */
function sanitizeHint(hint: string | undefined): string {
  const oneLine = (hint ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_HINT_CHARS);
  return oneLine === '' ? 'none' : oneLine;
}

export function buildSystemPrompt(options: { locale: Locale; hint?: string }): string {
  return SYSTEM_PROMPT_V1.replace('{locale}', () => `${LOCALE_NAME[options.locale]} (${options.locale})`).replace(
    '{hint}',
    () => sanitizeHint(options.hint),
  );
}

/** The user turn that accompanies the image. */
export const USER_INSTRUCTION = 'Analyze this meal photo and report the result in the required format.';

/** Appended to the system prompt in output mode "prompt" (mode C). */
export function jsonOnlyInstruction(schema: object): string {
  return [
    '',
    'Output format',
    'Reply with a single JSON object and nothing else: no prose, no code fences.',
    'The object must match this JSON Schema:',
    JSON.stringify(schema),
  ].join('\n');
}

/** The user turn of the single repair retry; it carries the validation error. */
export function buildRepairMessage(validationError: string): string {
  return [
    'Your previous reply did not pass validation:',
    validationError,
    '',
    'Reply again with only the corrected JSON object, using the same format and the same photo.',
  ].join('\n');
}
