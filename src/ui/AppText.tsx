import { Text, type TextProps } from 'react-native';

import { typography } from './tokens';
import { useTheme } from './useTheme';

export type TextVariant = keyof typeof typography;
export type TextTone = 'default' | 'muted' | 'primary' | 'onPrimary' | 'warning' | 'green' | 'ai';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

/** Text in the design system's type scale. Scales with the system font size (layouts must reflow at 200%). */
export function AppText({ variant = 'body', tone = 'default', style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primaryText,
    onPrimary: colors.onPrimary,
    warning: colors.warning,
    green: colors.green,
    ai: colors.ai,
  }[tone];
  return <Text {...rest} style={[typography[variant], { color }, style]} />;
}
