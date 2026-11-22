import { palette, type Colors } from '../tokens';

/** WCAG 2.x relative luminance and contrast ratio, computed from the token values. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const NON_TEXT = 3;

/** [foreground token, background token, minimum ratio] (design/system.md, "Contrast ratios"). */
const PAIRS: [keyof Colors, keyof Colors, number][] = [
  ['text', 'bg', TEXT],
  ['text', 'surface', TEXT],
  ['text', 'surfaceRaised', TEXT],
  ['text', 'primarySoft', TEXT],
  ['text', 'warningSoft', TEXT],
  ['textMuted', 'bg', TEXT],
  ['textMuted', 'surface', TEXT],
  ['textMuted', 'surfaceRaised', TEXT],
  ['primaryText', 'bg', TEXT],
  ['primaryText', 'surface', TEXT],
  ['primaryText', 'surfaceRaised', TEXT],
  ['primaryText', 'primarySoft', TEXT],
  // Primary button label on its fill, and the secondary and ghost button labels.
  ['onPrimary', 'primary', TEXT],
  ['text', 'bg', TEXT],
  ['primaryText', 'bg', TEXT],
  // Disabled button: muted label on the disabled fill.
  ['textMuted', 'surfaceHigh', TEXT],
  ['ai', 'aiSoft', TEXT],
  ['onAi', 'ai', TEXT],
  ['green', 'surface', TEXT],
  ['warning', 'surface', TEXT],
  ['warning', 'warningSoft', TEXT],
  ['toastText', 'toastBg', TEXT],
  ['toastAction', 'toastBg', TEXT],
  // Non-text: control boundaries, fills against their tracks, focus ring.
  ['borderStrong', 'bg', NON_TEXT],
  ['borderStrong', 'surface', NON_TEXT],
  ['borderStrong', 'surfaceRaised', NON_TEXT],
  ['primary', 'surfaceRaised', NON_TEXT],
  ['primary', 'surfaceHigh', NON_TEXT],
  ['protein', 'surfaceHigh', NON_TEXT],
  ['carbs', 'surfaceHigh', NON_TEXT],
  ['fat', 'surfaceHigh', NON_TEXT],
  ['focus', 'bg', NON_TEXT],
];

describe.each(['dark', 'light'] as const)('%s theme contrast (WCAG AA)', (scheme) => {
  const colors = palette[scheme];

  it.each(PAIRS)('%s on %s is at least %d:1', (fg, bg, min) => {
    expect(contrast(colors[fg] as string, colors[bg] as string)).toBeGreaterThanOrEqual(min);
  });

  it('keeps the scan icon legible on the lightest part of its gradient', () => {
    expect(contrast(colors.onPrimary, colors.scanGradient[0])).toBeGreaterThanOrEqual(TEXT);
  });
});

describe('palette rules', () => {
  it('matches the documented ratios for the pairs the design system names', () => {
    // design/system.md: body text 18.10:1 and primary button label 5.37:1 on dark, 5.74:1 on light.
    expect(contrast(palette.dark.text, palette.dark.bg)).toBeCloseTo(18.1, 1);
    expect(contrast(palette.dark.onPrimary, palette.dark.primary)).toBeCloseTo(5.37, 1);
    expect(contrast(palette.light.onPrimary, palette.light.primary)).toBeCloseTo(5.74, 1);
  });

  it('keeps white off the dark primary fill (3.76:1 fails AA)', () => {
    expect(contrast('#FFFFFF', palette.dark.primary)).toBeLessThan(TEXT);
    expect(palette.dark.onPrimary).not.toBe('#FFFFFF');
  });

  it('has the same token names in both themes and no danger colour', () => {
    expect(Object.keys(palette.light).sort()).toEqual(Object.keys(palette.dark).sort());
    expect(Object.keys(palette.dark)).not.toEqual(expect.arrayContaining(['danger']));
  });
});
