import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SUPPORTED_LOCALES } from '@/i18n/locale';
import { AppText, PressableScale, Screen, layout, radius, spacing, useTheme } from '@/ui';

const LANGUAGE_NAMES = { en: 'English', es: 'Español' } as const;

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  return (
    <Screen title={t('settings.title')}>
      <AppText variant="heading" accessibilityRole="header">
        {t('settings.language')}
      </AppText>
      <View style={styles.options} accessibilityRole="radiogroup">
        {SUPPORTED_LOCALES.map((locale) => {
          const selected = i18n.language === locale;
          return (
            <PressableScale
              key={locale}
              accessibilityRole="radio"
              accessibilityLabel={LANGUAGE_NAMES[locale]}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => void i18n.changeLanguage(locale)}
              style={[
                styles.option,
                selected ? { backgroundColor: colors.primary } : { borderWidth: 1.5, borderColor: colors.borderStrong },
              ]}>
              <AppText variant="button" tone={selected ? 'onPrimary' : 'default'}>
                {selected ? '✓ ' : ''}
                {LANGUAGE_NAMES[locale]}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', gap: spacing.s3 },
  option: {
    minHeight: layout.touchTarget,
    minWidth: 132,
    paddingHorizontal: spacing.s5,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
