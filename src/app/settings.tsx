import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SUPPORTED_LOCALES } from '@/i18n/locale';
import { layout, radius, spacing, typography } from '@/ui/tokens';
import { useTheme } from '@/ui/useTheme';

const LANGUAGE_NAMES = { en: 'English', es: 'Español' } as const;

export default function SettingsScreen() {
  const colors = useTheme();
  const { t, i18n } = useTranslation();
  return (
    <View style={styles.root}>
      <Text style={[typography.label, { color: colors.inkMuted }]}>{t('settings.language')}</Text>
      <View style={styles.options}>
        {SUPPORTED_LOCALES.map((locale) => {
          const selected = i18n.language === locale;
          return (
            <Pressable
              key={locale}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => void i18n.changeLanguage(locale)}
              style={[styles.option, { borderColor: colors.ink, backgroundColor: selected ? colors.ink : 'transparent' }]}>
              <Text style={[typography.body, { color: selected ? colors.bg : colors.ink }]}>{LANGUAGE_NAMES[locale]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: layout.screenMargin, paddingTop: spacing.lg },
  options: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  option: {
    minHeight: layout.touchTarget,
    minWidth: 120,
    borderRadius: radius.control,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
