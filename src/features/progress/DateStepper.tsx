import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { addDays } from '@/data';
import { formatLongDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, IconButton, spacing } from '@/ui';

interface DateStepperProps {
  /** `YYYY-MM-DD`. */
  value: string;
  /** Latest date that can be chosen (today): nothing is logged for a day that has not happened. */
  max: string;
  onChange: (date: string) => void;
}

/** Picks a day by stepping back and forward from it: no typing a date, so no malformed dates. */
export function DateStepper({ value, max, onChange }: DateStepperProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const isMax = value >= max;
  return (
    <View style={styles.row}>
      <IconButton icon="left" label={t('progress.entry.previousDay')} onPress={() => onChange(addDays(value, -1))} testID="date-previous" />
      <AppText variant="itemName" style={styles.value} testID="date-value" accessibilityLiveRegion="polite">
        {value === max ? `${t('progress.entry.today')} · ${formatLongDate(locale, value)}` : formatLongDate(locale, value)}
      </AppText>
      <IconButton icon="right" label={isMax ? t('progress.entry.nextDayUnavailable') : t('progress.entry.nextDay')} disabled={isMax} onPress={() => onChange(addDays(value, 1))} testID="date-next" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s2 },
  value: { flex: 1, textAlign: 'center' },
});
