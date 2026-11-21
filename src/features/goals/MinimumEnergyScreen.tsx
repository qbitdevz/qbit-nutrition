import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorState, ScreenFrame, Skeleton, TopBar, layout, spacing, useSnackbar } from '@/ui';
import { useServices } from '../startup/AppProvider';
import { MinimumEnergyEditor } from './MinimumEnergyEditor';
import { readMinimumKcal } from './minimum';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: number | null };

/** Settings → Minimum daily energy (S3): the default with its source, and the person's own value. */
export function MinimumEnergyScreen({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  const { repos } = useServices();
  const snackbar = useSnackbar();
  const [state, setState] = useState<State>({ status: 'loading' });

  const read = useCallback(() => {
    readMinimumKcal(repos.settings).then(
      (value) => setState({ status: 'ready', value }),
      () => setState({ status: 'error' }),
    );
  }, [repos]);
  useEffect(read, [read]);
  const load = () => {
    setState({ status: 'loading' });
    read();
  };

  return (
    <ScreenFrame header={<TopBar title={t('minimum.title')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        {state.status === 'loading' ? <Skeleton height={240} radius={24} /> : null}
        {state.status === 'error' ? (
          <ErrorState title={t('minimum.title')} message={t('minimum.loadError')}>
            <Button label={t('common.retry')} icon="retake" onPress={load} />
          </ErrorState>
        ) : null}
        {state.status === 'ready' ? (
          <MinimumEnergyEditor
            value={state.value}
            onSaved={(kcal) => {
              setState({ status: 'ready', value: kcal });
              snackbar.show({ message: kcal === null ? t('minimum.resetDone') : t('minimum.saved') });
            }}
          />
        ) : null}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s2, paddingBottom: spacing.s10 },
});
