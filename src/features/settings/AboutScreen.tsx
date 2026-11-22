import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import type { Profile } from '@/data';
import { formatInstantDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, ScreenFrame, SettingsRow, TopBar, layout, radius, spacing, useTheme } from '@/ui';
import { Disclaimer } from '../legal/Disclaimer';
import { useServices } from '../startup/AppProvider';

export const SOURCE_URL = 'https://github.com/qbitdevz/qbit-nutrition';
export const OFF_LEGAL_URL = 'https://world.openfoodfacts.org/legal';

interface AboutScreenProps {
  onBack?: () => void;
  onOpenCalculation?: () => void;
  onOpenPrivacy?: () => void;
  onOpenLicenses?: () => void;
}

/**
 * Settings → About (S8, docs/12 section 4): the app, its version and license, the health notice (always available, docs/12
 * section 2) and when it was accepted, the privacy policy, the data sources with their attribution, the names-and-trademarks
 * line, the open-source licenses, and how targets are calculated.
 */
export function AboutScreen({ onBack, onOpenCalculation, onOpenPrivacy, onOpenLicenses }: AboutScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const { repos } = useServices();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    repos.profile.get().then(
      (value) => active && setProfile(value),
      () => active && setProfile(null),
    );
    return () => {
      active = false;
    };
  }, [repos]);

  const version = Constants.expoConfig?.version ?? '';
  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);
  return (
    <ScreenFrame header={<TopBar title={t('about.title')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="about-app">
          <AppText variant="titleSm" accessibilityRole="header">
            {t('about.appName')}
          </AppText>
          {version ? <AppText variant="bodyMd">{t('about.version', { version })}</AppText> : null}
          <AppText variant="bodyMd">{t('about.by')}</AppText>
          <AppText variant="bodyMd">{t('about.license')}</AppText>
          <Button label={t('about.source')} accessibilityLabel={t('about.sourceLabel')} variant="secondary" icon="right" onPress={() => open(SOURCE_URL)} testID="about-source" />
          <AppText variant="bodySm" tone="muted" selectable>
            {SOURCE_URL}
          </AppText>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="about-notice">
          <Disclaimer headingVariant="titleSm" />
        </View>
        {profile !== undefined ? (
          <AppText variant="bodySm" tone="muted">
            {profile && profile.disclaimerVersion
              ? t('about.accepted', { date: formatInstantDate(locale, new Date(profile.disclaimerAcceptedAt)), version: profile.disclaimerVersion })
              : t('about.notAccepted')}
          </AppText>
        ) : null}

        <View style={styles.rows}>
          {onOpenPrivacy ? <SettingsRow icon="info" title={t('about.privacyRow')} detail={t('about.privacyRowDetail')} onPress={onOpenPrivacy} testID="about-privacy" /> : null}
          {onOpenCalculation ? <SettingsRow icon="progress" title={t('about.how')} onPress={onOpenCalculation} testID="about-how" /> : null}
          {onOpenLicenses ? <SettingsRow icon="copy" title={t('about.licensesRow')} detail={t('about.licensesRowDetail')} onPress={onOpenLicenses} testID="about-licenses" /> : null}
        </View>

        <View style={[styles.card, styles.sources, { backgroundColor: colors.surface }]} testID="data-sources">
          <AppText variant="heading" accessibilityRole="header">
            {t('about.sources.title')}
          </AppText>
          <AppText variant="bodyMd">{t('about.sources.usda')}</AppText>
          <AppText variant="bodySm" tone="muted">
            {t('about.sources.usdaNote')}
          </AppText>
          <AppText variant="bodySm" tone="muted">
            {t('about.sources.recipesNote')}
          </AppText>
          <AppText variant="bodyMd">{t('about.sources.off')}</AppText>
          <AppText variant="bodySm" tone="muted">
            {t('about.sources.offNote')}
          </AppText>
          <Button label={t('about.sources.offLink')} variant="ghost" icon="right" onPress={() => open(OFF_LEGAL_URL)} />
        </View>

        <View style={[styles.card, styles.sources, { backgroundColor: colors.surface }]} testID="about-names">
          <AppText variant="heading" accessibilityRole="header">
            {t('about.names.title')}
          </AppText>
          <AppText variant="bodyMd">{t('about.names.body')}</AppText>
        </View>

        <AppText variant="bodySm" tone="muted">
          {t('about.privacy')}
        </AppText>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s2 },
  rows: { gap: spacing.s2 },
  sources: { gap: spacing.s3 },
});
