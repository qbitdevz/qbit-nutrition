import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { layout, spacing, typography } from '@/ui/tokens';
import { useTheme } from '@/ui/useTheme';

export default function ScanScreen() {
  const colors = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <Text style={[typography.body, { color: colors.inkMuted }]}>{t('scan.unavailable')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: layout.screenMargin, paddingTop: spacing.lg },
});
