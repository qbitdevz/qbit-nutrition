import { useTranslation } from 'react-i18next';

import { AppText, Screen, layout } from '@/ui';

export default function ProgressScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('progress.title')} bottomInset={layout.dockClearance}>
      <AppText tone="muted">{t('progress.empty')}</AppText>
    </Screen>
  );
}
