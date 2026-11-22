import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  proposeTargets,
  type GoalType,
  type NoProposal,
  type Pace,
  type ProfileInput,
  type TargetProposal,
} from '@/core/nutrition';
import { formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, ChoiceChips, InsightLine, OptionList, ScreenFooter, ScreenFrame, TextField, TopBar, layout, radius, spacing, useTheme } from '@/ui';
import { CalculationScreen } from './CalculationScreen';
import { goalConflictMessage } from './goalConflict';
import { hasNoProfileData } from './goalContext';
import { MinimumEnergyEditor } from './MinimumEnergyEditor';
import { emptyTargetValues, TARGET_FIELDS, targetValuesFrom, useTargetsForm, type TargetField, type TargetNumbers } from './targetsForm';

/** What the person chose, ready to store as a goal period. */
export interface GoalChoice {
  type: GoalType;
  pace: Pace | null;
  targets: TargetNumbers;
  /** True when the person typed the numbers or changed the proposal. */
  isCustom: boolean;
  basisWeightKg: number | null;
  /** Which constants produced the proposal this started from; null for numbers typed from scratch. */
  formulaVersion: string | null;
}

export interface GoalSetupProps {
  /** What the person told the app about themselves (every field may be empty). */
  profile: ProfileInput;
  /** Local date the age is computed at: today. */
  referenceDate: string;
  /** The person's own minimum daily energy; null means the default. */
  initialMinimum: number | null;
  initialGoal?: { type: GoalType; pace: Pace | null } | null;
  /** Small line above the first screen ("Step 4 of 4"). */
  eyebrow?: string;
  /** Back from the first screen; without it the first screen has no back button. */
  onExit?: () => void;
  onEditProfile?: () => void;
  /** Stores the choice; null means "no targets". Rejecting keeps the screen and shows a message. */
  onSave: (choice: GoalChoice | null) => Promise<void>;
  /** "Save and continue" in onboarding, "Save targets" in Settings. */
  saveLabel: string;
  /** Said above the save button ("Changing your goal starts a new period from today"). */
  note?: string;
}

type Step = 'goal' | 'result' | 'calculation';

const GOAL_TYPES: readonly GoalType[] = ['lose_fat', 'maintain', 'gain_muscle'];

/**
 * Flow A step 4 and Settings → Goal (S2, S3, FR-10 to FR-14): choose a goal and pace, then see the
 * targets `proposeTargets` returns, editable; or, when it returns no proposal, the specific reason
 * and the choice of typing targets or having none. A refused proposal never shows a number.
 */
export function GoalSetup(props: GoalSetupProps) {
  const { profile, referenceDate, initialGoal } = props;
  const [step, setStep] = useState<Step>('goal');
  const [type, setType] = useState<GoalType>(initialGoal?.type ?? 'maintain');
  const [pace, setPace] = useState<Pace>(initialGoal?.pace ?? 'gentle');
  const [minimum, setMinimum] = useState<number | null>(props.initialMinimum);

  const goal = useMemo(() => ({ type, pace: type === 'maintain' ? null : pace }), [type, pace]);
  const outcome = useMemo(
    () => proposeTargets(profile, goal, { referenceDate, minimumDailyKcal: minimum ?? undefined }),
    [profile, goal, referenceDate, minimum],
  );

  if (step === 'goal') {
    return (
      <GoalStep
        {...props}
        type={type}
        pace={pace}
        onType={setType}
        onPace={setPace}
        onContinue={() => setStep('result')}
      />
    );
  }
  if (step === 'calculation') {
    return <CalculationScreen onBack={() => setStep('result')} proposal={outcome.kind === 'proposal' ? outcome : null} />;
  }
  return (
    <ResultStep
      {...props}
      goal={goal}
      outcome={outcome}
      minimum={minimum}
      onMinimumSaved={setMinimum}
      onBack={() => setStep('goal')}
      onShowCalculation={() => setStep('calculation')}
    />
  );
}

interface GoalStepProps extends GoalSetupProps {
  type: GoalType;
  pace: Pace;
  onType: (type: GoalType) => void;
  onPace: (pace: Pace) => void;
  onContinue: () => void;
}

