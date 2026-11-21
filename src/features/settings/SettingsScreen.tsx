import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DEFAULT_MINIMUM_DAILY_KCAL } from '@/core/nutrition';
import { formatNumber } from '@/i18n/format';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/locale';
import { AppText, ChoiceChips, ScreenFrame, SettingsRow, TopBar, layout, spacing, useSnackbar } from '@/ui';
import { readMinimumKcal } from '../goals/minimum';
import { useServices } from '../startup/AppProvider';
import { saveLocale } from './language';

export type SettingsSection = 'profile' | 'goal' | 'minimum' | 'about';

const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' };

interface Details {
  profile?: string;
  goal?: string;
  minimum?: string;
}

/** Settings (docs/04 navigation map): profile and units, goal and targets, minimum energy, language, About. */
export function SettingsScreen({ onOpen, onBack }: { onOpen: (section: SettingsSection) => void; onBack?: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { repos } = useServices();
  const snackbar = useSnackbar();
  const [details, setDetails] = useState<Details>({});
  const [languageFailed, setLanguageFailed] = useState(false);

  // What each row shows is read once; a failed read leaves the row without a detail line, not broken.
  useEffect(() => {
    let active = true;
    Promise.all([repos.profile.get(), repos.goals.current(), readMinimumKcal(repos.settings)]).then(
      ([profile, goal, minimum]) => {
        if (!active) return;
        setDetails({
          profile: profile ? t(`profile.units.${profile.unitSystem}`) : undefined,
          goal: goal?.kcalTarget != null ? `${formatNumber(locale, goal.kcalTarget)} kcal · ${t(`goal.type.${goal.type}`)}` : t('goal.none'),
          minimum: minimum !== null ? t('minimum.current', { kcal: formatNumber(locale, minimum) }) : `${formatNumber(locale, DEFAULT_MINIMUM_DAILY_KCAL.female)} / ${formatNumber(locale, DEFAULT_MINIMUM_DAILY_KCAL.male)} kcal`,
        });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [repos, t, locale]);

  const chooseLanguage = async (next: Locale) => {
    if (next === locale) return;
    setLanguageFailed(false);
    try {
      await saveLocale(repos, i18n, next);
    } catch {
      // The screen is already in the new language; only the memory of the choice failed.
      setLanguageFailed(true);
      snackbar.show({ message: t('settings.languageNotSaved') });
    }
  };

  return (
    <ScreenFrame header={<TopBar title={t('settings.title')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        <View style={styles.rows}>
          <SettingsRow icon="today" title={t('settings.profile')} detail={details.profile} onPress={() => onOpen('profile')} />
          <SettingsRow icon="progress" title={t('settings.goal')} detail={details.goal} onPress={() => onOpen('goal')} />
          <SettingsRow icon="settings" title={t('settings.minimum')} detail={details.minimum} onPress={() => onOpen('minimum')} />
          <SettingsRow icon="info" title={t('settings.about')} onPress={() => onOpen('about')} />
        </View>

        <View style={styles.language}>
          <AppText variant="heading" accessibilityRole="header">
            {t('settings.language')}
          </AppText>
          <ChoiceChips<Locale>
            label={t('settings.language')}
            options={SUPPORTED_LOCALES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
            value={locale}
            onChange={(value) => value && void chooseLanguage(value)}
          />
          {languageFailed ? (
            <AppText variant="bodySm" tone="warning">
              {t('settings.languageNotSaved')}
            </AppText>
          ) : null}
        </View>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s6 },
  rows: { gap: spacing.s2 },
  language: { gap: spacing.s3, paddingHorizontal: spacing.s2 },
});
