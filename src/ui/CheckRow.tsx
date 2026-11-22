import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { layout, radius, spacing } from './tokens';
import { useTheme } from './useTheme';

interface CheckRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** A line under the label. */
  hint?: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * A yes/no choice written as a sentence (a checkbox): the box is filled and carries a check mark when it is on, so the state is never
 * colour alone. The whole row is the touch target (at least the minimum size of the design system).
 */
export function CheckRow({ label, checked, onChange, hint, disabled = false, testID }: CheckRowProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.row, disabled ? styles.disabled : null]}
      testID={testID}>
      <View style={[styles.box, checked ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.borderStrong }]}>
        {checked ? <Icon name="check" size={18} color={colors.onPrimary} /> : null}
      </View>
      <View style={styles.text}>
        <AppText variant="bodyMd">{label}</AppText>
        {hint ? (
          <AppText variant="bodySm" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.s3, minHeight: layout.touchTarget, paddingVertical: spacing.s2 },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  text: { flex: 1, gap: 2 },
  disabled: { opacity: 0.5 },
});
