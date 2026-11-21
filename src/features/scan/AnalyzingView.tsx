import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Icon, radius, spacing, useReducedMotion, useTheme } from '@/ui';

interface AnalyzingViewProps {
  photoUri: string;
  providerLabel: string | null;
  /** The provider has been slow for a while (20 s). */
  slow: boolean;
  onCancel: () => void;
}

/**
 * Flow B step 3: the photo stays visible under a scan beam, with progress, the provider it goes to,
 * and Cancel, which aborts the request. After 20 seconds a line explains that the provider is slow.
 */
export function AnalyzingView({ photoUri, providerLabel, slow, onCancel }: AnalyzingViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="analyzing">
      <View style={styles.photoWrap}>
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={t('scan.photoLabel')} testID="scan-photo" />
        <ScanBeam />
      </View>
      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, spacing.s4) + spacing.s2 }]}>
        <AppText variant="titleLg" style={styles.center} accessibilityRole="header">
          {t('scan.analyzing.title')}
        </AppText>
        {providerLabel ? (
          <View style={[styles.chip, { backgroundColor: colors.aiSoft }]}>
            <Icon name="sparkle" size={16} color={colors.ai} />
            <AppText variant="bodySm" tone="ai">
              {t('scan.analyzing.provider', { provider: providerLabel })}
            </AppText>
          </View>
        ) : null}
        <AppText tone="muted" style={styles.center}>
          {t('scan.analyzing.privacy')}
        </AppText>
        <ProgressBar label={t('scan.analyzing.progress')} />
        {slow ? (
          <AppText tone="warning" style={styles.center} accessibilityLiveRegion="polite">
            {t('scan.analyzing.slow')}
          </AppText>
        ) : null}
        <Button label={t('common.cancel')} variant="secondary" block={false} onPress={onCancel} />
      </View>
    </View>
  );
}

function ScanBeam() {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);
  const position = useSharedValue(reduced ? 0.5 : 0);
  useEffect(() => {
    if (reduced) return;
    position.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(position);
  }, [reduced, position]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: position.value * Math.max(height - 3, 0) }] }));
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(event) => setHeight(event.nativeEvent.layout.height)} pointerEvents="none" aria-hidden>
      <Animated.View style={[styles.beam, { backgroundColor: colors.ai, shadowColor: colors.ai }, style]} />
    </View>
  );
}

function ProgressBar({ label }: { label: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const segment = Math.max(width * 0.35, 0);
  const position = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    position.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(position);
  }, [reduced, position]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * Math.max(width - segment, 0) }] }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: colors.surfaceHigh }]}>
      <Animated.View style={[styles.segment, { width: segment, backgroundColor: colors.ai }, reduced ? { left: (width - segment) / 2 } : style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  photoWrap: { flex: 1, overflow: 'hidden' },
  beam: { height: 3, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  panel: { alignItems: 'center', gap: spacing.s3, paddingHorizontal: spacing.s6, paddingTop: spacing.s5 },
  center: { textAlign: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, paddingHorizontal: spacing.s3, paddingVertical: spacing.s1, borderRadius: radius.pill },
  track: { alignSelf: 'center', width: 160, height: 6, borderRadius: 3, overflow: 'hidden' },
  segment: { height: 6, borderRadius: 3 },
});
