import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { palette, type ColorScheme, type Colors } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Colors;
}

const SchemeOverride = createContext<ColorScheme | null>(null);

/** Forces a colour scheme for its subtree (tests, previews). The app itself follows the device. */
export function ThemeProvider({ scheme, children }: { scheme: ColorScheme; children: ReactNode }) {
  return <SchemeOverride.Provider value={scheme}>{children}</SchemeOverride.Provider>;
}

/**
 * The palette for the device setting. design/system.md defines both a dark theme (the designed
 * default) and a light theme, so the app follows the system: light only when the device asks.
 */
export function useTheme(): Theme {
  const override = useContext(SchemeOverride);
  const system = useColorScheme();
  const scheme: ColorScheme = override ?? (system === 'light' ? 'light' : 'dark');
  return { scheme, colors: palette[scheme] };
}
