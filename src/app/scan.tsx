import { useTranslation } from 'react-i18next';

import { AppText, Screen } from '@/ui';

export default function ScanScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('scan.title')}>
      <AppText tone="muted">{t('scan.unavailable')}</AppText>
    </Screen>
  );
}
