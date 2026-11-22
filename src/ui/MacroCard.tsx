import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from './AppText';
import { duration, easing, useCountUp, useReducedMotion } from './motion';
import { spacing } from './tokens';
import { useTheme } from './useTheme';

export type MacroKind = 'protein' | 'carbs' | 'fat';

interface MacroCardProps {
  kind: MacroKind;
  /** Translated macro name. */
  name: string;
  grams: number;
  /** The daily target in grams; null when none is set (the card then shows the amount only). */
  targetGrams: number | null;
  /** Spoken form, e.g. "Protein, 78 of 150 grams". */
  summary: string;
  /** Unit for the visible text, e.g. "g". */
  unit: string;
  formatNumber: (n: number) => string;
}

/** One macronutrient: name, grams eaten against the target, and a bar. The name and numbers carry the meaning; the colour only decorates. */
export function MacroCard({ kind, name, grams, targetGrams, summary, unit, formatNumber }: MacroCardProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const share = targetGrams && targetGrams > 0 ? Math.min(1, grams / targetGrams) : 0;
  const fill = useSharedValue(reduced ? share : 0);
  const shown = useCountUp(Math.round(grams), 0);

  useEffect(() => {
    if (reduced) fill.value = share;
    else fill.value = withTiming(share, { duration: duration.ring, easing: easing.out });
  }, [share, reduced, fill]);

  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View
      accessible
      accessibilityLabel={summary}
      accessibilityRole={targetGrams ? 'progressbar' : undefined}
      accessibilityValue={targetGrams ? { min: 0, max: Math.round(targetGrams), now: Math.round(grams) } : undefined}
      style={[styles.card, { backgroundColor: colors.surface }]}
      testID={`macro-${kind}`}>
      <AppText variant="macroName" tone="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {name}
      </AppText>
      <AppText variant="bodySm" tone="muted">
        <AppText variant="numeral">{formatNumber(shown)}</AppText>
        {targetGrams ? ` / ${formatNumber(Math.round(targetGrams))} ${unit}` : ` ${unit}`}
      </AppText>
      <View style={[styles.track, { backgroundColor: colors.surfaceHigh }]}>
        <Animated.View style={[styles.fill, { backgroundColor: colors[kind] }, bar]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: spacing.s3, paddingBottom: 14, gap: 2 },
  track: { height: 6, borderRadius: 3, marginTop: spacing.s2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
