import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/ui/Screen';
import { layout, radius, spacing, typography } from '@/ui/tokens';
import { useTheme } from '@/ui/useTheme';

export default function TodayScreen() {
  const colors = useTheme();
  const { t } = useTranslation();
  return (
    <Screen title={t('today.title')}>
      <Text style={[typography.body, { color: colors.inkMuted }]}>{t('today.empty')}</Text>
      <View style={styles.actions}>
        <Link href="/scan" asChild>
          <Pressable accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.accent }]}>
            <Text style={[typography.body, styles.primaryLabel, { color: colors.onAccent }]}>{t('today.scan')}</Text>
          </Pressable>
        </Link>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" style={[styles.secondary, { borderColor: colors.ink }]}>
            <Text style={[typography.body, styles.primaryLabel, { color: colors.ink }]}>{t('today.settings')}</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.md, marginTop: spacing.xl },
  primary: { minHeight: layout.touchTarget, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  secondary: {
    minHeight: layout.touchTarget,
    borderRadius: radius.control,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { fontWeight: '700' },
});
