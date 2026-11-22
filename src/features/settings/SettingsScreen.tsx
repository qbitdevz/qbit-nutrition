import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DEFAULT_MINIMUM_DAILY_KCAL } from '@/core/nutrition';
import { formatNumber } from '@/i18n/format';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/locale';
import { AppText, ChoiceChips, ScreenFrame, SettingsRow, TopBar, layout, spacing, useSnackbar } from '@/ui';
import { readMinimumKcal } from '../goals/minimum';
import { readKeepPhotos, writeKeepPhotos } from '../scan/photoSettings';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { destinationOf } from './destination';
import { saveLocale } from './language';

export type SettingsSection = 'profile' | 'goal' | 'minimum' | 'providers' | 'integrations' | 'data' | 'about';

const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' };

interface Details {
  profile?: string;
  goal?: string;
  minimum?: string;
  providers?: string;
  integrations?: string;
}

/** Settings (docs/04 navigation map): profile and units, goal and targets, minimum energy, language, About. */
export function SettingsScreen({ onOpen, onBack }: { onOpen: (section: SettingsSection) => void; onBack?: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { repos, health } = useServices();
  const snackbar = useSnackbar();
  const { revision } = useSession();
  const [details, setDetails] = useState<Details>({});
  const [languageFailed, setLanguageFailed] = useState(false);
  const [keepPhotos, setKeepPhotos] = useState(true);
  const [keepFailed, setKeepFailed] = useState(false);

  // What each row shows is read once; a failed read leaves the row without a detail line, not broken.
  useEffect(() => {
    let active = true;
    Promise.all([repos.profile.get(), repos.goals.current(), readMinimumKcal(repos.settings), repos.aiProviders.getActive(), health.isEnabled()]).then(
      ([profile, goal, minimum, provider, healthOn]) => {
        if (!active) return;
        setDetails({
          profile: profile ? t(`profile.units.${profile.unitSystem}`) : undefined,
          goal: goal?.kcalTarget != null ? `${formatNumber(locale, goal.kcalTarget)} kcal · ${t(`goal.type.${goal.type}`)}` : t('goal.none'),
          integrations: t(healthOn ? 'settings.integrationsOn' : 'settings.integrationsOff'),
          providers: provider ? `${destinationOf(provider)} · ${provider.model}` : t('settings.providersNone'),
          minimum: minimum !== null ? t('minimum.current', { kcal: formatNumber(locale, minimum) }) : `${formatNumber(locale, DEFAULT_MINIMUM_DAILY_KCAL.female)} / ${formatNumber(locale, DEFAULT_MINIMUM_DAILY_KCAL.male)} kcal`,
        });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [repos, health, t, locale, revision]);

  useEffect(() => {
    let active = true;
    readKeepPhotos(repos.settings).then((keep) => active && setKeepPhotos(keep), () => undefined);
    return () => {
      active = false;
    };
  }, [repos]);

  const chooseKeepPhotos = async (keep: boolean) => {
    if (keep === keepPhotos) return;
    setKeepFailed(false);
    setKeepPhotos(keep);
    try {
      await writeKeepPhotos(repos.settings, keep);
    } catch {
      setKeepPhotos(!keep);
      setKeepFailed(true);
    }
  };

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
          <SettingsRow icon="sparkle" title={t('settings.providers')} detail={details.providers} onPress={() => onOpen('providers')} />
          <SettingsRow icon="swap" title={t('settings.integrations')} detail={details.integrations} onPress={() => onOpen('integrations')} testID="settings-integrations" />
          <SettingsRow icon="copy" title={t('settings.data')} detail={t('settings.dataDetail')} onPress={() => onOpen('data')} />
          <SettingsRow icon="info" title={t('settings.about')} onPress={() => onOpen('about')} />
        </View>

        <View style={styles.language}>
          <AppText variant="heading" accessibilityRole="header">
            {t('settings.keepPhotos')}
          </AppText>
          <AppText variant="bodySm" tone="muted">
            {t('settings.keepPhotosHint')}
          </AppText>
          <ChoiceChips<'keep' | 'drop'>
            label={t('settings.keepPhotos')}
            options={[
              { value: 'keep', label: t('settings.keepPhotosOn') },
              { value: 'drop', label: t('settings.keepPhotosOff') },
            ]}
            value={keepPhotos ? 'keep' : 'drop'}
            onChange={(value) => value && void chooseKeepPhotos(value === 'keep')}
          />
          {keepFailed ? (
            <AppText variant="bodySm" tone="warning">
              {t('log.review.saveError')}
            </AppText>
          ) : null}
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
