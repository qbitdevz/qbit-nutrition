/** Splits a wait in seconds into whole hours and minutes, rounded up to the next minute: 7,800 s is 2 h 10 min. */
export function waitParts(seconds: number): { hours: number; minutes: number } {
  const total = Math.max(1, Math.ceil(seconds / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
