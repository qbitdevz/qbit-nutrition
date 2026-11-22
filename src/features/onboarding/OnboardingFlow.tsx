import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';

import { deriveMealTime } from '@/data';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/locale';
import { AppText, Button, ChoiceChips, ScreenFooter, ScreenFrame, TopBar, Wordmark, layout, spacing } from '@/ui';
import { GoalSetup, type GoalChoice } from '../goals/GoalSetup';
import { readMinimumKcal } from '../goals/minimum';
import { Disclaimer } from '../legal/Disclaimer';
import { DISCLAIMER_VERSION } from '../legal/version';
import { ProfileFields } from '../profile/ProfileFields';
import { emptyProfileValues, useProfileForm, type ProfileForm, type ProfileResult } from '../profile/profileForm';
import { ONBOARDED_KEY } from '../session/AppSession';
import { saveLocale } from '../settings/language';
import { useServices } from '../startup/AppProvider';

type Step = 'language' | 'disclaimer' | 'declined' | 'profile' | 'goal';

const TOTAL_STEPS = 4;
const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' };

interface OnboardingFlowProps {
  /** Called once everything is stored and the flag that onboarding was completed is written. */
  onDone: () => void;
  now?: () => Date;
}

const systemNow = () => new Date();

/**
 * Flow A (docs/04 section 3), shown until completed: language, the health notice (required), the
 * optional profile, then the goal and targets. The AI provider step of flow A belongs to phase 2 and
 * is not shown. Nothing about the person is stored before the end, except the language: leaving
 * half-way starts again from the first step, and the final writes can be repeated safely.
 */
export function OnboardingFlow({ onDone, now = systemNow }: OnboardingFlowProps) {
  const { t, i18n } = useTranslation();
  const { repos } = useServices();
  const [step, setStep] = useState<Step>('language');
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  // null: the profile was skipped (or not given yet).
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [skipped, setSkipped] = useState(false);

  const today = deriveMealTime(now()).localDate;
  // Lives here, not in the step, so going back from the goal keeps what was typed.
  const form = useProfileForm(emptyProfileValues('metric'), today);
  const eyebrow = (current: number) => t('onboarding.stepOf', { current, total: TOTAL_STEPS });

  const finish = async (choice: GoalChoice | null) => {
    const at = acceptedAt ?? now().toISOString();
    await repos.profile.save({
      sex: profile?.sex ?? null,
      birthDate: profile?.birthDate ?? null,
      heightCm: profile?.heightCm ?? null,
      activityLevel: profile?.activityLevel ?? null,
      specialCondition: profile?.specialCondition ?? null,
      unitSystem: profile?.unitSystem ?? 'metric',
      locale: i18n.language as Locale,
      disclaimerAcceptedAt: at,
      disclaimerVersion: DISCLAIMER_VERSION,
    });
    // The weight entered here is also the first body measurement (it feeds the Progress weight chart).
    if (profile?.weightKg != null) {
      await repos.measurements.record({ measuredOn: today, kind: 'weight', value: profile.weightKg });
    }
    if (choice) {
      await repos.goals.set({
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
      });
    }
    // Written last: if anything above failed, onboarding is shown again and the writes are repeated.
    await repos.settings.set(ONBOARDED_KEY, now().toISOString());
    onDone();
  };

  if (step === 'language') {
    return <LanguageStep eyebrow={eyebrow(1)} onContinue={() => setStep('disclaimer')} />;
  }
  if (step === 'disclaimer') {
    return (
      <DisclaimerStep
        eyebrow={eyebrow(2)}
        onBack={() => setStep('language')}
        onAccept={() => {
          setAcceptedAt(now().toISOString());
          setStep('profile');
        }}
        onDecline={() => setStep('declined')}
      />
    );
  }
  if (step === 'declined') {
    return <DeclinedStep onReadAgain={() => setStep('disclaimer')} />;
  }
  if (step === 'profile') {
    return (
      <ProfileStep
        eyebrow={eyebrow(3)}
        form={form}
        onBack={() => setStep('disclaimer')}
        onContinue={(result) => {
          setProfile(result);
          setSkipped(false);
          setStep('goal');
        }}
        onSkip={() => {
          setProfile(null);
          setSkipped(true);
          setStep('goal');
        }}
      />
    );
  }
  return (
    <GoalStepContainer
      eyebrow={eyebrow(4)}
      profile={profile}
      skipped={skipped}
      today={today}
      onBack={() => setStep('profile')}
      onSave={finish}
    />
  );
}

