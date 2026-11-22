import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, ChoiceChips, ScreenFrame, layout, spacing } from '@/ui';
import { useSession } from '../session/AppSession';
import { NutritionView } from './NutritionView';
import { SeriesView } from './SeriesView';
import { MEASURE_KINDS } from './series';

type Section = 'nutrition' | 'weight' | 'measures';

interface ProgressScreenProps {
  /** The clock; tests pass a fixed one. */
  now?: () => Date;
  /** Goes up when the tab regains focus: data may have changed on another screen. */
  focusToken?: number;
}

const systemNow = () => new Date();

/** In development only: Metro removes this branch (and the module) from release bundles. */
const DevHistoryButton: typeof import('./dev/DevHistoryButton').DevHistoryButton | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./dev/DevHistoryButton') as typeof import('./dev/DevHistoryButton')).DevHistoryButton
  : null;

/**
 * Progress (FR-43 to FR-45): averages for the week and the month, the weight trend, and body measurements.
 * Everything comes through the repositories in the views; this file only chooses which one to show.
 */
export function ProgressScreen({ now = systemNow, focusToken = 0 }: ProgressScreenProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<Section>('nutrition');
  // A change made elsewhere (the profile saves a weight) and returning to the tab both read again, quietly.
  const { revision } = useSession();
  const [seeded, setSeeded] = useState(0);
  const refresh = revision + focusToken + seeded;

  return (
    <ScreenFrame bottomInset={layout.dockClearance}>
      <View style={styles.body}>
        <AppText variant="titleLg" accessibilityRole="header">
          {t('progress.title')}
        </AppText>
        <ChoiceChips<Section>
          label={t('progress.views.label')}
          options={[
            { value: 'nutrition', label: t('progress.views.nutrition') },
            { value: 'weight', label: t('progress.views.weight') },
            { value: 'measures', label: t('progress.views.measures') },
          ]}
          value={view}
          onChange={(value) => value && setView(value)}
          fill
          testID="progress-views"
        />
        {view === 'nutrition' ? <NutritionView now={now} refresh={refresh} /> : null}
        {view === 'weight' ? <SeriesView key="weight" kinds={['weight']} now={now} refresh={refresh} /> : null}
        {view === 'measures' ? <SeriesView key="measures" kinds={MEASURE_KINDS} now={now} refresh={refresh} /> : null}
        {DevHistoryButton ? <DevHistoryButton onSeeded={() => setSeeded((n) => n + 1)} /> : null}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s6, gap: spacing.s4 },
});
