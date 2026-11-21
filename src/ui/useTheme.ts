import { useColorScheme } from 'react-native';

import { palette, type Colors } from './tokens';

export function useTheme(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
