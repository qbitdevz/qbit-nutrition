/** Longest side of the photo sent to a provider (docs/07 section 2). A starting value until the benchmark fixes it. */
export const MAX_LONG_EDGE = 1024;

export interface FittedSize {
  width: number;
  height: number;
  /** False when the image already fit and keeps its size. */
  scaled: boolean;
}

/**
 * The size an image of `width` x `height` pixels is shrunk to so its long edge is at most `maxEdge`,
 * keeping the aspect ratio. An image that already fits is never enlarged. The short edge is rounded
 * and never below 1 px.
 */
export function fitLongEdge(width: number, height: number, maxEdge: number = MAX_LONG_EDGE): FittedSize {
  for (const [label, value] of [['width', width], ['height', height], ['maxEdge', maxEdge]] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive number, got ${value}`);
  }
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height, scaled: false };
  const factor = maxEdge / long;
  return width >= height
    ? { width: maxEdge, height: Math.max(1, Math.round(height * factor)), scaled: true }
    : { width: Math.max(1, Math.round(width * factor)), height: maxEdge, scaled: true };
}
