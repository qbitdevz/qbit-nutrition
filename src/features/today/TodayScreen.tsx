import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { addDays, deriveMealTime } from '@/data';
import { formatClock, formatDayDate, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import {
  AnimatedNumber,
  AppText,
  Button,
  CalorieRing,
  EmptyState,
  ErrorState,
  IconButton,
  InsightLine,
  MacroCard,
  MealRow,
  ScreenFrame,
  Skeleton,
  WordmarkHeader,
  layout,
  spacing,
} from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import type { TodayData } from './loadToday';
import { insightMessage } from './insightText';
import { useTodayData } from './useTodayData';

/** In development only: Metro removes this branch (and the module) from release bundles. */
const DevSeedButton: typeof import('./DevSeedButton').DevSeedButton | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./DevSeedButton') as typeof import('./DevSeedButton')).DevSeedButton
  : null;

export interface TodayScreenHandle {
  /** Re-reads the day without a loading state; call it when the screen regains focus. */
  reload: () => void;
}

interface TodayScreenProps {
  onOpenSettings: () => void;
  /** Opens the meal behind a row (meal detail); without it the rows are information only. */
  onOpenMeal?: (mealId: string) => void;
  /** The action of the "no targets" notice: leads to the goal setup. */
  onSetupTargets?: () => void;
  /** The clock; tests pass a fixed one. */
  now?: () => Date;
  /** Tells the dock to pulse its scan button (the first-day prompt). */
  onEmptyDayChange?: (empty: boolean) => void;
  handleRef?: Ref<TodayScreenHandle>;
}

const systemNow = () => new Date();

/**
 * Today (S9, REQ-05): what was eaten, what is left against the goal, the three macronutrients, one
 * insight, and the day's meals; the arrows open past days (S7). All data comes through the
 * repositories in `useTodayData`; this file only lays it out.
 */
export function TodayScreen({ onOpenSettings, onOpenMeal, onSetupTargets, now = systemNow, onEmptyDayChange, handleRef }: TodayScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { repos } = useServices();

  const today = deriveMealTime(now()).localDate;
  // null follows "today", so a screen left open past midnight moves on by itself.
  const [picked, setPicked] = useState<string | null>(null);
  const localDate = picked ?? today;
  const state = useTodayData(repos, localDate, now);
  useImperativeHandle(handleRef, () => ({ reload: state.reload }), [state.reload]);

  // A change made away from this screen (an undo from a snackbar) is read again without a loading state.
  const { revision } = useSession();
  const seenRevision = useRef(revision);
  const { reload } = state;
  useEffect(() => {
    if (seenRevision.current === revision) return;
    seenRevision.current = revision;
    reload();
  }, [revision, reload]);

  const goTo = useCallback(
    (date: string) => setPicked(date >= today ? null : date),
    [today],
  );

  const readyData = state.status === 'ready' ? state.data : null;
  const emptyToday = readyData !== null && readyData.isToday && readyData.meals.length === 0;
  useEffect(() => {
    onEmptyDayChange?.(emptyToday);
  }, [emptyToday, onEmptyDayChange]);

  return (
    <ScreenFrame
      bottomInset={layout.dockClearance}
      header={<WordmarkHeader name={t('app.name')} label={t('app.wordmarkLabel')} settingsLabel={t('today.settings')} onSettings={onOpenSettings} />}>
      <DayNavigation locale={locale} localDate={localDate} today={today} onGo={goTo} />
      {state.status === 'loading' ? <TodaySkeleton /> : null}
      {state.status === 'error' ? (
        <View style={styles.error}>
          <ErrorState title={t('today.error.title')} message={t('today.error.message')}>
            <Button label={t('common.retry')} icon="retake" onPress={state.retry} />
          </ErrorState>
        </View>
      ) : null}
      {state.status === 'ready' ? <TodayContent key={state.data.localDate} data={state.data} locale={locale} onSeeded={state.reload} onOpenMeal={onOpenMeal} onSetupTargets={onSetupTargets} /> : null}
    </ScreenFrame>
  );
}

function DayNavigation({ locale, localDate, today, onGo }: { locale: Locale; localDate: string; today: string; onGo: (date: string) => void }) {
  const { t } = useTranslation();
  const isToday = localDate === today;
  const word = isToday ? t('today.title') : localDate === addDays(today, -1) ? t('today.yesterday') : null;
  const date = formatDayDate(locale, localDate);
  return (
    <View style={styles.dayNav}>
      <IconButton icon="left" label={t('today.previousDay')} onPress={() => onGo(addDays(localDate, -1))} testID="previous-day" />
      <AppText variant="dayTitle" accessibilityRole="header" accessibilityLabel={word ? `${word}, ${date}` : date} style={styles.dayTitle} testID="day-title">
        {word ? (
          <>
            {word}{' '}
            <AppText variant="dayTitle" tone="muted" style={styles.dayDate}>
              {date}
            </AppText>
          </>
        ) : (
          date
        )}
      </AppText>
      <IconButton
        icon="right"
        label={isToday ? t('today.nextDayUnavailable') : t('today.nextDay')}
        disabled={isToday}
        onPress={() => onGo(addDays(localDate, 1))}
        testID="next-day"
      />
    </View>
  );
}

function TodayContent({
  data,
  locale,
  onSeeded,
  onOpenMeal,
  onSetupTargets,
}: {
  data: TodayData;
  locale: Locale;
  onSeeded: () => void;
  onOpenMeal?: (mealId: string) => void;
  onSetupTargets?: () => void;
}) {
  const { t } = useTranslation();
  const n = useCallback((value: number) => formatNumber(locale, value), [locale]);
  const { totals, targets, meals } = data;

  const hasKcalTarget = targets.kcal !== null && targets.kcal > 0;
  const left = hasKcalTarget ? targets.kcal! - totals.kcal : 0;
  const over = hasKcalTarget && left < 0;
  const eaten = Math.round(totals.kcal);

  const ring = hasKcalTarget
    ? {
        value: Math.abs(Math.round(left)),
        from: over ? Math.abs(Math.round(left)) : Math.round(targets.kcal!),
        label: over ? t('today.kcalOver') : t('today.kcalLeft'),
        progress: totals.kcal / targets.kcal!,
        summary: over
          ? t('today.ringOver', { over: n(-left), eaten: n(eaten), target: n(targets.kcal!) })
          : t('today.ringLeft', { left: n(left), eaten: n(eaten), target: n(targets.kcal!) }),
      }
    : {
        value: eaten,
        from: 0,
        label: t('today.kcalEaten'),
        progress: 0,
        summary: t('today.ringNoTarget', { eaten: n(eaten) }),
      };

  const macros = [
    { kind: 'protein', name: t('today.protein'), grams: totals.proteinG, target: targets.proteinG },
    { kind: 'carbs', name: t('today.carbs'), grams: totals.carbsG, target: targets.carbsG },
    { kind: 'fat', name: t('today.fat'), grams: totals.fatG, target: targets.fatG },
  ] as const;

  const insight = data.insight ? insightMessage(t, locale, data.insight) : null;

  return (
    <View>
      <View style={styles.orbit}>
        <CalorieRing
          value={ring.value}
          countFrom={ring.from}
          label={ring.label}
          progress={ring.progress}
          summary={ring.summary}
          formatNumber={n}
        />
        {hasKcalTarget ? (
          <AppText variant="bodyMd" tone="muted" style={styles.ringSub} aria-hidden>
            <AnimatedNumber value={eaten} from={0} format={n} /> {t('today.eatenOf', { target: n(targets.kcal!) })}
          </AppText>
        ) : null}
      </View>

      <View style={styles.macros} accessibilityLabel={t('today.macros')} testID="macros">
        {macros.map((m) => (
          <MacroCard
            key={m.kind}
            kind={m.kind}
            name={m.name}
            grams={m.grams}
            targetGrams={m.target}
            unit={t('today.gramUnit')}
            formatNumber={n}
            summary={
              m.target
                ? t('today.macroSummary', { name: m.name, grams: n(m.grams), target: n(m.target) })
                : t('today.macroSummaryNoTarget', { name: m.name, grams: n(m.grams) })
            }
          />
        ))}
      </View>

      {!hasKcalTarget ? (
        <View style={styles.notice}>
          <InsightLine text={t('today.noTargets')} actionLabel={onSetupTargets ? t('today.setupTargets') : undefined} onAction={onSetupTargets} />
        </View>
      ) : null}
      {insight ? (
        <View style={styles.notice}>
          <InsightLine text={insight} />
        </View>
      ) : null}

      {meals.length > 0 ? (
        <View accessibilityLabel={t('today.mealsHeading')}>
          <View style={styles.sectionHeader}>
            <AppText variant="heading" accessibilityRole="header">
              {t('today.mealsHeading')}
            </AppText>
            <AppText variant="bodySm" tone="muted">
              {t('today.mealCount', { count: meals.length })}
            </AppText>
          </View>
          <View style={styles.meals}>
            {meals.map((meal) => {
              const slot = t(`today.slot.${meal.slot}`);
              const time = formatClock(locale, meal.eatenAt);
              const kcal = n(meal.kcal);
              return (
                <MealRow
                  key={meal.id}
                  name={meal.name}
                  meta={`${slot} · ${time}`}
                  kcal={kcal}
                  kcalUnit={t('today.kcalUnit')}
                  summary={t('today.mealSummary', { name: meal.name, slot, time, kcal })}
                  onPress={onOpenMeal ? () => onOpenMeal(meal.id) : undefined}
                />
              );
            })}
          </View>
        </View>
      ) : data.isToday ? (
        <EmptyState title={t('today.empty.title')} body={t('today.empty.body')}>
          {DevSeedButton ? <DevSeedButton onSeeded={onSeeded} /> : null}
        </EmptyState>
      ) : (
        <EmptyState title={t('today.emptyPast.title')} body={t('today.emptyPast.body')} />
      )}
    </View>
  );
}

/** Placeholder shaped like the loaded screen; hidden from screen readers, which hear the loading label instead. */
function TodaySkeleton() {
  const { t } = useTranslation();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t('today.loadingDay')} style={styles.skeleton} testID="today-loading">
      <View style={styles.orbit}>
        <Skeleton width={layout.ringSize} height={layout.ringSize} radius={layout.ringSize / 2} />
        <Skeleton width={150} height={18} radius={9} />
      </View>
      <View style={styles.macros}>
        <Skeleton width="31.5%" height={84} radius={20} />
        <Skeleton width="31.5%" height={84} radius={20} />
        <Skeleton width="31.5%" height={84} radius={20} />
      </View>
      <View style={styles.meals}>
        <Skeleton height={72} radius={24} />
        <Skeleton height={72} radius={24} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.s1 },
  dayTitle: { minWidth: 156, textAlign: 'center' },
  dayDate: { fontWeight: '500' },
  orbit: { alignItems: 'center', gap: spacing.s3, marginTop: spacing.s1 },
  ringSub: { marginTop: 0 },
  macros: { flexDirection: 'row', gap: spacing.s2, paddingHorizontal: spacing.s4, paddingTop: spacing.s5 },
  notice: { marginTop: spacing.s3 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: spacing.s5, paddingTop: spacing.s6, paddingBottom: 10 },
  meals: { paddingHorizontal: spacing.s4, gap: spacing.s2 },
  skeleton: { gap: spacing.s5 },
  error: { padding: spacing.s4 },
});
