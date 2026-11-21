import { useTranslation } from 'react-i18next';

import { Button, useSnackbar } from '@/ui';
import { useServices } from '../startup/AppProvider';
import { seedSampleDay } from './devSeed';

/** DEVELOPMENT ONLY (see `devSeed.ts`): loads a sample profile, goal and meals, then refreshes Today. */
export function DevSeedButton({ onSeeded }: { onSeeded: () => void }) {
  const { t } = useTranslation();
  const { repos } = useServices();
  const snackbar = useSnackbar();
  return (
    <Button
      variant="ghost"
      label={t('today.devSeed')}
      testID="dev-seed"
      onPress={() => {
        void seedSampleDay(repos).then((added) => {
          if (added) snackbar.show({ message: t('today.devSeedDone') });
          onSeeded();
        });
      }}
    />
  );
}
