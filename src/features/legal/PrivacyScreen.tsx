import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { formatLongDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, ScreenFrame, TopBar, layout, radius, spacing, useTheme } from '@/ui';
import { PRIVACY_VERSION } from './version';

/** The sections of the policy, in order, as keys under `legal.privacy` (docs/12 section 3). `leaves` has its own table below. */
const BEFORE_TABLE = ['summary', 'stores'] as const;
const TABLE_ROWS = ['photo', 'suggest', 'barcode', 'export'] as const;
const AFTER_TABLE = ['never', 'health', 'control', 'children', 'changes', 'contact'] as const;

interface PrivacyScreenProps {
  onBack?: () => void;
}

/**
 * The privacy policy, readable at any time from About (S8), in the language of the app. The text lives in the i18n files (English
 * and Spanish) and is the same as `PRIVACY.md` at the repository root; a test keeps the two equal. It is a draft until a lawyer
 * has reviewed it (docs/12), and says so.
 */
export function PrivacyScreen({ onBack }: PrivacyScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const updated = formatLongDate(locale, PRIVACY_VERSION);

  return (
    <ScreenFrame header={<TopBar title={t('about.privacyRow')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body} testID="privacy-policy">
        <AppText variant="titleSm" accessibilityRole="header">
          {t('legal.privacy.title')}
        </AppText>
        <AppText variant="bodySm" tone="muted">
          {t('legal.version.draft')} {t('legal.version.updated', { date: updated })}
        </AppText>

        {BEFORE_TABLE.map((key) => (
          <Section key={key} section={key} />
        ))}

        <View style={styles.section}>
          <AppText style={styles.lead} accessibilityRole="header">
            {t('legal.privacy.leaves.lead')}
          </AppText>
          {TABLE_ROWS.map((row) => (
            <View key={row} style={[styles.card, { backgroundColor: colors.surface }]} accessible accessibilityLabel={rowLabel(t, row)} testID={`privacy-row-${row}`}>
              <AppText variant="itemName" aria-hidden>
                {t(`legal.privacy.leaves.${row}.action`)}
              </AppText>
              <AppText variant="bodySm" tone="muted" aria-hidden>
                {t('legal.privacy.leaves.dataLabel')}
              </AppText>
              <AppText aria-hidden>{t(`legal.privacy.leaves.${row}.data`)}</AppText>
              <AppText variant="bodySm" tone="muted" aria-hidden>
                {t('legal.privacy.leaves.recipientLabel')}
              </AppText>
              <AppText aria-hidden>{t(`legal.privacy.leaves.${row}.recipient`)}</AppText>
            </View>
          ))}
          <AppText>{t('legal.privacy.leaves.note')}</AppText>
        </View>

        {AFTER_TABLE.map((key) => (
          <Section key={key} section={key} />
        ))}
      </View>
    </ScreenFrame>
  );
}

function rowLabel(t: TFunction, row: (typeof TABLE_ROWS)[number]): string {
  return `${t(`legal.privacy.leaves.${row}.action`)}. ${t('legal.privacy.leaves.dataLabel')}: ${t(`legal.privacy.leaves.${row}.data`)}. ${t('legal.privacy.leaves.recipientLabel')}: ${t(`legal.privacy.leaves.${row}.recipient`)}.`;
}

function Section({ section }: { section: (typeof BEFORE_TABLE)[number] | (typeof AFTER_TABLE)[number] }) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <AppText>
        <AppText style={styles.lead}>{t(`legal.privacy.${section}.lead`)}</AppText> {t(`legal.privacy.${section}.body`)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  section: { gap: spacing.s3 },
  lead: { fontFamily: 'Figtree_700Bold' },
  card: { borderRadius: radius.lg, padding: spacing.s4, gap: spacing.s1 },
});
