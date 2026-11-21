import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { deriveMealTime } from '@/data';
import { formatDecimal, formatLongDate, formatShortDate, formatSigned } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, ChoiceChips, EmptyState, ErrorState, InsightLine, Skeleton, TrendChart, radius, spacing, useSnackbar, useTheme } from '@/ui';
import { useServices } from '../startup/AppProvider';
import { EntrySheet, type EntryOutcome } from './EntrySheet';
import { FullBleed } from './FullBleed';
import { loadSeries } from './loadProgress';
import { CHART_RANGES, displayUnit, fromMetric, niceScale, rangeStart, summarizeSeries, type ChartRange, type MeasureKind, type SeriesPoint } from './series';
import { useLoad } from './useLoad';

interface SeriesViewProps {
  /** One kind (weight) or several to choose from (the body measurements). */
  kinds: readonly MeasureKind[];
  now: () => Date;
  /** Goes up when something else changed the data (a profile save, returning to the tab). */
  refresh: number;
}

type Sheet = { editing: SeriesPoint | null } | null;

/**
 * One measurement over time: choose a range, see the latest value and the change, the trend chart,
 * and every entry as a row that opens for editing. States: loading, error, empty, one entry (a dot,
 * no line), and a range with no entries.
 */
export function SeriesView({ kinds, now, refresh }: SeriesViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { repos } = useServices();
  const snackbar = useSnackbar();
  const { colors } = useTheme();
  const [kind, setKind] = useState<MeasureKind>(kinds[0]!);
  const [range, setRange] = useState<ChartRange>('90d');
  const [sheet, setSheet] = useState<Sheet>(null);

  const today = deriveMealTime(now()).localDate;
  const load = useCallback(() => loadSeries({ repos, kind }), [repos, kind]);
  const state = useLoad(load, kind, refresh);

  const kindName = t(`progress.kind.${kind}`);
  const kindLower = t(`progress.kindLower.${kind}`);

  const done = (outcome: EntryOutcome) => {
    setSheet(null);
    state.reload();
    if (outcome.type === 'saved') {
      snackbar.show({
        message: t('progress.entry.saved', { kind: t(`progress.kind.${outcome.kind}`), value: formatDecimal(locale, outcome.displayValue, 1), unit: displayUnit(outcome.kind, state.status === 'ready' ? state.data.units : 'metric') }),
      });
      return;
    }
    const { point } = outcome;
    snackbar.show({
      message: t('progress.entry.deleted'),
      actionLabel: t('common.undo'),
      onAction: () => {
        repos.measurements.record({ measuredOn: point.date, kind: outcome.kind, value: point.value }).then(state.reload, () => snackbar.show({ message: t('progress.entry.undoFailed') }));
      },
    });
  };

  return (
    <View style={styles.root}>
      {kinds.length > 1 ? (
        <ChoiceChips<MeasureKind>
          label={t('progress.views.measures')}
          options={kinds.map((value) => ({ value, label: t(`progress.kindChip.${value}`) }))}
          value={kind}
          onChange={(value) => value && setKind(value)}
          fill
        />
      ) : null}

      {state.status === 'loading' ? (
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('progress.loading')} style={styles.loading} testID="progress-loading">
          <Skeleton height={64} radius={radius.lg} />
          <Skeleton height={208} radius={radius.lg} />
          <Skeleton height={56} radius={radius.lg} />
        </View>
      ) : null}

      {state.status === 'error' ? (
        <ErrorState title={t('progress.error.title')} message={t('progress.error.message')}>
          <Button label={t('common.retry')} icon="retake" onPress={state.retry} />
        </ErrorState>
      ) : null}

      {state.status === 'ready' ? (
        <SeriesContent
          kind={kind}
          kindName={kindName}
          kindLower={kindLower}
          data={state.data}
          range={range}
          onRange={setRange}
          today={today}
          locale={locale}
          surface={colors.surface}
          onLog={() => setSheet({ editing: null })}
          onEdit={(point) => setSheet({ editing: point })}
        />
      ) : null}

      <EntrySheet
        visible={sheet !== null}
        kind={kind}
        units={state.status === 'ready' ? state.data.units : 'metric'}
        today={today}
        editing={sheet?.editing ?? null}
        points={state.status === 'ready' ? state.data.points : []}
        onClose={() => setSheet(null)}
        onDone={done}
      />
    </View>
  );
}

