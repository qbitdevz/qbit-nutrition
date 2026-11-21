import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from './AppText';
import { duration, easing, useCountUp, useReducedMotion } from './motion';
import { layout, spacing } from './tokens';
import { useTheme } from './useTheme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const VIEW = 216;
const CENTER = VIEW / 2;
const RADIUS = 96;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface CalorieRingProps {
  /** The number in the middle: calories left, or the amount over the target. */
  value: number;
  /** Where the count starts when Today opens (the target, so it counts down). Defaults to `value`. */
  countFrom?: number;
  /** "kcal left", "kcal over target", "kcal eaten". */
  label: string;
  /** Share of the target eaten, 0 to 1; the arc is full at 1 and stays full above it. */
  progress: number;
  /** The whole ring as one sentence for screen readers; the visible numbers repeat it. */
  summary: string;
  formatNumber: (n: number) => string;
}

/**
 * The hero of Today: an SVG ring that fills to `progress` and a number that counts to `value`
 * (1 s, ease-out). With reduced motion both show their final value on the first frame. Going over
 * the target keeps the same blue: the label and the number say it, never a warning colour.
 */
export function CalorieRing({ value, countFrom, label, progress, summary, formatNumber }: CalorieRingProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));
  const filled = useSharedValue(reduced ? clamped : 0);
  const shown = useCountUp(value, countFrom ?? value);

  useEffect(() => {
    if (reduced) filled.value = clamped;
    else filled.value = withTiming(clamped, { duration: duration.ring, easing: easing.out });
  }, [clamped, reduced, filled]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: CIRCUMFERENCE * (1 - filled.value) }));
  const glowProps = useAnimatedProps(() => ({ strokeDashoffset: CIRCUMFERENCE * (1 - filled.value) }));
  const stroke = layout.ringStroke;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={summary}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={styles.ring}
      testID="calorie-ring">
      <Svg width={layout.ringSize} height={layout.ringSize} viewBox={`0 0 ${VIEW} ${VIEW}`} style={[styles.svg, styles.rotated]}>
        <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={colors.surfaceHigh} strokeWidth={stroke} fill="none" />
        {/* Two wider, faint copies of the arc stand in for the glow (React Native has no blur on SVG). */}
        <AnimatedCircle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke={colors.primary}
          strokeOpacity={0.07}
          strokeWidth={stroke + 16}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          fill="none"
          animatedProps={glowProps}
        />
        <AnimatedCircle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke={colors.primary}
          strokeOpacity={0.14}
          strokeWidth={stroke + 8}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          fill="none"
          animatedProps={glowProps}
        />
        <AnimatedCircle
          testID="ring-arc"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke={colors.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          fill="none"
          animatedProps={arcProps}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <AppText variant="numeralLg" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2} style={styles.number}>
          {formatNumber(shown)}
        </AppText>
        <AppText variant="bodyMd" tone="muted" maxFontSizeMultiplier={1.3} style={styles.label}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { width: layout.ringSize, height: layout.ringSize, alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute' },
  // The arc starts at 12 o'clock and runs clockwise.
  rotated: { transform: [{ rotate: '-90deg' }] },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.s4 + spacing.s1, maxWidth: layout.ringSize },
  number: { textAlign: 'center' },
  label: { textAlign: 'center', marginTop: 2 },
});
