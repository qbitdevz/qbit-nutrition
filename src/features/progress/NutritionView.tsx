import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MIN_LOGGED_DAYS_FOR_AVERAGE, periodRange, shiftPeriod, type PeriodKind, type PeriodSummary } from '@/core/nutrition';
import { deriveMealTime } from '@/data';
import { formatDayDate, formatMonthYear, formatNumber, formatShortDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AnimatedNumber, AppText, Button, ChoiceChips, EmptyState, ErrorState, IconButton, InsightLine, MacroCard, Skeleton, radius, spacing, useTheme } from '@/ui';
import { useServices } from '../startup/AppProvider';
import { FullBleed } from './FullBleed';
import { loadNutrition } from './loadProgress';
import { useLoad } from './useLoad';

interface NutritionViewProps {
  now: () => Date;
  refresh: number;
}

/**
 * Week and month averages (FR-43): calories and macronutrients per logged day against the targets that
 * applied on each of those days. Days without meals are not counted, and the screen says how many days
 * the average is over. With too few logged days it lists what exists and gives no average.
 */
export function NutritionView({ now, refresh }: NutritionViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { repos } = useServices();
  const today = deriveMealTime(now()).localDate;
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState(today);

  const load = useCallback(() => loadNutrition({ repos, kind, anchor }), [repos, kind, anchor]);
  const state = useLoad(load, `${kind}:${anchor}`, refresh);

  // The range comes from the dates alone, so the navigation never waits for the database.
  const range = periodRange(kind, anchor);
  const isCurrent = range.from <= today && today <= range.to;

  const move = (steps: number) => setAnchor(shiftPeriod(kind, anchor, steps));
  const label = kind === 'week' ? `${formatShortDate(locale, range.from)} – ${formatShortDate(locale, range.to)}` : formatMonthYear(locale, range.from);

  return (
    <View style={styles.root}>
      <ChoiceChips<PeriodKind>
        label={t('progress.nutrition.periodLabel')}
        options={[
          { value: 'week', label: t('progress.nutrition.week') },
          { value: 'month', label: t('progress.nutrition.month') },
        ]}
        value={kind}
        onChange={(value) => {
          if (!value) return;
          setKind(value);
          setAnchor(today);
        }}
        fill
      />

      <View style={styles.nav}>
        <IconButton icon="left" label={t(kind === 'week' ? 'progress.nutrition.previousWeek' : 'progress.nutrition.previousMonth')} onPress={() => move(-1)} testID="period-previous" />
        <View style={styles.navLabel} accessible accessibilityRole="header" accessibilityLabel={label} testID="period-label">
          <AppText variant="itemName" style={styles.center}>
            {label}
          </AppText>
          {isCurrent ? (
            <AppText variant="bodySm" tone="muted" style={styles.center}>
              {t(kind === 'week' ? 'progress.nutrition.thisWeek' : 'progress.nutrition.thisMonth')}
            </AppText>
          ) : null}
        </View>
        <IconButton
          icon="right"
          label={isCurrent ? t('progress.nutrition.nextUnavailable') : t(kind === 'week' ? 'progress.nutrition.nextWeek' : 'progress.nutrition.nextMonth')}
          disabled={isCurrent}
          onPress={() => move(1)}
          testID="period-next"
        />
      </View>

      {state.status === 'loading' ? (
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('progress.loading')} style={styles.loading} testID="progress-loading">
          <Skeleton height={150} radius={radius.lg} />
          <View style={styles.macros}>
            <Skeleton width="31.5%" height={84} radius={20} />
            <Skeleton width="31.5%" height={84} radius={20} />
            <Skeleton width="31.5%" height={84} radius={20} />
          </View>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <ErrorState title={t('progress.error.title')} message={t('progress.error.message')}>
          <Button label={t('common.retry')} icon="retake" onPress={state.retry} />
        </ErrorState>
      ) : null}

      {state.status === 'ready' ? <Summary summary={state.data} locale={locale} /> : null}
    </View>
  );
}

