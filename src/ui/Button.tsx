import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { layout, radius, spacing } from './tokens';
import { useTheme } from './useTheme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  /** Shown as the accessible hint; a disabled button should also say why in visible text nearby. */
  hint?: string;
  testID?: string;
  /** Stretch to the container's width (default). */
  block?: boolean;
}

/** Primary, secondary and ghost pill buttons (design/system.md, "Components"): 56 high, one primary per screen. */
export function Button({ label, onPress, variant = 'primary', icon, disabled = false, hint, testID, block = true }: ButtonProps) {
  const { colors, scheme } = useTheme();

  const fill: ViewStyle =
    disabled
      ? { backgroundColor: colors.surfaceHigh }
      : variant === 'primary'
        ? { backgroundColor: colors.primary }
        : variant === 'secondary'
          ? { borderWidth: 1.5, borderColor: colors.borderStrong }
          : {};
  const glow: ViewStyle =
    variant === 'primary' && !disabled
      ? scheme === 'dark'
        ? { shadowColor: colors.glow, shadowOpacity: 0.38, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 }
        : { shadowColor: colors.glow, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 4 }
      : {};
  const tone = disabled ? 'muted' : variant === 'primary' ? 'onPrimary' : variant === 'secondary' ? 'default' : 'primary';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[styles.base, block ? styles.block : null, fill, glow]}>
      <View style={styles.content}>
        {icon ? <Icon name={icon} size={22} color={disabled ? colors.textMuted : tone === 'onPrimary' ? colors.onPrimary : tone === 'primary' ? colors.primaryText : colors.text} /> : null}
        <AppText variant="button" tone={tone} style={styles.label}>
          {label}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.buttonHeight,
    paddingHorizontal: spacing.s6,
    paddingVertical: spacing.s3,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexShrink: 1, maxWidth: '100%' },
  label: { textAlign: 'center', flexShrink: 1 },
});
