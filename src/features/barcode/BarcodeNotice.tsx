import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, BottomSheet, Button, spacing } from '@/ui';

interface BarcodeNoticeProps {
  /** The number about to be sent; null keeps the sheet closed. */
  code: string | null;
  onContinue: () => void;
  onDecline: () => void;
}

/**
 * The one-time notice before the first lookup (S9, docs/12 section 4): the barcode number goes to Open Food Facts, and
 * nothing else does. Nothing is sent until "Look up product"; declining or closing it returns to the entry.
 */
export function BarcodeNotice({ code, onContinue, onDecline }: BarcodeNoticeProps) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={code !== null} onClose={onDecline} title={t('barcode.notice.title')} closeLabel={t('common.close')}>
      <AppText tone="muted">{t('barcode.notice.body')}</AppText>
      {code ? (
        <AppText variant="itemName" selectable>
          {code}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button label={t('barcode.notice.continue')} icon="barcode" onPress={onContinue} testID="barcode-notice-continue" />
        <Button label={t('barcode.notice.decline')} variant="secondary" onPress={onDecline} testID="barcode-notice-decline" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: spacing.s3 },
});
