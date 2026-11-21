import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { deriveMealTime, type Profile } from '@/data';
import { AppText, Button, ErrorState, ScreenFooter, ScreenFrame, Skeleton, TopBar, layout, spacing, useSnackbar } from '@/ui';
import { useSession } from '../session/AppSession';
import { ProfileFields } from '../profile/ProfileFields';
import { useProfileForm, valuesFromStored, type ProfileFormValues, type ProfileResult } from '../profile/profileForm';
import { useServices } from '../startup/AppProvider';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; profile: Profile; values: ProfileFormValues };

interface ProfileSettingsScreenProps {
  now?: () => Date;
  onBack?: () => void;
}

const systemNow = () => new Date();

/** Settings → Profile and units (FR-03, FR-04): edit the profile in metric or imperial units; storage stays metric. */
export function ProfileSettingsScreen({ now = systemNow, onBack }: ProfileSettingsScreenProps) {
  const { t } = useTranslation();
  const { repos } = useServices();
  const [state, setState] = useState<State>({ status: 'loading' });

  const read = useCallback(() => {
    Promise.all([repos.profile.get(), repos.measurements.latest('weight')]).then(
      ([profile, weight]) => {
        if (!profile) return setState({ status: 'error' });
        setState({ status: 'ready', profile, values: valuesFromStored(profile, weight?.value ?? null) });
      },
      () => setState({ status: 'error' }),
    );
  }, [repos]);
  useEffect(read, [read]);
  const load = () => {
    setState({ status: 'loading' });
    read();
  };

  return state.status === 'ready' ? (
    <ProfileEditor profile={state.profile} initial={state.values} now={now} onBack={onBack} />
  ) : (
    <ScreenFrame header={<TopBar title={t('settings.profile')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        {state.status === 'loading' ? <Skeleton height={320} radius={24} /> : null}
        {state.status === 'error' ? (
          <ErrorState title={t('settings.profile')} message={t('profile.loadError')}>
            <Button label={t('common.retry')} icon="retake" onPress={load} />
          </ErrorState>
        ) : null}
      </View>
    </ScreenFrame>
  );
}

function ProfileEditor({ profile, initial, now, onBack }: { profile: Profile; initial: ProfileFormValues; now: () => Date; onBack?: () => void }) {
  const { t } = useTranslation();
  const { repos } = useServices();
  const snackbar = useSnackbar();
  const { notifyChange } = useSession();
  const today = deriveMealTime(now()).localDate;
  const form = useProfileForm(initial, today);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'fix' | 'save' | null>(null);

  const store = async (result: ProfileResult) => {
    await repos.profile.save({
      sex: result.sex,
      birthDate: result.birthDate,
      heightCm: result.heightCm,
      activityLevel: result.activityLevel,
      specialCondition: result.specialCondition,
      unitSystem: result.unitSystem,
      // The language and the accepted notice are not part of this form: they are kept as they are.
      locale: profile.locale,
      disclaimerAcceptedAt: profile.disclaimerAcceptedAt,
      disclaimerVersion: profile.disclaimerVersion,
    });
    if (result.weightKg !== null) {
      const latest = await repos.measurements.latest('weight');
      if (!latest || latest.value !== result.weightKg) {
        await repos.measurements.record({ measuredOn: today, kind: 'weight', value: result.weightKg });
      }
    }
  };

  const save = async () => {
    const result = form.submit();
    if (!result) {
      setProblem('fix');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await store(result);
      notifyChange();
      snackbar.show({ message: t('profile.saved') });
    } catch {
      setProblem('save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenFrame
      header={<TopBar title={t('settings.profile')} onBack={onBack} backLabel={t('common.back')} />}
      footer={
        <ScreenFooter>
          {problem ? (
            <AppText variant="bodySm" tone="warning" style={styles.problem}>
              {problem === 'fix' ? t('profile.fixErrors') : t('profile.saveError')}
            </AppText>
          ) : null}
          <Button label={t('profile.save')} onPress={() => void save()} disabled={busy} />
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <ProfileFields form={form} />
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s2, paddingBottom: spacing.s6 },
  problem: { textAlign: 'center' },
});
