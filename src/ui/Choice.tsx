import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { layout, radius, spacing } from './tokens';
import { useTheme } from './useTheme';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** A line under the label (OptionList only). */
  hint?: string;
}

interface ChoiceProps<T extends string> {
  /** Spoken name of the group; also its visible title when `title` is set. */
  label: string;
  /** Shows `label` above the group. */
  title?: boolean;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** Optional questions: pressing the selected option again clears the answer. */
  clearable?: boolean;
  /** Equal-width pills sharing one row (the meal slots); the labels shrink instead of wrapping. */
  fill?: boolean;
  testID?: string;
}

/**
 * A group of pill choices, one selected (radio buttons underneath, design/system.md "Segmented
 * control"). The selected pill is filled and carries a check mark, so selection is never colour alone.
 */
export function ChoiceChips<T extends string>({ label, title = false, options, value, onChange, clearable = false, fill = false, testID }: ChoiceProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.group} testID={testID}>
      {title ? (
        <AppText variant="bodyMd" tone="muted" style={styles.title} aria-hidden>
          {label}
        </AppText>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <PressableScale
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange(selected && clearable ? null : option.value)}
              style={[styles.chip, fill ? styles.fill : null, selected ? { backgroundColor: colors.primary } : { borderWidth: 1.5, borderColor: colors.borderStrong }]}>
              {selected && !fill ? <Icon name="check" size={18} color={colors.onPrimary} /> : null}
              <AppText variant="bodyMd" tone={selected ? 'onPrimary' : 'default'} style={[styles.chipText, fill ? styles.fillText : null]} numberOfLines={fill ? 1 : undefined} adjustsFontSizeToFit={fill} minimumFontScale={0.8}>
                {option.label}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/** A vertical list of options with a hint line each; selected is outlined in blue with a check. */
export function OptionList<T extends string>({ label, title = false, options, value, onChange, clearable = false, testID }: ChoiceProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.group} testID={testID}>
      {title ? (
        <AppText variant="bodyMd" tone="muted" style={styles.title} aria-hidden>
          {label}
        </AppText>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.rows}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <PressableScale
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={option.hint}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange(selected && clearable ? null : option.value)}
              scale={0.985}
              style={[
                styles.row,
                { backgroundColor: selected ? colors.primarySoft : colors.surface, borderColor: selected ? colors.primary : colors.borderStrong, borderWidth: selected ? 2 : 1.5 },
              ]}>
              <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.borderStrong, backgroundColor: selected ? colors.primary : 'transparent' }]}>
                {selected ? <Icon name="check" size={16} color={colors.onPrimary} strokeWidth={2.6} /> : null}
              </View>
              <View style={styles.rowText}>
                <AppText variant="itemName">{option.label}</AppText>
                {option.hint ? (
                  <AppText variant="bodySm" tone="muted">
                    {option.hint}
                  </AppText>
                ) : null}
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.s2 },
  title: { paddingLeft: spacing.s2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  chip: {
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.s5,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
  },
  fill: { flex: 1, paddingHorizontal: spacing.s1 },
  fillText: { fontSize: 13 },
  chipText: { fontWeight: '600' },
  rows: { gap: spacing.s2 },
  row: { minHeight: 60, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
});
