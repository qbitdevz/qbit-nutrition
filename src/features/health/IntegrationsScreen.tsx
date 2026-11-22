import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { formatInstantDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import type { HealthAvailability, HealthGrant } from '@/platform/healthPlatform';
import { AppText, Button, ScreenFooter, ScreenFrame, Skeleton, TopBar, Icon, layout, radius, spacing, useTheme } from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import type { GrantState, HealthStatus } from './healthSync';

interface IntegrationsScreenProps {
  onBack?: () => void;
  /** Opens the privacy policy (the rationale links to it). */
  onOpenPrivacy?: () => void;
}

type Busy = 'turnOn' | 'retry' | 'send' | 'grant' | null;
type Notice = { kind: 'declined' } | { kind: 'unavailable'; availability: HealthAvailability } | { kind: 'sent'; count: number } | null;

const UNKNOWN: HealthStatus = { enabled: false, availability: null, grants: null, pending: 0, failing: false, lastWeightSyncAt: null, weightsIgnored: 0 };
const GRANTS: readonly HealthGrant[] = ['writeNutrition', 'readWeight'];

/**
 * Settings → Integrations (S7, S9): Health Connect is off until the person turns it on, and turning it on first shows a rationale
 * that lists each data type and why it is used (docs/12 section 4). Meals go out as nutrition records, weights come in; the two
 * permissions are separate and either can be missing while the other works. Everything the person needs to know about the state
 * (not allowed, taken away, records waiting) is written out, never only coloured.
 */
export function IntegrationsScreen({ onBack, onOpenPrivacy }: IntegrationsScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const { health } = useServices();
  const { notifyChange } = useSession();
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [rationale, setRationale] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await health.status());
    } catch {
      setStatus(UNKNOWN);
    }
  }, [health]);

  useEffect(() => {
    let active = true;
    health.status().then(
      (value) => active && setStatus(value),
      () => active && setStatus(UNKNOWN),
    );
    return () => {
      active = false;
    };
  }, [health]);

  const turnOn = async () => {
    setBusy('turnOn');
    setNotice(null);
    try {
      const result = await health.turnOn();
      setStatus(result.status);
      notifyChange();
      if (result.outcome === 'declined') setNotice({ kind: 'declined' });
      if (result.outcome === 'unavailable') setNotice({ kind: 'unavailable', availability: result.status.availability ?? 'unavailable' });
    } catch {
      setNotice({ kind: 'declined' });
    } finally {
      setBusy(null);
      setRationale(false);
    }
  };

  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(kind);
    setNotice(null);
    try {
      await work();
    } catch {
      // The status below shows what is still pending.
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  const header = <TopBar title={t('health.title')} onBack={rationale ? () => setRationale(false) : onBack} backLabel={t('common.back')} />;

  if (status === null) {
    return (
      <ScreenFrame header={header}>
        <View style={styles.body} accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}>
          <Skeleton height={120} radius={radius.lg} />
          <Skeleton height={120} radius={radius.lg} />
        </View>
      </ScreenFrame>
    );
  }

  if (rationale) {
    return (
      <ScreenFrame
        header={header}
        footer={
          <ScreenFooter>
            <Button label={t('health.rationale.continue')} onPress={() => void turnOn()} disabled={busy === 'turnOn'} testID="rationale-continue" />
            <Button label={t('health.rationale.notNow')} variant="secondary" onPress={() => setRationale(false)} />
          </ScreenFooter>
        }>
        <View style={styles.body} testID="health-rationale">
          <AppText variant="titleLg" accessibilityRole="header">
            {t('health.rationale.title')}
          </AppText>
          <AppText tone="muted">{t('health.rationale.intro')}</AppText>
          <DataTypeCard direction={t('health.rationale.writes')} title={t('health.rationale.nutrition.title')} body={t('health.rationale.nutrition.body')} />
          <DataTypeCard direction={t('health.rationale.reads')} title={t('health.rationale.weight.title')} body={t('health.rationale.weight.body')} />
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <AppText variant="heading" accessibilityRole="header">
              {t('health.rationale.yourControl')}
            </AppText>
            <AppText>{t('health.rationale.separate')}</AppText>
            <AppText>{t('health.rationale.local')}</AppText>
            <AppText>{t('health.rationale.revoke')}</AppText>
          </View>
          {onOpenPrivacy ? <Button label={t('health.rationale.privacy')} variant="ghost" onPress={onOpenPrivacy} /> : null}
          {busy === 'turnOn' ? <BusyLine label={t('health.working')} /> : null}
        </View>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame header={header}>
      <View style={styles.body}>
        <AppText tone="muted">{t('health.intro')}</AppText>

        {notice ? <NoticeCard notice={notice} onInstall={() => health.openInstall()} /> : null}

        {!status.enabled ? (
          <View style={[styles.card, { backgroundColor: colors.surface }]} testID="health-off">
            <AppText variant="heading" accessibilityRole="header">
              {t('health.connect')}
            </AppText>
            <AppText>{t('health.status.off')}</AppText>
            <Button label={t('health.turnOn')} icon="plus" onPress={() => setRationale(true)} testID="health-turn-on" />
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface }]} testID="health-on">
              <AppText variant="heading" accessibilityRole="header">
                {t('health.connect')}
              </AppText>
              <AppText>{t('health.status.on')}</AppText>
              {status.availability && status.availability !== 'available' ? (
                <NoticeCard notice={{ kind: 'unavailable', availability: status.availability }} onInstall={() => health.openInstall()} />
              ) : null}
              {status.grants
                ? GRANTS.map((grant) => (
                    <GrantRow
                      key={grant}
                      grant={grant}
                      state={status.grants![grant]}
                      busy={busy === 'grant'}
                      onAllow={() => void run('grant', async () => void (await health.requestGrant(grant)))}
                    />
                  ))
                : null}
            </View>

            {status.grants?.writeNutrition !== undefined ? (
              <View style={[styles.card, { backgroundColor: colors.surface }]} testID="health-queue">
                <AppText variant="heading" accessibilityRole="header">
                  {t('health.sync.title')}
                </AppText>
                <AppText testID="health-pending">{status.pending > 0 ? t('health.sync.pending', { count: status.pending }) : t('health.sync.none')}</AppText>
                {status.failing ? (
                  <View style={styles.note}>
                    <Icon name="alert" color={colors.warning} />
                    <AppText style={styles.noteText}>{t('health.sync.failing')}</AppText>
                  </View>
                ) : null}
                {status.weightsIgnored > 0 ? (
                  <View style={styles.note}>
                    <Icon name="alert" color={colors.warning} />
                    <AppText style={styles.noteText}>{t('health.sync.weightsIgnored', { count: status.weightsIgnored })}</AppText>
                  </View>
                ) : null}
                <AppText variant="bodySm" tone="muted">
                  {status.lastWeightSyncAt ? t('health.sync.weightAt', { date: formatInstantDate(locale, new Date(status.lastWeightSyncAt)) }) : t('health.sync.weightNever')}
                </AppText>
                <Button label={t('health.sync.retry')} variant="secondary" icon="retake" disabled={busy !== null} onPress={() => void run('retry', async () => void (await health.retry()))} testID="health-retry" />
                {busy === 'retry' ? <BusyLine label={t('health.working')} /> : null}
              </View>
            ) : null}

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <AppText variant="heading" accessibilityRole="header">
                {t('health.existing.title')}
              </AppText>
              <AppText tone="muted">{t('health.existing.body')}</AppText>
              <Button
                label={t('health.existing.button')}
                variant="secondary"
                disabled={busy !== null || status.grants?.writeNutrition !== 'granted'}
                onPress={() =>
                  void run('send', async () => {
                    setNotice({ kind: 'sent', count: await health.sendExistingMeals() });
                  })
                }
                testID="health-send-existing"
              />
              {status.grants && status.grants.writeNutrition !== 'granted' ? (
                <AppText variant="bodySm" tone="muted">
                  {t('health.existing.needsGrant')}
                </AppText>
              ) : null}
            </View>

            <Button label={t('health.manage')} variant="secondary" onPress={() => health.openSettings()} />
            <Button
              label={t('health.turnOff')}
              variant="ghost"
              onPress={() =>
                void run('retry', async () => {
                  await health.turnOff();
                  notifyChange();
                })
              }
              testID="health-turn-off"
            />
          </>
        )}
      </View>
    </ScreenFrame>
  );
}