function LanguageStep({ eyebrow, onContinue }: { eyebrow: string; onContinue: () => void }) {
  const { t, i18n } = useTranslation();
  const { repos } = useServices();
  const [failed, setFailed] = useState(false);
  const locale = i18n.language as Locale;

  const choose = async (next: Locale) => {
    setFailed(false);
    try {
      await saveLocale(repos, i18n, next);
    } catch {
      setFailed(true);
    }
  };

  return (
    <ScreenFrame
      footer={
        <ScreenFooter>
          <Button label={t('common.continue')} onPress={onContinue} />
        </ScreenFooter>
      }
      header={<TopBar eyebrow={eyebrow} />}>
      <View style={styles.body}>
        <Wordmark name={t('app.name')} label={t('app.wordmarkLabel')} />
        <AppText variant="titleLg" accessibilityRole="header">
          {t('onboarding.language.title')}
        </AppText>
        <AppText tone="muted">{t('onboarding.language.body')}</AppText>
        <ChoiceChips<Locale>
          label={t('onboarding.language.group')}
          options={SUPPORTED_LOCALES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
          value={locale}
          onChange={(value) => value && void choose(value)}
        />
        {failed ? (
          <AppText variant="bodySm" tone="warning">
            {t('settings.languageNotSaved')}
          </AppText>
        ) : null}
      </View>
    </ScreenFrame>
  );
}

function DisclaimerStep({ eyebrow, onBack, onAccept, onDecline }: { eyebrow: string; onBack: () => void; onAccept: () => void; onDecline: () => void }) {
  const { t } = useTranslation();
  return (
    <ScreenFrame
      header={<TopBar eyebrow={eyebrow} onBack={onBack} backLabel={t('common.back')} />}
      footer={
        <ScreenFooter>
          <Button label={t('onboarding.disclaimer.accept')} onPress={onAccept} />
          <Button label={t('onboarding.disclaimer.decline')} variant="secondary" onPress={onDecline} />
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <Disclaimer />
      </View>
    </ScreenFrame>
  );
}

/** Declining does not let the person in: nothing was saved, and the only ways on are reading the notice again or closing the app. */
function DeclinedStep({ onReadAgain }: { onReadAgain: () => void }) {
  const { t } = useTranslation();
  return (
    <ScreenFrame
      ambient="warm"
      footer={
        <ScreenFooter>
          <Button label={t('onboarding.disclaimer.readAgain')} onPress={onReadAgain} />
          {Platform.OS === 'android' ? <Button label={t('onboarding.disclaimer.close')} variant="secondary" onPress={() => BackHandler.exitApp()} /> : null}
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <AppText variant="titleLg" accessibilityRole="header">
          {t('onboarding.disclaimer.declinedTitle')}
        </AppText>
        <AppText>{t('onboarding.disclaimer.declinedBody')}</AppText>
      </View>
    </ScreenFrame>
  );
}

interface ProfileStepProps {
  eyebrow: string;
  form: ProfileForm;
  onBack: () => void;
  onContinue: (result: ProfileResult) => void;
  onSkip: () => void;
}

function ProfileStep({ eyebrow, form, onBack, onContinue, onSkip }: ProfileStepProps) {
  const { t } = useTranslation();
  const [invalid, setInvalid] = useState(false);

  return (
    <ScreenFrame
      header={<TopBar eyebrow={eyebrow} onBack={onBack} backLabel={t('common.back')} />}
      footer={
        <ScreenFooter>
          {invalid ? (
            <AppText variant="bodySm" tone="warning" style={styles.center}>
              {t('profile.fixErrors')}
            </AppText>
          ) : null}
          {/* "Skip" is as visible as "Continue" (docs/04 flow A): same size, always on screen. */}
          <Button
            label={t('common.continue')}
            onPress={() => {
              const result = form.submit();
              setInvalid(result === null);
              if (result) onContinue(result);
            }}
          />
          <Button label={t('common.skip')} variant="secondary" onPress={onSkip} />
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <AppText variant="titleLg" accessibilityRole="header">
          {t('onboarding.profile.title')}
        </AppText>
        <AppText tone="muted">{t('onboarding.profile.intro')}</AppText>
        <ProfileFields form={form} />
      </View>
    </ScreenFrame>
  );
}

interface GoalStepContainerProps {
  eyebrow: string;
  profile: ProfileResult | null;
  skipped: boolean;
  today: string;
  onBack: () => void;
  onSave: (choice: GoalChoice | null) => Promise<void>;
}

function GoalStepContainer({ eyebrow, profile, skipped, today, onBack, onSave }: GoalStepContainerProps) {
  const { t } = useTranslation();
  const { repos } = useServices();
  const [minimum, setMinimum] = useState<number | null | undefined>(undefined);

  // The person's own minimum, if they set one before (it survives a restart of onboarding).
  useEffect(() => {
    let active = true;
    readMinimumKcal(repos.settings).then(
      (value) => active && setMinimum(value),
      () => active && setMinimum(null),
    );
    return () => {
      active = false;
    };
  }, [repos]);
  if (minimum === undefined) return null;

  return (
    <GoalSetup
      profile={{
        sex: profile?.sex ?? null,
        birthDate: profile?.birthDate ?? null,
        heightCm: profile?.heightCm ?? null,
        weightKg: skipped ? null : (profile?.weightKg ?? null),
        activityLevel: profile?.activityLevel ?? null,
        specialCondition: profile?.specialCondition ?? null,
      }}
      referenceDate={today}
      initialMinimum={minimum}
      eyebrow={eyebrow}
      onExit={onBack}
      onEditProfile={onBack}
      onSave={onSave}
      saveLabel={t('targets.saveContinue')}
    />
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s2, paddingBottom: spacing.s6, gap: spacing.s4 },
  center: { textAlign: 'center' },
});
