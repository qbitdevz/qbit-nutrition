import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { duration, easing, useReducedMotion } from './motion';
import { layout, radius, spacing } from './tokens';
import { useTheme } from './useTheme';

export interface SnackbarMessage {
  /** Names the outcome like the action did: "Dinner saved · 583 kcal added". */
  message: string;
  /** Label of the optional action ("Undo"). */
  actionLabel?: string;
  onAction?: () => void;
  /** How long it stays; default 3.2 s, 5 s when it has an action. */
  durationMs?: number;
}

interface SnackbarApi {
  show: (message: SnackbarMessage) => void;
  dismiss: () => void;
}

const SnackbarContext = createContext<SnackbarApi>({ show: () => undefined, dismiss: () => undefined });

export function useSnackbar(): SnackbarApi {
  return useContext(SnackbarContext);
}

interface SnackbarProviderProps {
  children: ReactNode;
  /** Distance from the bottom of the screen; leave room for the floating dock. */
  bottomOffset?: number;
}

/** One snackbar at a time, announced to screen readers, with an optional 48 dp action such as Undo. */
export function SnackbarProvider({ children, bottomOffset = layout.dockHeight + layout.dockInset * 2 + spacing.s3 }: SnackbarProviderProps) {
  const [current, setCurrent] = useState<(SnackbarMessage & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const dismiss = useCallback(() => {
    clear();
    setCurrent(null);
  }, []);

  const show = useCallback(
    (message: SnackbarMessage) => {
      clear();
      counter.current += 1;
      setCurrent({ ...message, id: counter.current });
      AccessibilityInfo.announceForAccessibility(message.message);
      timer.current = setTimeout(dismiss, message.durationMs ?? (message.actionLabel ? 5000 : 3200));
    },
    [dismiss],
  );

  useEffect(() => clear, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      {current ? <SnackbarView key={current.id} {...current} bottomOffset={bottomOffset} onDone={dismiss} /> : null}
    </SnackbarContext.Provider>
  );
}

function SnackbarView({
  message,
  actionLabel,
  onAction,
  bottomOffset,
  onDone,
}: SnackbarMessage & { bottomOffset: number; onDone: () => void }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const visible = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!reduced) visible.value = withTiming(1, { duration: duration.base, easing: easing.spring });
  }, [reduced, visible]);

  const style = useAnimatedStyle(() =>
    reduced
      ? { opacity: 1 }
      : { opacity: Math.min(1, visible.value * 1.5), transform: [{ translateY: (1 - visible.value) * 16 }, { scale: 0.96 + 0.04 * visible.value }] },
  );

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        { bottom: bottomOffset + insets.bottom, backgroundColor: colors.toastBg, shadowColor: colors.shadow },
        style,
      ]}
      testID="snackbar">
      <AppText variant="bodyMd" style={[styles.message, { color: colors.toastText }]}>
        {message}
      </AppText>
      {actionLabel ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={() => {
            onAction?.();
            onDone();
          }}
          style={styles.action}>
          <AppText variant="button" style={{ color: colors.toastAction, fontSize: 15, lineHeight: 20 }}>
            {actionLabel}
          </AppText>
        </PressableScale>
      ) : (
        <View style={styles.pad} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.s4,
    right: spacing.s4,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
    paddingLeft: spacing.s5,
    paddingRight: spacing.s2,
    paddingVertical: spacing.s1,
    borderRadius: radius.pill,
    shadowOpacity: 0.55,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  message: { flex: 1 },
  action: { minHeight: layout.touchTarget, paddingHorizontal: spacing.s4, borderRadius: radius.pill, justifyContent: 'center' },
  pad: { width: spacing.s3 },
});