function DataTypeCard({ direction, title, body }: { direction: string; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <AppText variant="bodySm" tone="primary">
        {direction}
      </AppText>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      <AppText>{body}</AppText>
    </View>
  );
}

function GrantRow({ grant, state, busy, onAllow }: { grant: HealthGrant; state: GrantState; busy: boolean; onAllow: () => void }) {
  const { t } = useTranslation();
  const name = t(`health.grant.${grant}`);
  return (
    <View style={styles.grant} testID={`grant-${grant}`}>
      <View style={styles.grantText}>
        <AppText variant="itemName">{name}</AppText>
        <AppText variant="bodySm" tone={state === 'granted' ? 'muted' : 'warning'}>
          {t(`health.grantState.${state}`)}
        </AppText>
      </View>
      {state !== 'granted' ? <Button label={t('health.allow')} accessibilityLabel={t('health.allowNamed', { name })} variant="secondary" block={false} disabled={busy} onPress={onAllow} /> : null}
    </View>
  );
}

function NoticeCard({ notice, onInstall }: { notice: NonNullable<Notice>; onInstall: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kind = notice.kind;
  const message =
    kind === 'declined'
      ? t('health.notice.declined')
      : kind === 'sent'
        ? t('health.notice.sent', { count: notice.count })
        : t(`health.notice.${notice.availability}`);
  const canInstall = kind === 'unavailable' && (notice.availability === 'not_installed' || notice.availability === 'needs_update');
  return (
    <View style={[styles.card, { backgroundColor: kind === 'sent' ? colors.primarySoft : colors.warningSoft }]} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="health-notice">
      <View style={styles.note}>
        <Icon name={kind === 'sent' ? 'check' : 'alert'} color={kind === 'sent' ? colors.primaryText : colors.warning} />
        <AppText style={styles.noteText}>{message}</AppText>
      </View>
      {canInstall ? <Button label={notice.availability === 'needs_update' ? t('health.update') : t('health.install')} variant="secondary" onPress={onInstall} /> : null}
    </View>
  );
}

function BusyLine({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite" style={[styles.note, styles.busy, { backgroundColor: colors.primarySoft }]}>
      <Icon name="clock" color={colors.primaryText} />
      <AppText style={styles.noteText}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s3 },
  note: { flexDirection: 'row', gap: spacing.s3, alignItems: 'flex-start' },
  noteText: { flex: 1 },
  busy: { padding: spacing.s3, borderRadius: radius.md },
  grant: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, flexWrap: 'wrap', minHeight: layout.touchTarget },
  grantText: { flex: 1, minWidth: 160 },
});
