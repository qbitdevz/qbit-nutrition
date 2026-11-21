import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { pressScale } from './motion';
import { radius, spacing } from './tokens';
import { useTheme } from './useTheme';

interface MealRowProps {
  name: string;
  /** "Breakfast · 08:05". */
  meta: string;
  /** Formatted calories without the unit. */
  kcal: string;
  kcalUnit: string;
  /** Spoken form of the whole row. */
  summary: string;
  onPress?: () => void;
}

/** A meal in the day's list: tile, name, slot and time, calories. With an action the whole row is one 72 dp button. */
export function MealRow({ name, meta, kcal, kcalUnit, summary, onPress }: MealRowProps) {
  const { colors } = useTheme();
  const content = (
    <>
      <View style={[styles.tile, { backgroundColor: colors.surfaceRaised }]}>
        <Icon name="plate" color={colors.primaryText} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodySm" tone="muted">
          {meta}
        </AppText>
        <AppText variant="itemName">{name}</AppText>
      </View>
      <AppText variant="bodySm" tone="muted" style={styles.kcal}>
        <AppText variant="numeral">{kcal}</AppText> {kcalUnit}
      </AppText>
    </>
  );
  const style = [styles.row, { backgroundColor: colors.surface }];
  // Without an action (meal details come with manual logging) the row is information, not a button.
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={summary} style={style}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={summary}
      onPress={onPress}
      scale={pressScale.row}
      pressedStyle={{ backgroundColor: colors.surfaceHigh }}
      style={style}>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: 72,
    paddingVertical: spacing.s2,
    paddingLeft: spacing.s2,
    paddingRight: spacing.s4,
    borderRadius: radius.lg,
  },
  tile: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  kcal: { textAlign: 'right' },
});
