import type { Unit } from './types';

type Dimension = 'mass' | 'energy' | 'volume';

/** Factor to the dimension's base unit (g, kcal, ml). */
const UNITS: Record<Unit, { dimension: Dimension; toBase: number }> = {
  g: { dimension: 'mass', toBase: 1 },
  mg: { dimension: 'mass', toBase: 1e-3 },
  ug: { dimension: 'mass', toBase: 1e-6 },
  kg: { dimension: 'mass', toBase: 1000 },
  oz: { dimension: 'mass', toBase: 28.349523125 },
  lb: { dimension: 'mass', toBase: 453.59237 },
  kcal: { dimension: 'energy', toBase: 1 },
  kj: { dimension: 'energy', toBase: 1 / 4.184 },
  ml: { dimension: 'volume', toBase: 1 },
  l: { dimension: 'volume', toBase: 1000 },
};

export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b) throw new RangeError(`unknown unit: ${!a ? from : to}`);
  if (a.dimension !== b.dimension) {
    throw new RangeError(`cannot convert ${from} (${a.dimension}) to ${to} (${b.dimension})`);
  }
  return (value * a.toBase) / b.toBase;
}
