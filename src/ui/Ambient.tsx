import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from './useTheme';

interface AmbientProps {
  /** Blue behind Today; warm behind a notice or error screen. */
  tone?: 'blue' | 'warm';
}

/** Decorative radial tint at the top of a screen (design/system.md, "Decorative values"). No meaning, no contrast needs. */
export function Ambient({ tone = 'blue' }: AmbientProps) {
  const { colors } = useTheme();
  const tint = tone === 'warm' ? colors.ambientWarm : colors.ambient;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
      aria-hidden>
      <Defs>
        <RadialGradient id="ambient" cx="50%" cy="-8%" fx="50%" fy="-8%" rx="110%" ry="55%" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor={tint} />
          <Stop offset="0.64" stopColor={colors.bg} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambient)" />
    </Svg>
  );
}
