import { useTranslation } from 'react-i18next';

import { Button } from '@/ui';
import { useServices } from '../../startup/AppProvider';
import { seedSampleHistory } from './devHistory';

/** DEVELOPMENT ONLY (QN_DEV_ONLY_HISTORY, see `devHistory.ts`): loads five weeks of sample data, then refreshes Progress. */
export function DevHistoryButton({ onSeeded }: { onSeeded: () => void }) {
  const { t } = useTranslation();
  const { repos } = useServices();
  return <Button variant="ghost" label={t('today.devSeed')} testID="dev-seed-history" onPress={() => void seedSampleHistory(repos).then(onSeeded)} />;
}
