import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale, radius, spacing, useTheme } from '@/ui';
import { DEV_SCENARIOS, getDevScenario, setDevScenario, type DevScenario } from './devProvider';

/** DEVELOPMENT ONLY (QN_DEV_ONLY_PANEL): picks what the fake provider answers next. Collapsed to a small "DEV" pill. */
export function DevScanPanel({ top = 2, right = 2 }: { top?: number; right?: number } = {}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<DevScenario>(getDevScenario());
  return (
    <View style={[styles.root, { top, right }]} pointerEvents="box-none" testID="QN_DEV_ONLY_PANEL">
      <PressableScale accessibilityRole="button" accessibilityLabel="Dev scenarios" onPress={() => setOpen((v) => !v)} style={[styles.pill, { backgroundColor: colors.surfaceHigh }]}>
        <AppText variant="caption">DEV · {current}</AppText>
      </PressableScale>
      {open ? (
        <View style={[styles.list, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }]}>
          {DEV_SCENARIOS.map((scenario) => (
            <PressableScale
              key={scenario}
              accessibilityRole="button"
              accessibilityLabel={`Dev scenario ${scenario}`}
              onPress={() => {
                setDevScenario(scenario);
                setCurrent(scenario);
                setOpen(false);
              }}
              style={styles.row}>
              <AppText variant="bodySm" tone={scenario === current ? 'primary' : 'default'}>
                {scenario}
              </AppText>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 2, right: 2, alignItems: 'flex-end', zIndex: 50 },
  pill: { paddingHorizontal: spacing.s2, paddingVertical: 2, borderRadius: radius.pill, opacity: 0.85 },
  list: { marginTop: spacing.s1, borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.s1 },
  row: { paddingHorizontal: spacing.s4, paddingVertical: spacing.s2 },
});
