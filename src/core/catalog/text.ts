const STOPWORDS = new Set([
  'a', 'an', 'and', 'of', 'the', 'in', 'with', 'or', 'on',
  'de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'en', 'un', 'una', 'al', 'o',
]);

/** Lowercase, diacritics removed, punctuation to single spaces. Also the key of match memory. */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Light plural stripping so "eggs" and "egg" compare equal. */
export function stem(token: string): string {
  if (token.length > 3 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('es') && /(?:ch|sh|x|o)es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/** Normalized, stopword-free, stemmed tokens. */
export function tokenize(text: string): string[] {
  return normalizeName(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map(stem);
}

/** Normalized words without stopwords or stemming, for building FTS5 queries. */
export function searchWords(text: string): string[] {
  return normalizeName(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Spanish singular of a plural word: "frijoles" -> "frijol", "limones" -> "limon", "nueces" -> "nuez", "papas" -> "papa". */
export function stemEs(token: string): string {
  if (token.length > 4 && token.endsWith('ces')) return `${token.slice(0, -3)}z`;
  if (token.length > 4 && /[lrndjz]es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && /[aeiou]s$/.test(token)) return token.slice(0, -1);
  return token;
}

/**
 * Every plausible singular form of a normalized token (English and Spanish rules). Two tokens are the same word when
 * their form sets intersect, so "frijoles"/"frijol" and "apples"/"apple" both match, whatever the language of the name.
 */
export function stemForms(token: string): string[] {
  return [...new Set([token, stem(token), stemEs(token)])];
}

/** Tokens of a text as form sets: normalized, stopword-free, each with its singular forms. */
export function tokenForms(text: string): string[][] {
  return normalizeName(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map(stemForms);
}
