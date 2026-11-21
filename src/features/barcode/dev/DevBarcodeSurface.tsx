import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import type { BarcodeSurfaceProps } from '@/platform/scanPlatform';
import { AppText, PressableScale, radius, spacing } from '@/ui';
import { DEV_BARCODES } from './devOff';

/**
 * DEVELOPMENT ONLY (QN_DEV_ONLY_BARCODE_CAMERA). The browser preview has no barcode camera: this stands in for one and
 * "reads" a sample code when a chip is pressed, so every answer of the fake Open Food Facts can be reached.
 */
export function DevBarcodeSurface({ onScanned, onReady }: BarcodeSurfaceProps) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return (
    <View style={styles.root} testID="QN_DEV_ONLY_BARCODE_CAMERA">
      <View style={styles.bars} aria-hidden>
        {[3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 3, 1, 2, 4, 1, 2].map((w, i) => (
          <View key={i} style={{ width: w * 3, height: '100%', backgroundColor: i % 2 === 0 ? '#F4F7FC' : 'transparent' }} />
        ))}
      </View>
      <View style={styles.chips}>
        {Object.values(DEV_BARCODES).map((sample) => (
          <PressableScale
            key={sample.code}
            accessibilityRole="button"
            accessibilityLabel={`Dev scan ${sample.label}`}
            onPress={() => onScanned({ code: sample.code, format: 'ean13' })}
            style={styles.chip}>
            <AppText variant="caption" style={styles.chipText}>
              {sample.label}
            </AppText>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: '#1B2638', justifyContent: 'space-between', paddingVertical: spacing.s3 },
  bars: { height: 70, alignSelf: 'center', flexDirection: 'row', marginTop: spacing.s8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s1, paddingHorizontal: spacing.s2, justifyContent: 'center' },
  chip: { paddingHorizontal: spacing.s2, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.18)' },
  chipText: { color: '#FFFFFF' },
});
