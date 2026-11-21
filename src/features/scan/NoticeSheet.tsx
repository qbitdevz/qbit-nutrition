import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, BottomSheet, Button, spacing } from '@/ui';

interface NoticeSheetProps {
  /** The profile's label; null keeps the sheet closed. */
  provider: string | null;
  onContinue: () => void;
  onDecline: () => void;
}

/**
 * The one-time notice before the first send to a provider profile (S4, docs/12 section 4). Nothing
 * is sent until "Send photo"; declining or closing it returns to the preview.
 */
export function NoticeSheet({ provider, onContinue, onDecline }: NoticeSheetProps) {
  const { t } = useTranslation();
  const name = provider ?? '';
  return (
    <BottomSheet visible={provider !== null} onClose={onDecline} title={t('scan.notice.title', { provider: name })} closeLabel={t('common.close')}>
      <AppText tone="muted">{t('scan.notice.body', { provider: name })}</AppText>
      <View style={styles.actions}>
        <Button label={t('scan.notice.continue')} icon="sparkle" onPress={onContinue} />
        <Button label={t('scan.notice.decline')} variant="secondary" onPress={onDecline} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: spacing.s3 },
});