function SeriesContent({
  kind,
  kindName,
  kindLower,
  data,
  range,
  onRange,
  today,
  locale,
  surface,
  onLog,
  onEdit,
}: {
  kind: MeasureKind;
  kindName: string;
  kindLower: string;
  data: { units: 'metric' | 'imperial'; points: SeriesPoint[] };
  range: ChartRange;
  onRange: (range: ChartRange) => void;
  today: string;
  locale: Locale;
  surface: string;
  onLog: () => void;
  onEdit: (point: SeriesPoint) => void;
}) {
  const { t } = useTranslation();
  const unit = displayUnit(kind, data.units);
  const unitSpoken = t(`progress.unitSpoken.${unit}`);
  const number = useCallback((value: number) => formatDecimal(locale, value, 1), [locale]);

  const start = rangeStart(range, today);
  // The chart and the list work in the unit the person reads; ids point back at the stored entries.
  const shown = useMemo(
    () => data.points.filter((p) => start === null || p.date >= start).map((p) => ({ id: p.id, date: p.date, value: fromMetric(kind, p.value, data.units) })),
    [data.points, start, kind, data.units],
  );
  const summary = summarizeSeries(shown);
  const scale = useMemo(() => (summary ? niceScale(summary.min, summary.max) : null), [summary]);

  const rangeChips = (
    <ChoiceChips<ChartRange>
      label={t('progress.range.label')}
      options={CHART_RANGES.map((value) => ({ value, label: t(`progress.range.${value}`) }))}
      value={range}
      onChange={(value) => value && onRange(value)}
      fill
    />
  );

  if (data.points.length === 0) {
    return (
      <FullBleed>
        <EmptyState title={t('progress.series.empty.title', { kind: kindLower })} body={t('progress.series.empty.body')} icon="progress">
          <Button label={t('progress.series.log', { kind: kindLower })} icon="plus" onPress={onLog} testID="log-entry" />
        </EmptyState>
      </FullBleed>
    );
  }

  const spokenSummary = !summary
    ? ''
    : summary.count === 1
      ? t('progress.series.summaryOne', { kind: kindName, range: t(`progress.rangeSpoken.${range}`), value: number(summary.last.value), unit: unitSpoken, date: formatLongDate(locale, summary.last.date) })
      : t('progress.series.summary', {
          kind: kindName,
          range: t(`progress.rangeSpoken.${range}`),
          count: summary.count,
          firstDate: formatLongDate(locale, summary.first.date),
          firstValue: number(summary.first.value),
          lastDate: formatLongDate(locale, summary.last.date),
          lastValue: number(summary.last.value),
          change: formatSigned(locale, summary.change ?? 0),
          min: number(summary.min),
          max: number(summary.max),
          unit: unitSpoken,
        });

  return (
    <View style={styles.content}>
      {rangeChips}
      {summary && scale ? (
        <>
          <View style={[styles.stats, { backgroundColor: surface }]} accessible accessibilityLabel={`${t('progress.series.latest')}: ${number(summary.last.value)} ${unitSpoken}`}>
            <View style={styles.stat}>
              <AppText variant="bodySm" tone="muted">
                {t('progress.series.latest')}
              </AppText>
              <AppText variant="numeralMd" style={styles.numeral}>
                {number(summary.last.value)} <AppText variant="bodyMd" tone="muted">{unit}</AppText>
              </AppText>
              <AppText variant="bodySm" tone="muted">
                {formatShortDate(locale, summary.last.date)}
              </AppText>
            </View>
            <View style={styles.stat}>
              <AppText variant="bodySm" tone="muted">
                {t('progress.series.change')}
              </AppText>
              <AppText variant="numeralMd" style={styles.numeral}>
                {summary.change === null ? '–' : formatSigned(locale, summary.change)} <AppText variant="bodyMd" tone="muted">{summary.change === null ? '' : unit}</AppText>
              </AppText>
              <AppText variant="bodySm" tone="muted">
                {summary.change === null ? t('progress.series.changeNone') : t(`progress.rangeSpoken.${range}`)}
              </AppText>
            </View>
          </View>

          <Button label={t('progress.series.log', { kind: kindLower })} icon="plus" onPress={onLog} testID="log-entry" />

          {summary.count === 1 ? (
            <FullBleed>
              <InsightLine text={t('progress.series.onePoint')} />
            </FullBleed>
          ) : null}

          <TrendChart
            points={shown}
            scale={scale}
            formatValue={number}
            formatDate={(date) => formatShortDate(locale, date)}
            unit={unit}
            summary={spokenSummary}
            rowLabel={(point) => t('progress.series.rowLabel', { date: formatLongDate(locale, point.date), value: number(point.value), unit: unitSpoken })}
            onSelectPoint={(id) => {
              const original = data.points.find((p) => p.id === id);
              if (original) onEdit(original);
            }}
            listTitle={t('progress.series.listTitle')}
            showAllLabel={t('progress.series.showAll', { count: shown.length })}
            showFewerLabel={t('progress.series.showFewer')}
            testID="series-chart"
          />
        </>
      ) : (
        <>
          <FullBleed>
            <InsightLine text={t('progress.series.emptyRange')} />
          </FullBleed>
          <Button label={t('progress.series.log', { kind: kindLower })} icon="plus" onPress={onLog} testID="log-entry" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.s4 },
  loading: { gap: spacing.s4 },
  content: { gap: spacing.s4 },
  stats: { flexDirection: 'row', borderRadius: radius.lg, padding: spacing.s4, gap: spacing.s4 },
  stat: { flex: 1, gap: 2 },
  numeral: { flexShrink: 1 },
});
