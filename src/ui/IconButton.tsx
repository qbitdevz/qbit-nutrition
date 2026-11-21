import { StyleSheet } from 'react-native';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { pressScale } from './motion';
import { layout, radius } from './tokens';
import { useTheme } from './useTheme';

interface IconButtonProps {
  icon: IconName;
  /** The accessible name: required, because the control has no visible text. */
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

/** Round 48 x 48 icon button. */
export function IconButton({ icon, label, onPress, disabled = false, testID }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      scale={pressScale.icon}
      testID={testID}
      pressedStyle={{ backgroundColor: colors.surfaceHigh }}
      style={[styles.base, { opacity: disabled ? 0.45 : 1 }]}>
      <Icon name={icon} color={disabled ? colors.textMuted : colors.text} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { width: layout.touchTarget, height: layout.touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
