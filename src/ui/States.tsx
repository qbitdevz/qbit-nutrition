import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { easing, useReducedMotion } from './motion';
import { radius, spacing } from './tokens';
import { useTheme } from './useTheme';

interface EmptyStateProps {
  title: string;
  body: string;
  icon?: IconName;
  /** The one action that fills the empty screen, if any. */
  children?: ReactNode;
}

/** An empty screen invites the first action: dashed outline, icon, a headline, one sentence. */
export function EmptyState({ title, body, icon = 'plate', children }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.borderStrong }]} accessibilityRole="summary" testID="empty-state">
      <Icon name={icon} size={44} strokeWidth={1.6} color={colors.primaryText} />
      <AppText variant="titleSm" style={styles.center} accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="muted" style={[styles.center, styles.copy]}>
        {body}
      </AppText>
      {children}
    </View>
  );
}

interface ErrorStateProps {
  title: string;
  /** What happened and what to do next, in plain sentences. */
  message: string;
  /** Technical detail shown small under the message (an error code), if useful. */
  detail?: string;
  /** Buttons for the recovery actions. */
  children?: ReactNode;
  icon?: IconName;
}

/**
 * A failure that says what happened and what to do. It uses the warning amber with an icon and
 * text, never colour alone, and never red.
 */
export function ErrorState({ title, message, detail, children, icon = 'alert' }: ErrorStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.error} accessibilityRole="alert" testID="error-state">
      <View style={[styles.errorIcon, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
        <Icon name={icon} size={32} color={colors.warning} />
      </View>
      <AppText variant="titleLg" accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="muted" style={styles.copy}>
        {message}
      </AppText>
      {detail ? (
        <AppText variant="bodySm" tone="muted" selectable testID="error-detail">
          {detail}
        </AppText>
      ) : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
}

/** A placeholder block that breathes while data loads; static with reduced motion. Hidden from screen readers (the screen announces loading). */
export function Skeleton({ width = '100%', height, radius: corner = radius.md }: SkeletonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const level = useSharedValue(reduced ? 0.7 : 0.45);

  useEffect(() => {
    if (reduced) return;
    level.value = withRepeat(withTiming(0.9, { duration: 900, easing: easing.standard }), -1, true);
    return () => cancelAnimation(level);
  }, [reduced, level]);

  const style = useAnimatedStyle(() => ({ opacity: level.value }));
  return (
    <Animated.View
      aria-hidden
      style={[{ width, height, borderRadius: corner, backgroundColor: colors.surfaceHigh }, style]}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    marginHorizontal: spacing.s4,
    marginTop: spacing.s4,
    padding: spacing.s5,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: spacing.s2,
  },
  center: { textAlign: 'center' },
  copy: { maxWidth: 320 },
  error: { gap: spacing.s3, paddingHorizontal: spacing.s2, paddingTop: spacing.s3, alignItems: 'flex-start' },
  errorIcon: { width: 64, height: 64, borderRadius: radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: spacing.s4 },
});
