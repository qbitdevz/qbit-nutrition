import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Profile } from '@/data';
import { formatInstantDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, ScreenFrame, TopBar, layout, radius, spacing, useTheme } from '@/ui';
import { Disclaimer } from '../legal/Disclaimer';
import { useServices } from '../startup/AppProvider';

interface AboutScreenProps {
  onBack?: () => void;
  onOpenCalculation?: () => void;
}

/** Settings → About: the health notice (always available, docs/12 section 2), when it was accepted, and how targets are calculated. */
export function AboutScreen({ onBack, onOpenCalculation }: AboutScreenProps) {
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
  return (
    <ScreenFrame header={<TopBar title={t('about.title')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Disclaimer headingVariant="titleSm" />
        </View>
        {profile !== undefined ? (
          <AppText variant="bodySm" tone="muted">
            {profile
              ? t('about.accepted', { date: formatInstantDate(locale, new Date(profile.disclaimerAcceptedAt)), version: profile.disclaimerVersion })
              : t('about.notAccepted')}
          </AppText>
        ) : null}
        {onOpenCalculation ? <Button label={t('about.how')} variant="secondary" icon="info" onPress={onOpenCalculation} /> : null}
        <AppText variant="bodySm" tone="muted">
          {t('about.privacy')}
        </AppText>
        {version ? (
          <AppText variant="bodySm" tone="muted">
            {t('about.version', { version })}
          </AppText>
        ) : null}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5 },
});
