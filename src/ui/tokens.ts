/**
 * Design tokens. Source of truth: docs/05-design-system.md, sections 2 to 4.
 * Color values are a starting point and still need a contrast check.
 */

export const palette = {
  light: {
    bg: '#FAF7F0',
    surface: '#FFFFFF',
    ink: '#151412',
    inkMuted: '#5E5A52',
    rule: '#151412',
    accent: '#D9480F',
    onAccent: '#FFFFFF',
    protein: '#1F5FBF',
    carbs: '#B7791F',
    fat: '#7A3E9D',
    warning: '#8A5A00',
    danger: '#B3261E',
  },
  dark: {
    bg: '#141311',
    surface: '#1E1C19',
    ink: '#F3EFE6',
    inkMuted: '#A8A297',
    rule: '#F3EFE6',
    accent: '#FF7A45',
    onAccent: '#141311',
    protein: '#7FB0FF',
    carbs: '#F2C36B',
    fat: '#C99BE8',
    warning: '#F2C36B',
    danger: '#FF8A80',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { readonly [K in keyof (typeof palette)['light']]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const layout = { screenMargin: 20, touchTarget: 48 } as const;

export const radius = { control: 4, section: 0, photo: 12 } as const;

export const ruleWeight = { hairline: 1, section: 4, header: 8 } as const;

export const typography = {
  display: { fontSize: 56, lineHeight: 60, fontWeight: '800' },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '800' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: 0.52, textTransform: 'uppercase' },
} as const;
