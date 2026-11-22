import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, ScreenFrame, TopBar, layout, spacing } from '@/ui';

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ScreenFrame header={<TopBar title={t('scan.title')} onBack={() => router.back()} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        <AppText tone="muted">{t('scan.unavailable')}</AppText>
        <Button label={t('scan.manual')} icon="pencil" onPress={() => router.push('/log/search')} testID="add-manually" />
        <AppText variant="bodySm" tone="muted">
          {t('scan.manualHint')}
        </AppText>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s4, gap: spacing.s3 },
});
