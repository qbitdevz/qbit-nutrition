import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { duration, easing, useReducedMotion } from './motion';
import { radius, spacing } from './tokens';
import { useTheme } from './useTheme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Accessible name of the scrim, which closes the sheet ("Close"). */
  closeLabel: string;
  children: ReactNode;
}

/**
 * A modal sheet that rises from the bottom (480 ms, ease-out) over a scrim. With reduced motion it
 * cross-fades in 120 ms instead of travelling. The scrim is a button, so the sheet can always be
 * dismissed; the system back gesture closes it too.
 */
export function BottomSheet({ visible, onClose, title, closeLabel, children }: BottomSheetProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);

  // Mount as soon as it is asked for; unmount only after the exit animation (below).
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.value = reduced
        ? withTiming(1, { duration: duration.reducedFade })
        : withTiming(1, { duration: duration.slow, easing: easing.out });
    } else {
      const done = () => setMounted(false);
      progress.value = withTiming(0, { duration: reduced ? duration.reducedFade : duration.base, easing: easing.standard }, (finished) => {
        if (finished) runOnJS(done)();
      });
    }
  }, [visible, reduced, progress]);

  const scrim = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheet = useAnimatedStyle(() =>
    reduced ? { opacity: progress.value } : { opacity: 1, transform: [{ translateY: (1 - progress.value) * height * 0.5 }] },
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior="padding" accessibilityViewIsModal>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrim]}>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { backgroundColor: colors.surfaceRaised, paddingBottom: Math.max(insets.bottom, spacing.s4) + spacing.s4 }, sheet]}>
          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          <AppText variant="titleSm" accessibilityRole="header">
            {title}
          </AppText>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.72 }} contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.s6, paddingTop: spacing.s3, gap: spacing.s3 },
  content: { gap: spacing.s3 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing.s2 },
});
