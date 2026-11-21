import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { TARGET_SOURCES, type TargetProposal, type TargetSourceEntry } from '@/core/nutrition';
import { formatDecimal, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, Icon, ScreenFrame, TopBar, radius, spacing, useTheme } from '@/ui';

const valueText = (locale: Locale, value: TargetSourceEntry['value']): string =>
  typeof value === 'number'
    ? formatDecimal(locale, value, 3)
    : Object.entries(value)
        .map(([key, amount]) => `${key} ${formatDecimal(locale, amount, 3)}`)
        .join(', ');

interface CalculationContentProps {
  /** The proposal being shown, to list the steps that gave its numbers. */
  proposal?: TargetProposal | null;
}

/**
 * "How this is calculated" (S4): every constant used to propose targets with its value, where it
 * comes from (title, publisher, the place in the source, the quoted sentence, a link) and whether it
 * is a published value, a point inside a published range, or unsourced. An unsourced value is
 * flagged as such, never presented as published. The text of the sources is English, as published.
 */
export function CalculationContent({ proposal }: CalculationContentProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const entries = Object.entries(TARGET_SOURCES) as [keyof typeof TARGET_SOURCES, TargetSourceEntry][];

  return (
    <View style={styles.root}>
      <AppText tone="muted">{t('calc.intro')}</AppText>
      <AppText variant="bodySm" tone="muted">
        {t('calc.english')}
      </AppText>

      {proposal ? (
        <View style={[styles.card, { backgroundColor: colors.primarySoft }]}>
          <AppText variant="heading" accessibilityRole="header">
            {t('calc.yourNumbers')}
          </AppText>
          <AppText variant="bodyMd">{t('calc.age', { years: proposal.ageYears })}</AppText>
          <AppText variant="bodyMd">{t('calc.resting', { kcal: formatNumber(locale, proposal.restingKcal) })}</AppText>
          <AppText variant="bodyMd">{t('calc.maintenance', { kcal: formatNumber(locale, proposal.maintenanceKcal) })}</AppText>
          <AppText variant="bodyMd">
            {t('calc.adjustment', { percent: `${proposal.adjustment > 0 ? '+' : ''}${formatDecimal(locale, proposal.adjustment * 100, 1)}%` })}
          </AppText>
        </View>
      ) : null}

      {entries.map(([id, entry]) => (
        <View key={id} style={[styles.card, { backgroundColor: colors.surface }]} testID={`source-${id}`}>
          <AppText variant="itemName">{t(`calc.constants.${id.replace(/\./g, '_')}`)}</AppText>
          <AppText variant="bodyMd">
            {valueText(locale, entry.value)} <AppText variant="bodySm" tone="muted">{entry.unit}</AppText>
          </AppText>
          <View style={styles.status}>
            <Icon name={entry.status === 'unsourced' ? 'alert' : 'check'} size={18} color={entry.status === 'unsourced' ? colors.warning : colors.green} />
            <AppText variant="bodySm" tone={entry.status === 'unsourced' ? 'warning' : 'green'} style={styles.statusText}>
              {t(`calc.status.${entry.status}`)}
            </AppText>
          </View>
          {entry.source ? (
            <View style={styles.source}>
              <AppText variant="bodySm">{entry.source.title}</AppText>
              <AppText variant="bodySm" tone="muted">
                {entry.source.publisher}
              </AppText>
              <AppText variant="bodySm" tone="muted">
                {t('calc.where')}: {entry.source.locator}
              </AppText>
              <AppText variant="bodySm" tone="muted" style={styles.quote}>
                “{entry.source.quote}”
              </AppText>
              <Button label={t('calc.openSource')} variant="ghost" block={false} onPress={() => void Linking.openURL(entry.source!.url)} />
            </View>
          ) : null}
          <AppText variant="bodySm" tone="muted">
            {entry.note}
          </AppText>
        </View>
      ))}
    </View>
  );
}

interface CalculationScreenProps {
  onBack?: () => void;
  proposal?: TargetProposal | null;
}

export function CalculationScreen({ onBack, proposal }: CalculationScreenProps) {
  const { t } = useTranslation();
  return (
    <ScreenFrame header={<TopBar title={t('calc.title')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        <CalculationContent proposal={proposal} />
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.s4, paddingBottom: spacing.s10 },
  root: { gap: spacing.s3 },
  card: { borderRadius: radius.lg, padding: spacing.s4, gap: spacing.s2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  statusText: { flex: 1 },
  source: { gap: spacing.s1 },
  quote: { fontStyle: 'italic' },
});
