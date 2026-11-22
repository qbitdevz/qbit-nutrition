import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { GoalConflictError, deriveMealTime, type Goal, type GoalInput } from '@/data';
import { formatLongDate, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, ConfirmSheet, EmptyState, ErrorState, ScreenFrame, Skeleton, TopBar, layout, radius, spacing, useSnackbar, useTheme } from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { goalConflictMessage } from './goalConflict';
import { loadGoalContext, type GoalContext } from './goalContext';
import { GoalSetup, type GoalChoice } from './GoalSetup';

/** A change that needs the person's yes: the stored goal starts after the phone's date, so replacing it deletes it. */
interface PendingReplace {
  input: GoalInput;
  stored: Goal;
}

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

  const [pending, setPending] = useState<PendingReplace | null>(null);

  /** Stores the goal. A conflict that can be resolved by replacing the stored goal asks first; any other refusal reaches the form, which explains it. */
  const commit = async (input: GoalInput, replaceGoalId?: string) => {
    const saved = await repos.goals.set(input, replaceGoalId ? { replaceGoalId } : undefined);
    notifyChange();
    snackbar.show({ message: saved.replaced ? t('goal.savedReplaced', { date: formatLongDate(locale, saved.replaced.startDate) }) : t('goal.saved') });
    setEditing(false);
    load();
  };

  const save = async (choice: GoalChoice | null) => {
    if (state.status !== 'ready') return;
    const current = state.context.goal;
    const type = choice?.type ?? current?.type ?? 'maintain';
    const input: GoalInput = choice
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
      : { type, startDate: today };
    try {
      await commit(input);
    } catch (error) {
      if (error instanceof GoalConflictError && error.canReplace && error.openGoal) {
        setPending({ input, stored: error.openGoal });
        return;
      }
      throw error;
    }
  };

  const confirmReplace = async () => {
    if (!pending) return;
    const { input, stored } = pending;
    setPending(null);
    try {
      await commit(input, stored.id);
    } catch (error) {
      snackbar.show({ message: goalConflictMessage(t, locale, error) ?? t('goal.saveError') });
    }
  };

  const n = (value: number | null) => (value === null ? '–' : formatNumber(locale, value));
  const replaceSheet = pending ? (
    <ConfirmSheet
      visible
      title={t('goal.replace.title')}
      body={t('goal.replace.body', { open: formatLongDate(locale, pending.stored.startDate), today: formatLongDate(locale, pending.input.startDate) })}
      note={t('goal.replace.values', {
        type: t(`goal.type.${pending.stored.type}`),
        open: formatLongDate(locale, pending.stored.startDate),
        kcal: n(pending.stored.kcalTarget),
        protein: n(pending.stored.proteinGTarget),
        carbs: n(pending.stored.carbsGTarget),
        fat: n(pending.stored.fatGTarget),
      })}
      confirmLabel={t('goal.replace.confirm')}
      cancelLabel={t('goal.replace.cancel')}
      closeLabel={t('common.close')}
      onConfirm={() => void confirmReplace()}
      onCancel={() => setPending(null)}
    />
  ) : null;

  if (state.status === 'ready' && editing) {
    const { context } = state;
    return (
      <>
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
        {replaceSheet}
      </>
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
      {replaceSheet}
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
