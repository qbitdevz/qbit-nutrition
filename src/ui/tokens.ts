/**
 * Design tokens. Source of truth: `design/system.md` (the proposed starter system for the qbitdev
 * brand), implemented for the Orbit direction (`design/qbit-nutrition-app/01-orbit.html`).
 *
 * The system defines a dark theme (the designed default) and a light theme with the same token
 * names, so the app follows the device setting. Contrast ratios of the main text and button pairs
 * are pinned by `__tests__/tokens.test.ts`, computed from these values.
 *
 * There is deliberately no "danger" or "error red": going over a target is neutral (system.md,
 * "Color rules"), and failures use the warning amber together with an icon and text.
 */

const dark = {
  bg: '#04070D',
  surface: '#0B111C',
  surfaceRaised: '#121A29',
  surfaceHigh: '#1B2638',
  /** Decorative hairlines only; never a control boundary. */
  border: '#1F2A3D',
  /** Control boundaries (at least 3:1). */
  borderStrong: '#5B6B88',
  text: '#EEF3FB',
  textMuted: '#A3B0C8',
  primary: '#2D7FFF',
  /** Blue used as small text or links. */
  primaryText: '#5B9BFF',
  /** Ink on primary fills (white on #2D7FFF is only 3.76:1). */
  onPrimary: '#04070D',
  primarySoft: '#0E2144',
  /** Brand cyan, reserved for AI-related elements. */
  ai: '#35E0FF',
  onAi: '#04070D',
  aiSoft: '#06303A',
  green: '#3DFF8B',
  protein: '#3DFF8B',
  carbs: '#FFC857',
  fat: '#C7A6FF',
  warning: '#FFB020',
  warningSoft: '#33240A',
  focus: '#FFFFFF',
  scrim: 'rgba(2, 4, 8, 0.72)',
  toastBg: '#1B2638',
  toastText: '#EEF3FB',
  toastAction: '#5B9BFF',
  /** Decorative: ambient tint behind the top of Today (system.md, "Decorative values"). */
  ambient: '#102A56',
  /** Decorative: warm cue behind the error screens. */
  ambientWarm: '#2A1D07',
  /** Decorative: the scan button gradient; the icon sits on the lighter part (>= 5.37:1). */
  scanGradient: ['#5B9BFF', '#2D7FFF', '#1F63D8'],
  /** Wordmark gradient (owner brand facts). */
  wordmark: ['#2D7FFF', '#35E0FF', '#3DFF8B'],
  /** Glow colour of the primary action and the ring arc. */
  glow: '#2D7FFF',
  shadow: '#000000',
} as const;

type Gradient = readonly [string, string, string];
export type Colors = {
  readonly [K in keyof typeof dark]: K extends 'scanGradient' | 'wordmark' ? Gradient : string;
};

const light: Colors = {
  bg: '#F4F7FC',
  surface: '#FFFFFF',
  surfaceRaised: '#E8EEF9',
  surfaceHigh: '#DCE5F4',
  border: '#D3DCEC',
  borderStrong: '#6B7C9A',
  text: '#0A1220',
  textMuted: '#475674',
  primary: '#1C5FD6',
  primaryText: '#1C5FD6',
  onPrimary: '#FFFFFF',
  primarySoft: '#E1ECFF',
  ai: '#08687A',
  onAi: '#FFFFFF',
  aiSoft: '#DDF2F6',
  green: '#0B7536',
  protein: '#0B7536',
  carbs: '#9A5B00',
  fat: '#6B3FD1',
  warning: '#8A5A00',
  warningSoft: '#FFF0D1',
  focus: '#0A1220',
  scrim: 'rgba(10, 18, 32, 0.5)',
  toastBg: '#DCE5F4',
  toastText: '#0A1220',
  toastAction: '#1C5FD6',
  // The light theme has no ambient glow (system.md, "Elevation and glow"): the tints match the screen.
  ambient: '#F4F7FC',
  ambientWarm: '#F4F7FC',
  scanGradient: ['#1C5FD6', '#1C5FD6', '#174FB3'],
  wordmark: ['#1C5FD6', '#08687A', '#0B7536'],
  glow: '#1C5FD6',
  shadow: '#0A1220',
};

export const palette: { readonly dark: Colors; readonly light: Colors } = { dark, light };

export type ColorScheme = keyof typeof palette;

/** 4 px base (system.md, "Spacing"). */
export const spacing = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32, s10: 40 } as const;

export const layout = {
  /** Screen side padding is 16 or 24. */
  screenMargin: 16,
  /** Minimum touch target (docs/05 section 4), also the icon button size. */
  touchTarget: 48,
  buttonHeight: 56,
  dockHeight: 72,
  dockInset: 16,
  scanButton: 76,
  /** Free space to keep under scrolling content so the floating dock and the raised scan button never cover it. */
  dockClearance: 156,
  ringSize: 188,
  ringStroke: 14,
} as const;

/** Rounded everything: every button, chip, stepper and toast is a pill (system.md, "Radius"). */
export const radius = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, pill: 999 } as const;

/** Typefaces bundled with the app (src/ui/fonts.ts); the family name carries the weight on Android. */
export const fontFamily = {
  display500: 'Outfit_500Medium',
  display600: 'Outfit_600SemiBold',
  display700: 'Outfit_700Bold',
  body400: 'Figtree_400Regular',
  body500: 'Figtree_500Medium',
  body600: 'Figtree_600SemiBold',
  body700: 'Figtree_700Bold',
} as const;

const tabular = ['tabular-nums'] as const;

/** Type scale (system.md, "Typography"): Outfit for display, Figtree for body. Sentence case everywhere. */
export const typography = {
  numeralLg: { fontFamily: fontFamily.display700, fontSize: 50, lineHeight: 52, letterSpacing: -1.5, fontVariant: tabular },
  numeralMd: { fontFamily: fontFamily.display700, fontSize: 34, lineHeight: 38, fontVariant: tabular },
  numeral: { fontFamily: fontFamily.display700, fontSize: 18, lineHeight: 22, fontVariant: tabular },
  titleLg: { fontFamily: fontFamily.display700, fontSize: 30, lineHeight: 34, letterSpacing: -0.3 },
  title: { fontFamily: fontFamily.display700, fontSize: 26, lineHeight: 32 },
  titleSm: { fontFamily: fontFamily.display700, fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: fontFamily.display700, fontSize: 18, lineHeight: 24 },
  dayTitle: { fontFamily: fontFamily.display600, fontSize: 16, lineHeight: 24 },
  button: { fontFamily: fontFamily.display600, fontSize: 17, lineHeight: 22 },
  itemName: { fontFamily: fontFamily.display600, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamily.body400, fontSize: 16, lineHeight: 24 },
  bodyMd: { fontFamily: fontFamily.body500, fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: fontFamily.body500, fontSize: 14, lineHeight: 20, fontVariant: tabular },
  /** Macro card names: 13 px so "Carbohidratos" fits a third of a 390 dp screen. */
  macroName: { fontFamily: fontFamily.body500, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.body600, fontSize: 12, lineHeight: 16 },
  wordmark: { fontFamily: fontFamily.display700, fontSize: 20, lineHeight: 24, letterSpacing: -0.2 },
} as const;
