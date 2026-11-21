import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { deriveMealTime, type Goal } from '@/data';
import { formatLongDate, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, EmptyState, ErrorState, ScreenFrame, Skeleton, TopBar, layout, radius, spacing, useSnackbar, useTheme } from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { loadGoalContext, type GoalContext } from './goalContext';
import { GoalSetup, type GoalChoice } from './GoalSetup';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; context: GoalContext };

interface GoalSettingsScreenProps {
  now?: () => Date;
  onBack?: () => void;
  /** Opens the profile settings (when targets need more details). */
  onEditProfile?: () => void;
}

const systemNow = () => new Date();

/**
 * Settings → Goal and targets (FR-13): the current goal, and a way to change it. A change starts a
 * new goal period from today; earlier days keep the targets they had (`GoalRepository.set`).
 */
export function GoalSettingsScreen({ now = systemNow, onBack, onEditProfile }: GoalSettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const { repos } = useServices();
  const snackbar = useSnackbar();
  const { notifyChange } = useSession();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [editing, setEditing] = useState(false);

  // The first read starts from the loading state; setting it here would only repeat it.
  const read = useCallback(() => {
    loadGoalContext(repos).then(
      (context) => setState({ status: 'ready', context }),
      () => setState({ status: 'error' }),
    );
  }, [repos]);
  useEffect(read, [read]);
  const load = () => {
    setState({ status: 'loading' });
    read();
  };

  const today = deriveMealTime(now()).localDate;

  const save = async (choice: GoalChoice | null) => {
    if (state.status !== 'ready') return;
    const current = state.context.goal;
    const type = choice?.type ?? current?.type ?? 'maintain';
    await repos.goals.set(
      choice
        ? {
            type: choice.type,
            pace: choice.pace,
            startDate: today,
            kcalTarget: choice.targets.kcal,
            proteinGTarget: choice.targets.protein,
            carbsGTarget: choice.targets.carbs,
            fatGTarget: choice.targets.fat,
            isCustom: choice.isCustom,
            basisWeightKg: choice.basisWeightKg,
            formulaVersion: choice.formulaVersion,
          }
        : { type, startDate: today },
    );
    notifyChange();
    snackbar.show({ message: t('goal.saved') });
    setEditing(false);
    load();
  };

  if (state.status === 'ready' && editing) {
    const { context } = state;
    return (
      <GoalSetup
        profile={context.input}
        referenceDate={today}
        initialMinimum={context.minimumKcal}
        initialGoal={context.goal ? { type: context.goal.type, pace: context.goal.pace } : null}
        onExit={() => setEditing(false)}
        onEditProfile={onEditProfile}
        onSave={save}
        saveLabel={t('targets.save')}
        note={t('goal.periodNote')}
      />
    );
  }

  const goal = state.status === 'ready' ? state.context.goal : null;
  const hasTargets = goal !== null && goal.kcalTarget !== null;
  return (
    <ScreenFrame header={<TopBar title={t('settings.goal')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        {state.status === 'loading' ? <Skeleton height={160} radius={24} /> : null}
        {state.status === 'error' ? (
          <ErrorState title={t('settings.goal')} message={t('goal.loadError')}>
            <Button label={t('common.retry')} icon="retake" onPress={load} />
          </ErrorState>
        ) : null}
        {state.status === 'ready' ? (
          <>
            {hasTargets && goal ? (
              <GoalSummary goal={goal} locale={locale} />
            ) : (
              <EmptyState icon="info" title={t('goal.noneTitle')} body={t('goal.none')} />
            )}
            <Button label={hasTargets ? t('goal.change') : t('goal.setup')} onPress={() => setEditing(true)} />
            <AppText variant="bodySm" tone="muted" style={[styles.note, { color: colors.textMuted }]}>
              {t('goal.periodNote')}
            </AppText>
          </>
        ) : null}
      </View>
    </ScreenFrame>
  );
}

function GoalSummary({ goal, locale }: { goal: Goal; locale: Locale }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const n = (value: number | null) => (value === null ? '–' : formatNumber(locale, value));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]} accessible accessibilityLabel={t('goal.current')} testID="goal-summary">
      <AppText variant="caption" tone="muted">
        {t('goal.current')}
      </AppText>
      <AppText variant="titleSm">
        {t(`goal.type.${goal.type}`)}
        {goal.pace ? ` · ${t(`goal.pace.${goal.pace}`)}` : ''}
      </AppText>
      <AppText variant="numeralMd">
        {n(goal.kcalTarget)} <AppText variant="bodyMd" tone="muted">kcal</AppText>
      </AppText>
      <AppText variant="bodyMd" tone="muted">
        {t('targets.protein')}: {n(goal.proteinGTarget)} · {t('targets.carbs')}: {n(goal.carbsGTarget)} · {t('targets.fat')}: {n(goal.fatGTarget)}
      </AppText>
      <AppText variant="bodySm" tone="muted">{goal.isCustom ? t('goal.custom') : t('goal.suggested')}</AppText>
      <AppText variant="bodySm" tone="muted">{t('goal.since', { date: formatLongDate(locale, goal.startDate) })}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s1 },
  note: { textAlign: 'center' },
});
