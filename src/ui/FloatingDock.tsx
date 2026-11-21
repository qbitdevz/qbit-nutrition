import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { easing, pressScale, useReducedMotion } from './motion';
import { layout, radius, spacing } from './tokens';
import { useTheme } from './useTheme';

export interface DockTab {
  key: string;
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
}

interface FloatingDockProps {
  /** Exactly two: one on each side of the scan button. */
  tabs: readonly [DockTab, DockTab];
  /** Accessible name of the scan button ("Scan a meal"). */
  scanLabel: string;
  /** The visible caption under the scan button ("Scan"). */
  scanCaption: string;
  onScan: () => void;
  /** Spoken name of the navigation group. */
  navLabel: string;
  /** Breathes the scan button three times, then stops: the first-day prompt. Never runs with reduced motion. */
  pulse?: boolean;
}

/** The floating pill dock with the raised scan button (design/system.md, Orbit). */
export function FloatingDock({ tabs, scanLabel, scanCaption, onScan, navLabel, pulse = false }: FloatingDockProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={navLabel}
      style={[
        styles.dock,
        {
          bottom: Math.max(insets.bottom, layout.dockInset),
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOpacity: scheme === 'dark' ? 0.55 : 0.25,
        },
      ]}>
      <DockTabButton tab={tabs[0]} />
      <View style={styles.scanSlot}>
        <ScanButton label={scanLabel} onPress={onScan} pulse={pulse} />
        <AppText variant="caption" style={styles.scanCaption} aria-hidden>
          {scanCaption}
        </AppText>
      </View>
      <DockTabButton tab={tabs[1]} />
    </View>
  );
}

function DockTabButton({ tab }: { tab: DockTab }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: tab.active }}
      onPress={tab.onPress}
      scale={0.92}
      style={styles.tab}>
      <Icon name={tab.icon} color={tab.active ? colors.text : colors.textMuted} />
      <AppText variant="caption" tone={tab.active ? 'default' : 'muted'}>
        {tab.label}
      </AppText>
      {/* The selected tab also gets a bar under it: the state is not colour alone. */}
      <View style={[styles.indicator, tab.active ? { backgroundColor: colors.primary } : null]} />
    </PressableScale>
  );
}

function ScanButton({ label, onPress, pulse }: { label: string; onPress: () => void; pulse: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const halo = useSharedValue(0);

  useEffect(() => {
    if (!pulse || reduced) return;
    halo.value = 0;
    halo.value = withRepeat(withTiming(1, { duration: 1800, easing: easing.standard }), 3, false);
    return () => cancelAnimation(halo);
  }, [pulse, reduced, halo]);

  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - halo.value), transform: [{ scale: 1 + halo.value * 0.45 }] }));
  const fab = layout.scanButton;

  return (
    <View style={styles.fabWrap} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, { backgroundColor: colors.primary }, haloStyle]}
      />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        scale={pressScale.icon}
        testID="scan-button"
        style={[
          styles.fabRing,
          { backgroundColor: colors.bg, borderColor: colors.border, shadowColor: colors.glow },
        ]}>
        <LinearGradient
          colors={colors.scanGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: fab, height: fab, borderRadius: fab / 2, alignItems: 'center', justifyContent: 'center' }}>
          <View style={styles.fabIcon}>
            <Icon name="scan" size={34} strokeWidth={2.2} color={colors.onPrimary} />
          </View>
        </LinearGradient>
      </PressableScale>
    </View>
  );
}

const RING = layout.scanButton + 12;

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: layout.dockInset,
    right: layout.dockInset,
    height: layout.dockHeight,
    borderRadius: layout.dockHeight / 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 24,
    elevation: 16,
  },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.lg + 4 },
  indicator: { width: 18, height: 4, borderRadius: 2, marginTop: 1 },
  scanSlot: { width: 104, height: '100%', alignItems: 'center' },
  scanCaption: { position: 'absolute', bottom: spacing.s2 },
  fabWrap: { position: 'absolute', top: -36, width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: layout.scanButton, height: layout.scanButton, borderRadius: layout.scanButton / 2 },
  fabRing: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 17,
    elevation: 12,
  },
  fabIcon: { transform: [{ translateY: -4 }] },
});
