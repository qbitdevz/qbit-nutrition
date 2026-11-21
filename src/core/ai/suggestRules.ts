// What a model answer may not say (docs/05 section 8, docs/07 section 7). The prompt asks; this checks, because model output
// is untrusted. A suggestion whose text matches is dropped, not edited: wording is never repaired by guessing.

/** Lowercase, without accents, so "culpa" and "CULPÁ" match the same pattern. */
export const foldText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Moral words about food (docs/05 section 8: never "cheat", "bad", "guilt-free", "clean"), in English and Spanish. */
const MORAL = [
  /\bcheat/,
  /\bguilt/,
  /\bclean\b/,
  /\bjunk\b/,
  /\bsinful/,
  /\bnaughty\b/,
  /\bindulg/,
  /\bbad\b/,
  /\btreats?\b/,
  /\bculpa/,
  /\btrampa/,
  /\blimpi[oa]s?\b/,
  /\bmal[oa]s?\b/,
  /\bchatarra/,
  /\bpecad/,
  /\bantojo/,
];

/** Medical advice, health claims, and diet promises (docs/07 section 7: no rule gives medical advice). */
const MEDICAL = [
  /\bcure[sd]?\b/,
  /\bcuran?\b/,
  /\bcurar/,
  /\bheal(s|ed|ing)?\b/,
  /\bsanar\b/,
  /\btreat(ment|ments|ed|ing)\b/,
  /\btratamiento/,
  /\bdiabet/,
  /\bhypertens/,
  /\bhipertens/,
  /\bblood pressure\b/,
  /\bpresion arterial\b/,
  /\bcholesterol/,
  /\bcolesterol/,
  /\bdisease/,
  /\benfermedad/,
  /\bdiagnos/,
  /\bprescri/,
  /\bmedic(ation|ine|al|o|a|amento)/,
  /\btherap/,
  /\bterapia/,
  /\bsupplement/,
  /\bsuplement/,
  /\bdetox/,
  /\bdesintox/,
  /\bcancer\b/,
  /\bburn(s|ing)? fat\b/,
  /\bquema(r|s)? grasa\b/,
  /\bfasting\b/,
  /\bayuno\b/,
  /\bskip(ping)? (a )?meals?\b/,
  /\bsalt(ar|arse)? (una )?comidas?\b/,
];

/** True when any of the texts has a moral word about food or a medical claim. */
export function breaksWordingRules(...texts: string[]): boolean {
  const folded = foldText(texts.join(' \n '));
  return [...MORAL, ...MEDICAL].some((pattern) => pattern.test(folded));
}

/**
 * Model text as the plain text it is shown as: markdown links keep their text, tags, emphasis and code marks go, control and
 * direction-changing characters go, whitespace (line breaks included) becomes one space, and the length is bounded.
 */
export function plainText(text: string, max: number): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[*`#~]/g, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}
