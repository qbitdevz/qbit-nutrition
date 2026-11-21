import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { Screen } from '@/ui/Screen';
import { typography } from '@/ui/tokens';
import { useTheme } from '@/ui/useTheme';

export default function ProgressScreen() {
  const colors = useTheme();
  const { t } = useTranslation();
  return (
    <Screen title={t('progress.title')}>
      <Text style={[typography.body, { color: colors.inkMuted }]}>{t('progress.empty')}</Text>
    </Screen>
  );
}
