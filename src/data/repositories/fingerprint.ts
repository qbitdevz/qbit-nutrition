import type { NutrientAmounts } from '../../core/nutrition';

/**
 * The content fingerprint of an imported table: the same table read twice (from the same file, or from the same data in another format)
 * gets the same fingerprint. It covers what a table IS: the basis (per 100 g or per 100 ml) and, for every food, its name, group and each
 * value. The ORDER of the foods does not matter and spaces around names do not, so a re-saved file still matches.
 *
 * It is not a cryptographic hash (React Native has no synchronous one, and none is needed): two 53-bit string hashes side by side, 106 bits.
 * A fingerprint can only ever suppress a duplicate by offering a choice, never delete anything by itself, so a collision costs one question.
 */
export interface FingerprintFood {
  name: string;
  group?: string | null;
  per100g: NutrientAmounts;
}

/** cyrb53, a well-known 53-bit string hash with good avalanche, seeded so that two runs are independent. */
function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const byCode = ([a]: [string, unknown], [b]: [string, unknown]): number => (a < b ? -1 : a > b ? 1 : 0);

/** One food as text: name and group trimmed (a blank group is no group), values by code. */
export function canonicalFood(food: FingerprintFood): string {
  const values = (Object.entries(food.per100g) as [string, number | undefined][]).filter((entry): entry is [string, number] => entry[1] !== undefined).sort(byCode);
  return JSON.stringify([food.name.trim(), food.group?.trim() ? food.group.trim() : null, values]);
}

export function contentFingerprint(basis: 'g' | 'ml', foods: readonly FingerprintFood[]): string {
  const text = `${basis}\n${foods.map(canonicalFood).sort().join('\n')}`;
  return cyrb53(text, 0) + cyrb53(text, 1);
}

/**
 * The positions whose names stand for a whole table when it has no fingerprint (first, second, third, a third of the way, the middle, two
 * thirds, second to last, last), without repeats, for a table of `n` foods.
 */
export function sampleIndexes(n: number): number[] {
  if (n <= 0) return [];
  const picks = [0, 1, 2, Math.floor(n / 3), Math.floor(n / 2), Math.floor((2 * n) / 3), n - 2, n - 1].filter((i) => i >= 0 && i < n);
  return [...new Set(picks)].sort((a, b) => a - b);
}
