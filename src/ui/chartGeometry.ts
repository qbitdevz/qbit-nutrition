/** Pure geometry of the trend chart: where each point and tick goes, and the line through them. */

export interface ChartPoint {
  /** Id of the entry behind the point. */
  id: string;
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  value: number;
}

interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GeometryInput {
  width: number;
  height: number;
  padding: Padding;
  /** Oldest first. */
  points: readonly ChartPoint[];
  scale: { min: number; max: number };
}

export interface Geometry {
  points: { id: string; x: number; y: number }[];
  /** `M x y L x y ...`, or null with fewer than two points: one point has no line to draw. */
  path: string | null;
  /** Length of the line, for the draw-in animation. */
  length: number;
  yOf: (value: number) => number;
  /** Left and right edge of the plot area. */
  plot: { left: number; right: number; top: number; bottom: number };
}

const day = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

const round = (n: number): number => Math.round(n * 100) / 100;

export function chartGeometry({ width, height, padding, points, scale }: GeometryInput): Geometry {
  const left = padding.left;
  const right = width - padding.right;
  const top = padding.top;
  const bottom = height - padding.bottom;
  const span = scale.max - scale.min || 1;
  const yOf = (value: number) => round(bottom - ((value - scale.min) / span) * (bottom - top));

  const first = points[0];
  const last = points[points.length - 1];
  const t0 = first ? day(first.date) : 0;
  const t1 = last ? day(last.date) : 0;
  const placed = points.map((p) => ({
    id: p.id,
    x: round(t1 === t0 ? (left + right) / 2 : left + ((day(p.date) - t0) / (t1 - t0)) * (right - left)),
    y: yOf(p.value),
  }));

  let length = 0;
  for (let i = 1; i < placed.length; i++) length += Math.hypot(placed[i]!.x - placed[i - 1]!.x, placed[i]!.y - placed[i - 1]!.y);

  return {
    points: placed,
    path: placed.length > 1 ? placed.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join('') : null,
    length,
    yOf,
    plot: { left, right, top, bottom },
  };
}
