import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, radius, spacing, useTheme } from '@/ui';

/**
 * The action that asks the AI provider for food ideas (S6). It is marked as AI (cyan is reserved for that), says what it
 * sends, and does nothing until it is pressed: suggestions are never requested on their own.
 */
export function SuggestEntry({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.aiSoft }]} testID="suggest-entry">
      <View style={styles.tag}>
        <Icon name="sparkle" size={16} color={colors.ai} />
        <AppText variant="caption" tone="ai">
          {t('suggest.aiTag')}
        </AppText>
      </View>
      <AppText variant="bodyMd">{t('suggest.actionHint')}</AppText>
      <Button label={t('suggest.action')} variant="ai" icon="sparkle" onPress={onPress} testID="suggest-open" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.s4, marginTop: spacing.s3, padding: spacing.s4, borderRadius: radius.lg, gap: spacing.s3 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: spacing.s1 },
});