function Summary({ summary, locale }: { summary: PeriodSummary; locale: Locale }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const n = useCallback((value: number) => formatNumber(locale, value), [locale]);
  const coverage = t('progress.nutrition.daysLogged', { logged: summary.loggedDays, total: summary.totalDays });

  if (summary.status === 'empty') {
    return (
      <FullBleed>
        <EmptyState title={t('progress.nutrition.empty.title')} body={t('progress.nutrition.empty.body')} icon="progress" />
      </FullBleed>
    );
  }

  if (summary.status === 'partial') {
    return (
      <View style={styles.content} testID="nutrition-partial">
        <FullBleed>
          <InsightLine text={t('progress.nutrition.partial', { count: summary.loggedDays, min: MIN_LOGGED_DAYS_FOR_AVERAGE[summary.kind] })} />
        </FullBleed>
        <AppText variant="heading" accessibilityRole="header">
          {t('progress.nutrition.daysHeading')}
        </AppText>
        <AppText variant="bodySm" tone="muted">
          {coverage}
        </AppText>
        <View style={styles.days}>
          {summary.days.map((day) => {
            const date = formatDayDate(locale, day.localDate);
            return (
              <View
                key={day.localDate}
                accessible
                accessibilityLabel={t('progress.nutrition.dayRow', { date, kcal: n(day.kcal), protein: n(day.proteinG), carbs: n(day.carbsG), fat: n(day.fatG) })}
                style={[styles.day, { backgroundColor: colors.surface }]}>
                <View style={styles.dayTop}>
                  <AppText variant="itemName">{date}</AppText>
                  <AppText variant="bodySm" tone="muted">
                    <AppText variant="numeral">{n(day.kcal)}</AppText> kcal
                  </AppText>
                </View>
                <AppText variant="bodySm" tone="muted">
                  {t('progress.nutrition.dayMacros', { protein: n(day.proteinG), carbs: n(day.carbsG), fat: n(day.fatG) })}
                </AppText>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  const average = summary.average!;
  const targets = summary.targets!;
  const hasTarget = targets.kcal !== null && targets.kcal > 0;
  const difference = hasTarget ? Math.round(average.kcal) - Math.round(targets.kcal!) : 0;
  const difference_text = !hasTarget
    ? t('progress.nutrition.noTarget')
    : difference === 0
      ? t('progress.nutrition.atTarget')
      : t(difference < 0 ? 'progress.nutrition.underTarget' : 'progress.nutrition.overTarget', { amount: n(Math.abs(difference)) });
  const periodWord = t(summary.kind === 'week' ? 'progress.nutrition.week' : 'progress.nutrition.month');
  const spoken = `${t('progress.nutrition.summary', { period: periodWord, logged: summary.loggedDays, kcal: n(average.kcal), protein: n(average.proteinG), carbs: n(average.carbsG), fat: n(average.fatG) })}${hasTarget ? ` ${t('progress.nutrition.summaryTarget', { kcal: n(targets.kcal!) })}` : ''}`;

  const macros = [
    { kind: 'protein', name: t('today.protein'), grams: average.proteinG, target: targets.proteinG },
    { kind: 'carbs', name: t('today.carbs'), grams: average.carbsG, target: targets.carbsG },
    { kind: 'fat', name: t('today.fat'), grams: average.fatG, target: targets.fatG },
  ] as const;

  return (
    <View style={styles.content} testID="nutrition-average">
      <View style={[styles.card, { backgroundColor: colors.surface }]} accessible accessibilityLabel={spoken}>
        <AppText variant="bodySm" tone="muted">
          {t('progress.nutrition.averageTitle')}
        </AppText>
        <View style={styles.big}>
          <AnimatedNumber value={Math.round(average.kcal)} from={0} variant="numeralMd" format={n} />
          <AppText variant="bodyMd" tone="muted">
            {t('progress.nutrition.kcalUnit')}
          </AppText>
        </View>
        {hasTarget ? (
          <AppText variant="bodySm" tone="muted">
            {t('progress.nutrition.target', { target: n(targets.kcal!) })}
          </AppText>
        ) : null}
        <AppText variant="bodyMd">{difference_text}</AppText>
        <AppText variant="bodySm" tone="muted" testID="coverage">
          {coverage}
        </AppText>
      </View>

      <View style={styles.macros} accessibilityLabel={t('progress.nutrition.macros')}>
        {macros.map((m) => (
          <MacroCard
            key={m.kind}
            kind={m.kind}
            name={m.name}
            grams={m.grams}
            targetGrams={m.target}
            unit={t('today.gramUnit')}
            formatNumber={n}
            summary={m.target ? t('today.macroSummary', { name: m.name, grams: n(m.grams), target: n(m.target) }) : t('today.macroSummaryNoTarget', { name: m.name, grams: n(m.grams) })}
          />
        ))}
      </View>

      {summary.targetsChanged ? (
        <FullBleed>
          <InsightLine text={t('progress.nutrition.targetsChanged')} />
        </FullBleed>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.s4 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s2 },
  navLabel: { flex: 1, alignItems: 'center' },
  center: { textAlign: 'center' },
  loading: { gap: spacing.s4 },
  content: { gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s1 },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.s2 },
  macros: { flexDirection: 'row', gap: spacing.s2 },
  days: { gap: spacing.s2 },
  day: { borderRadius: radius.lg, paddingHorizontal: spacing.s4, paddingVertical: spacing.s3, gap: 2 },
  dayTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
