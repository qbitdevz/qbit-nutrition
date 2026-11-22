import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { layout, radius, spacing } from './tokens';
import { useTheme } from './useTheme';

/** `ai` is the cyan fill reserved for AI actions (design/system.md, "Color rules"). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ai';

interface ButtonProps {
  label: string;
  /** The accessible name, when it should say more than the visible label ("Add Apple to a meal" for a button that reads "Add to a meal"). */
  accessibilityLabel?: string;
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
export function Button({ label, accessibilityLabel, onPress, variant = 'primary', icon, disabled = false, hint, testID, block = true }: ButtonProps) {
  const { colors, scheme } = useTheme();

  const fill: ViewStyle =
    disabled
      ? { backgroundColor: colors.surfaceHigh }
      : variant === 'primary'
        ? { backgroundColor: colors.primary }
        : variant === 'ai'
          ? { backgroundColor: colors.ai }
          : variant === 'secondary'
            ? { borderWidth: 1.5, borderColor: colors.borderStrong }
            : {};
  const glow: ViewStyle =
    variant === 'primary' && !disabled
      ? scheme === 'dark'
        ? { shadowColor: colors.glow, shadowOpacity: 0.38, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 }
        : { shadowColor: colors.glow, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 4 }
      : {};
  const tone = disabled ? 'muted' : variant === 'primary' ? 'onPrimary' : variant === 'ai' ? 'onAi' : variant === 'secondary' ? 'default' : 'primary';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[styles.base, block ? styles.block : null, fill, glow]}>
      <View style={styles.content}>
        {icon ? <Icon name={icon} size={22} color={disabled ? colors.textMuted : tone === 'onPrimary' ? colors.onPrimary : tone === 'onAi' ? colors.onAi : tone === 'primary' ? colors.primaryText : colors.text} /> : null}
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
