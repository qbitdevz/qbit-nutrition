import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Icon, PressableScale, layout, palette, radius, spacing } from '@/ui';

/**
 * Ink and fills of the controls that sit on a photo. They stay dark in both themes because the photo, not the theme, is what is
 * behind them (the artboard's `--qn-chip-solid`): solid enough to read over any picture.
 */
const OVER_PHOTO = {
  control: 'rgba(4, 7, 13, 0.8)',
  controlInk: palette.dark.text,
  chip: palette.dark.aiSoft,
  chipInk: palette.dark.ai,
  scrim: ['rgba(4, 7, 13, 0.62)', 'rgba(4, 7, 13, 0)'] as const,
} as const;

/** The header's height below the status bar when the text is at its normal size; it grows with the content. */
const HERO_MIN_BELOW_STATUS_BAR = 136;
const SCRIM_BELOW_STATUS_BAR = 56;

interface ReviewPhotoHeaderProps {
  photoUri: string;
  photoLabel: string;
  /** "AI found 3 items". */
  foundLabel: string;
  backLabel: string;
  /** Null when this screen cannot go back to the camera: the control is not drawn. */
  retakeLabel: string | null;
  onBack: () => void;
  onRetake: () => void;
}

/**
 * The Review screen's header when the meal came from a photo (the Orbit artboard): the photo edge to edge under the status bar with
 * rounded bottom corners, a dark scrim at the top so the system icons stay readable, the round back control and the Retake pill on
 * it, and the "AI found N items" chip at the bottom. Controls are 48 dp and solid; the header is content-sized with a minimum, so
 * large text makes it taller instead of clipping.
 */
export function ReviewPhotoHeader({ photoUri, photoLabel, foundLabel, backLabel, retakeLabel, onBack, onRetake }: ReviewPhotoHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View testID="review-hero" style={[styles.hero, { paddingTop: insets.top + spacing.s2, minHeight: insets.top + HERO_MIN_BELOW_STATUS_BAR, backgroundColor: palette.dark.surface }]}>
      <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" accessibilityLabel={photoLabel} testID="scan-photo" />
      <LinearGradient
        testID="review-scrim"
        pointerEvents="none"
        colors={OVER_PHOTO.scrim}
        style={[styles.scrim, { height: insets.top + SCRIM_BELOW_STATUS_BAR }]}
      />
      <View style={styles.row}>
        <PressableScale accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} testID="review-back" style={styles.back}>
          <Icon name="left" color={OVER_PHOTO.controlInk} />
        </PressableScale>
        {retakeLabel ? (
          <PressableScale accessibilityRole="button" accessibilityLabel={retakeLabel} onPress={onRetake} testID="review-retake" style={styles.retake}>
            <View style={styles.noShrink}>
              <Icon name="retake" size={20} color={OVER_PHOTO.controlInk} />
            </View>
            <AppText variant="button" style={{ color: OVER_PHOTO.controlInk }}>
              {retakeLabel}
            </AppText>
          </PressableScale>
        ) : null}
      </View>
      <View style={styles.foot}>
        <View style={styles.chip}>
          <Icon name="sparkle" size={16} color={OVER_PHOTO.chipInk} />
          <AppText variant="bodySm" style={[styles.chipText, { color: OVER_PHOTO.chipInk }]}>
            {foundLabel}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { justifyContent: 'space-between', overflow: 'hidden', borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, paddingBottom: spacing.s3 + 2 },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.s2, paddingLeft: spacing.s3, paddingRight: spacing.s4 },
  back: { width: layout.touchTarget, height: layout.touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: OVER_PHOTO.control },
  retake: {
    flexShrink: 1,
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4 + 2,
    borderRadius: radius.pill,
    backgroundColor: OVER_PHOTO.control,
  },
  noShrink: { flexShrink: 0 },
  foot: { flexDirection: 'row', paddingLeft: spacing.s4, paddingRight: spacing.s4, paddingTop: spacing.s4 },
  chip: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s2, minHeight: 28, paddingHorizontal: spacing.s3, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: OVER_PHOTO.chip },
  chipText: { flexShrink: 1 },
});
