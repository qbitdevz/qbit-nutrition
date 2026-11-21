const STOPWORDS = new Set([
  'a', 'an', 'and', 'of', 'the', 'in', 'with', 'or', 'on',
  'de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'en', 'un', 'una', 'al',
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
