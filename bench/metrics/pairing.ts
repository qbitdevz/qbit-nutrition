import { normalizeName } from '../../src/core/catalog';

/** The names a food can be recognised by: display name, English name, search terms, aliases. */
export interface NamedItem {
  names: readonly string[];
}

const tokens = (text: string): string[] => normalizeName(text).split(' ').filter(Boolean);

/**
 * 2 = same normalized name; 1 = every word of the shorter name appears in the longer one
 * ("rice, white" in "white rice, cooked"); 0 = no relation.
 */
function nameScore(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  if (ta.join(' ') === tb.join(' ')) return 2;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const set = new Set(long);
  return short.every((t) => set.has(t)) ? 1 : 0;
}

function itemScore(a: NamedItem, b: NamedItem): number {
  let best = 0;
  for (const x of a.names) for (const y of b.names) best = Math.max(best, nameScore(x, y));
  return best;
}

/**
 * One-to-one pairing of detected items with ground-truth items, best scores first
 * (ties: lower indexes first). Returns `[detectedIndex, truthIndex]` sorted by detected index.
 */
export function pairItems(detected: readonly NamedItem[], truth: readonly NamedItem[]): [number, number][] {
  const candidates: { d: number; t: number; score: number }[] = [];
  detected.forEach((d, di) =>
    truth.forEach((t, ti) => {
      const score = itemScore(d, t);
      if (score > 0) candidates.push({ d: di, t: ti, score });
    }),
  );
  candidates.sort((x, y) => y.score - x.score || x.d - y.d || x.t - y.t);
  const usedD = new Set<number>();
  const usedT = new Set<number>();
  const pairs: [number, number][] = [];
  for (const c of candidates) {
    if (usedD.has(c.d) || usedT.has(c.t)) continue;
    usedD.add(c.d);
    usedT.add(c.t);
    pairs.push([c.d, c.t]);
  }
  return pairs.sort((a, b) => a[0] - b[0]);
}