function GoalStep({ eyebrow, onExit, type, pace, onType, onPace, onContinue }: GoalStepProps) {
  const { t } = useTranslation();
  return (
    <ScreenFrame
      header={<TopBar eyebrow={eyebrow} onBack={onExit} backLabel={t('common.back')} />}
      footer={
        <ScreenFooter>
          <Button label={t('common.continue')} onPress={onContinue} />
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <AppText variant="titleLg" accessibilityRole="header">
          {t('onboarding.goal.title')}
        </AppText>
        <AppText tone="muted">{t('onboarding.goal.intro')}</AppText>
        <OptionList<GoalType>
          label={t('goal.type.label')}
          options={GOAL_TYPES.map((value) => ({ value, label: t(`goal.type.${value}`) }))}
          value={type}
          onChange={(value) => value && onType(value)}
        />
        {type !== 'maintain' ? (
          <View style={styles.pace}>
            <ChoiceChips<Pace>
              label={t('goal.pace.label')}
              title
              options={[
                { value: 'gentle', label: t('goal.pace.gentle') },
                { value: 'moderate', label: t('goal.pace.moderate') },
              ]}
              value={pace}
              onChange={(value) => value && onPace(value)}
            />
            <AppText variant="bodySm" tone="muted" style={styles.paceHint}>
              {t(`goal.pace.${pace}Hint`)}
            </AppText>
          </View>
        ) : null}
      </View>
    </ScreenFrame>
  );
}

interface ResultStepProps extends GoalSetupProps {
  goal: { type: GoalType; pace: Pace | null };
  outcome: TargetProposal | NoProposal;
  minimum: number | null;
  onMinimumSaved: (kcal: number | null) => void;
  onBack: () => void;
  onShowCalculation: () => void;
}

function ResultStep(props: ResultStepProps) {
  const { outcome, profile } = props;
  const [manual, setManual] = useState(false);

  if (outcome.kind === 'proposal' && !manual) {
    return (
      <TargetsStep
        key={`proposal-${outcome.kcal}-${outcome.proteinG}-${outcome.carbsG}-${outcome.fatG}`}
        {...props}
        mode="proposal"
        proposal={outcome}
      />
    );
  }
  // A skipped profile has nothing to suggest from: the person types targets directly (flow A).
  if (manual || (outcome.kind === 'no_proposal' && outcome.reason === 'missing_data' && hasNoProfileData(profile))) {
    return <TargetsStep key="manual" {...props} mode={manual ? 'manual' : 'skipped'} proposal={null} />;
  }
  return <RefusalStep {...props} refusal={outcome as NoProposal} onManual={() => setManual(true)} />;
}

interface TargetsStepProps extends ResultStepProps {
  mode: 'proposal' | 'manual' | 'skipped';
  proposal: TargetProposal | null;
}

function TargetsStep({ mode, proposal, goal, profile, eyebrow, onBack, onSave, saveLabel, note, onShowCalculation }: TargetsStepProps) {
  const { t, i18n } = useTranslation();
  const form = useTargetsForm(
    proposal ? targetValuesFrom({ kcal: proposal.kcal, protein: proposal.proteinG, carbs: proposal.carbsG, fat: proposal.fatG }) : emptyTargetValues(),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [invalid, setInvalid] = useState(false);

  const store = async (choice: GoalChoice | null) => {
    setBusy(true);
    setFailure(null);
    try {
      await onSave(choice);
    } catch (error) {
      setFailure(error ?? new Error('save failed'));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const targets = form.submit();
    setInvalid(targets === null);
    if (!targets) return;
    if (TARGET_FIELDS.every((field) => targets[field] === null)) {
      void store(null);
      return;
    }
    void store({
      type: goal.type,
      pace: goal.pace,
      targets,
      isCustom: proposal === null || form.edited,
      basisWeightKg: profile.weightKg ?? null,
      formulaVersion: proposal?.formulaVersion ?? null,
    });
  };

  const intro = mode === 'proposal' ? t('targets.proposalIntro') : mode === 'skipped' ? t('targets.skippedIntro') : t('targets.manualIntro');
  const labels: Record<TargetField, string> = { kcal: t('targets.kcal'), protein: t('targets.protein'), carbs: t('targets.carbs'), fat: t('targets.fat') };
  const locale = i18n.language as Locale;

  return (
    <ScreenFrame
      header={<TopBar eyebrow={eyebrow} onBack={onBack} backLabel={t('common.back')} />}
      footer={
        <ScreenFooter>
          {note ? <AppText variant="bodySm" tone="muted" style={styles.note}>{note}</AppText> : null}
          {invalid ? <AppText variant="bodySm" tone="warning" style={styles.note}>{t('targets.errors.fixErrors')}</AppText> : null}
          {failure !== null ? <AppText variant="bodySm" tone="warning" style={styles.note}>{goalConflictMessage(t, i18n.language as Locale, failure) ?? t('goal.saveError')}</AppText> : null}
          <Button label={saveLabel} onPress={save} disabled={busy} />
          {mode !== 'proposal' ? <Button label={t('targets.none')} variant="secondary" onPress={() => void store(null)} disabled={busy} /> : null}
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <AppText variant="titleLg" accessibilityRole="header">
          {t('targets.title')}
        </AppText>
        <AppText tone="muted">{intro}</AppText>
        {proposal ? (
          <Button label={t('targets.how')} variant="ghost" icon="info" block={false} onPress={onShowCalculation} />
        ) : null}
        <View style={styles.fields}>
          {TARGET_FIELDS.map((field) => (
            <TextField
              key={field}
              label={labels[field]}
              value={form.values[field]}
              onChangeText={(text) => form.set(field, text)}
              onBlur={() => form.blur(field)}
              error={form.errors[field] ? t(form.errors[field]!.key, formatParams(locale, form.errors[field]!.params) ?? {}) : null}
              keyboardType="number-pad"
              maxLength={5}
              suffix={field === 'kcal' ? 'kcal' : 'g'}
            />
          ))}
        </View>
        {proposal && form.edited ? <InsightLine text={t('targets.edited')} icon="pencil" /> : null}
      </View>
    </ScreenFrame>
  );
}

/** Numbers in messages follow the app language ("10,000"). */
function formatParams(locale: Locale, params?: Record<string, string | number>): Record<string, string | number> | undefined {
  if (!params) return undefined;
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, typeof value === 'number' ? formatNumber(locale, value) : value]));
}

interface RefusalStepProps extends ResultStepProps {
  refusal: NoProposal;
  onManual: () => void;
}

function RefusalStep({ refusal, eyebrow, onBack, onManual, onSave, onEditProfile, minimum, onMinimumSaved }: RefusalStepProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const locale = i18n.language as Locale;
  const [editingMinimum, setEditingMinimum] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const key = refusal.reason === 'special_condition' ? refusal.condition : refusal.reason;
  const body =
    refusal.reason === 'missing_data'
      ? t('targets.refusal.missing_data.body', { fields: refusal.missing.map((field) => t(`targets.missing.${field}`)).join(', ') })
      : refusal.reason === 'below_minimum'
        ? t('targets.refusal.below_minimum.body', { minimum: formatNumber(locale, refusal.minimumKcal) })
        : t(`targets.refusal.${key}.body`);

  const withoutTargets = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onSave(null);
    } catch (error) {
      setFailure(error ?? new Error('save failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenFrame
      header={<TopBar eyebrow={eyebrow} onBack={onBack} backLabel={t('common.back')} />}
      footer={
        <ScreenFooter>
          {failure !== null ? <AppText variant="bodySm" tone="warning" style={styles.note}>{goalConflictMessage(t, i18n.language as Locale, failure) ?? t('goal.saveError')}</AppText> : null}
          <Button label={t('targets.enterOwn')} onPress={onManual} disabled={busy} />
          <Button label={t('targets.none')} variant="secondary" onPress={() => void withoutTargets()} disabled={busy} />
        </ScreenFooter>
      }>
      <View style={styles.body} testID={`refusal-${key}`}>
        <AppText variant="titleLg" accessibilityRole="header">
          {t(`targets.refusal.${key}.title`)}
        </AppText>
        <AppText>{body}</AppText>
        {refusal.reason === 'below_minimum' ? (
          <>
            <Button label={t('targets.changeGoal')} variant="ghost" block={false} onPress={onBack} />
            <Button label={t('targets.adjustMinimum')} variant="ghost" block={false} onPress={() => setEditingMinimum((open) => !open)} />
            {editingMinimum ? (
              <View style={[styles.panel, { backgroundColor: colors.surface }]}>
                <MinimumEnergyEditor value={minimum} onSaved={onMinimumSaved} />
              </View>
            ) : null}
          </>
        ) : null}
        {refusal.reason === 'missing_data' && onEditProfile ? <Button label={t('targets.editProfile')} variant="ghost" block={false} onPress={onEditProfile} /> : null}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s2, paddingBottom: spacing.s6, gap: spacing.s4 },
  pace: { gap: spacing.s2 },
  paceHint: { paddingLeft: spacing.s2 },
  fields: { gap: spacing.s3 },
  note: { textAlign: 'center' },
  panel: { borderRadius: radius.lg, padding: spacing.s4 },
});
