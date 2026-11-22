import { destinationOf, hostOf } from '../settings/destination';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { CancelledError, NothingToSuggestError, type FoodSuggestion, type SuggestOutput } from '@/core/ai';
import type { AiProvider } from '@/data';
import { formatDecimal, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, BottomSheet, Button, Icon, Skeleton, radius, spacing, useTheme } from '@/ui';
import { classifyFailure, type ScanFailure } from '../scan/failures';
import { ScanSetupError } from '../scan/scanGateway';
import { waitParts } from '../scan/waitTime';
import { useServices } from '../startup/AppProvider';
import type { TodayData } from '../today/loadToday';
import { suggestAvailability, type SuggestAvailability } from './suggestInput';

type Day = Pick<TodayData, 'isToday' | 'totals' | 'targets' | 'goalType'>;

interface SuggestSheetProps {
  visible: boolean;
  /** The day as loaded when the sheet opens: the only thing the request is built from (and only the remaining numbers of it). */
  day: Day;
  onClose: () => void;
  /** Leads to the AI provider settings (no provider, or a failure the settings can fix). */
  onProviderSettings: () => void;
  onSetupTargets?: () => void;
  /** The person wants a suggestion in a meal: the route opens the search with its name and grams. */
  onAdd: (suggestion: FoodSuggestion) => void;
}

const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' };

type ReadyRequest = Extract<SuggestAvailability, { kind: 'ready' }>;
type Blocked = 'no_provider' | 'no_targets' | 'nothing_left';

type SheetView =
  | { kind: 'checking' }
  | { kind: 'notice'; provider: AiProvider; request: ReadyRequest }
  | { kind: 'loading'; provider: AiProvider }
  | { kind: 'result'; output: SuggestOutput }
  | { kind: 'failed'; failure: ScanFailure }
  | { kind: 'blocked'; reason: Blocked };

/**
 * Food ideas for what is left today (S6, FR-51), in a sheet over Today. It asks the AI provider only when opened (never on
 * its own), explains once per provider what is sent (S9), shows loading with Cancel, and lists the ideas as estimates. Every
 * failure of the provider taxonomy has its own message; no provider, no targets, or nothing left never call the provider.
 * Nothing about suggestions is stored except the acknowledgement of the notice.
 */
export function SuggestSheet({ visible, day, onClose, onProviderSettings, onSetupTargets, onAdd }: SuggestSheetProps) {
  const { t } = useTranslation();
  // Each opening starts afresh; the previous body stays mounted while the sheet leaves.
  const [session, setSession] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSession((n) => n + 1);
  }
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('suggest.title')} closeLabel={t('suggest.close')}>
      {session > 0 ? (
        <SuggestBody key={session} active={visible} day={day} onClose={onClose} onProviderSettings={onProviderSettings} onSetupTargets={onSetupTargets} onAdd={onAdd} />
      ) : null}
    </BottomSheet>
  );
}

function SuggestBody({ active, day, onClose, onProviderSettings, onSetupTargets, onAdd }: Omit<SuggestSheetProps, 'visible'> & { active: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { scan } = useServices();
  const { colors } = useTheme();
  const [view, setView] = useState<SheetView>({ kind: 'checking' });
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const dayRef = useRef(day);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  // Closing the sheet cancels a request in flight.
  useEffect(() => {
    if (!active) controller.current?.abort();
  }, [active]);

  const run = useCallback(
    async (request: ReadyRequest, provider: AiProvider) => {
      const abort = new AbortController();
      controller.current = abort;
      setView({ kind: 'loading', provider });
      try {
        const output = await scan.suggest({ remaining: request.remaining, goal: request.goal, locale, signal: abort.signal });
        if (alive.current && !abort.signal.aborted) setView({ kind: 'result', output });
      } catch (error) {
        if (!alive.current || abort.signal.aborted || error instanceof CancelledError) return;
        if (error instanceof NothingToSuggestError) return setView({ kind: 'blocked', reason: 'nothing_left' });
        if (error instanceof ScanSetupError && error.code === 'no_provider') return setView({ kind: 'blocked', reason: 'no_provider' });
        setView({ kind: 'failed', failure: { ...classifyFailure(error).failure, providerLabel: provider.label, providerHost: hostOf(provider.baseUrl) } });
      }
    },
    [scan, locale],
  );

  const start = useCallback(async () => {
    const availability = suggestAvailability(dayRef.current);
    if (availability.kind === 'no_targets') return setView({ kind: 'blocked', reason: 'no_targets' });
    if (availability.kind !== 'ready') return setView({ kind: 'blocked', reason: 'nothing_left' });
    let provider: AiProvider | null = null;
    try {
      provider = await scan.activeProvider();
    } catch {
      // A profile that cannot be read is the same as none: the person is sent to the settings.
    }
    if (!alive.current) return;
    if (!provider) return setView({ kind: 'blocked', reason: 'no_provider' });
    let acknowledged = false;
    try {
      acknowledged = await scan.suggestNoticeAcknowledged(provider.id);
    } catch {
      // If the acknowledgement cannot be read, the notice is shown (it can only err towards telling the person).
    }
    if (!alive.current) return;
    if (!acknowledged) return setView({ kind: 'notice', provider, request: availability });
    await run(availability, provider);
  }, [scan, run]);

  useEffect(() => {
    void start();
  }, [start]);

  const continueNotice = async (provider: AiProvider, request: ReadyRequest) => {
    try {
      await scan.acknowledgeSuggestNotice(provider.id);
    } catch {
      // The request still goes ahead: the person said yes. The notice will simply be shown again next time.
    }
    await run(request, provider);
  };

  const n = (value: number) => formatNumber(locale, value);
  const orDash = (value: number | null) => (value === null ? '–' : n(value));
  const goToSettings = () => {
    onClose();
    onProviderSettings();
  };

  return (
    <View style={styles.body}>
      <View style={[styles.aiTag, { backgroundColor: colors.aiSoft }]}>
        <Icon name="sparkle" size={16} color={colors.ai} />
        <AppText variant="caption" tone="ai">
          {t('suggest.aiTag')}
        </AppText>
      </View>

      {view.kind === 'checking' ? <Skeleton height={64} radius={16} /> : null}

      {view.kind === 'notice' ? (
        <View style={styles.body}>
          <AppText variant="heading" accessibilityRole="header">
            {t('suggest.notice.title', { provider: destinationOf(view.provider) })}
          </AppText>
          <AppText tone="muted">{t('suggest.notice.body', { provider: destinationOf(view.provider) })}</AppText>
          <AppText variant="bodyMd" testID="suggest-sends">
            {t('suggest.notice.sends', {
              kcal: n(view.request.remaining.kcal),
              protein: orDash(view.request.remaining.proteinG),
              carbs: orDash(view.request.remaining.carbsG),
              fat: orDash(view.request.remaining.fatG),
              goal: t(`goal.type.${view.request.goal}`),
              language: LANGUAGE_NAMES[locale],
            })}
          </AppText>
          <Button label={t('suggest.notice.continue')} variant="ai" icon="sparkle" onPress={() => void continueNotice(view.provider, view.request)} testID="suggest-notice-continue" />
          <Button label={t('suggest.notice.decline')} variant="secondary" onPress={onClose} testID="suggest-notice-decline" />
        </View>
      ) : null}

      {view.kind === 'loading' ? (
        <View style={styles.body} accessible accessibilityRole="progressbar" accessibilityLiveRegion="polite" accessibilityLabel={t('suggest.loading')} testID="suggest-loading">
          <Skeleton height={72} radius={16} />
          <Skeleton height={72} radius={16} />
          <AppText variant="itemName">{t('suggest.loading')}</AppText>
          <AppText variant="bodySm" tone="muted">
            {t('suggest.loadingHint', { provider: destinationOf(view.provider) })}
          </AppText>
          <Button label={t('common.cancel')} variant="secondary" onPress={onClose} testID="suggest-cancel" />
        </View>
      ) : null}

      {view.kind === 'result' && view.output.suggestions.length === 0 ? (
        <View style={styles.body}>
          <AppText variant="heading" accessibilityRole="header">
            {t('suggest.result.emptyTitle')}
          </AppText>
          <AppText tone="muted">{t('suggest.result.emptyBody')}</AppText>
          <Button label={t('common.retry')} variant="secondary" icon="retake" onPress={() => void start()} />
        </View>
      ) : null}

      {view.kind === 'result' && view.output.suggestions.length > 0 ? (
        <View style={styles.body}>
          <AppText variant="bodySm" tone="muted">
            {t('suggest.result.intro')}
          </AppText>
          {view.output.suggestions.map((s) => (
            <View key={s.name} style={[styles.card, { backgroundColor: colors.surface }]} testID="suggestion">
              <AppText variant="itemName">{s.name}</AppText>
              <View style={[styles.estimate, { backgroundColor: colors.aiSoft }]}>
                <AppText variant="caption" tone="ai">
                  {t('suggest.result.estimate')}
                </AppText>
              </View>
              <AppText variant="bodySm" tone="muted">
                {t('suggest.result.line', { grams: n(s.grams), kcal: n(s.kcal), protein: formatDecimal(locale, s.proteinG, 1), carbs: formatDecimal(locale, s.carbsG, 1), fat: formatDecimal(locale, s.fatG, 1) })}
              </AppText>
              <AppText variant="bodyMd">{s.reason}</AppText>
              <Button
                label={t('suggest.result.add')}
                accessibilityLabel={t('suggest.result.addLabel', { name: s.name })}
                variant="secondary"
                icon="plus"
                onPress={() => {
                  onClose();
                  onAdd(s);
                }}
              />
            </View>
          ))}
          <Button label={t('suggest.result.again')} variant="ghost" icon="retake" onPress={() => void start()} />
        </View>
      ) : null}

      {view.kind === 'blocked' ? (
        <BlockedView
          reason={view.reason}
          onProviderSettings={goToSettings}
          onSetupTargets={
            onSetupTargets
              ? () => {
                  onClose();
                  onSetupTargets();
                }
              : undefined
          }
        />
      ) : null}

      {view.kind === 'failed' ? <FailedView failure={view.failure} onRetry={() => void start()} onProviderSettings={goToSettings} /> : null}
    </View>
  );
}

function BlockedView({ reason, onProviderSettings, onSetupTargets }: { reason: Blocked; onProviderSettings: () => void; onSetupTargets?: () => void }) {
  const { t } = useTranslation();
  const key = reason === 'no_provider' ? 'noProvider' : reason === 'no_targets' ? 'noTargets' : 'nothingLeft';
  return (
    <View style={styles.body} testID={`suggest-blocked-${reason}`}>
      <AppText variant="heading" accessibilityRole="header">
        {t(`suggest.blocked.${key}.title`)}
      </AppText>
      <AppText tone="muted">{t(`suggest.blocked.${key}.message`)}</AppText>
      {reason === 'no_provider' ? <Button label={t('suggest.blocked.noProvider.action')} icon="settings" onPress={onProviderSettings} testID="suggest-setup-provider" /> : null}
      {reason === 'no_targets' && onSetupTargets ? <Button label={t('suggest.blocked.noTargets.action')} icon="settings" onPress={onSetupTargets} testID="suggest-setup-targets" /> : null}
    </View>
  );
}

/** The failures the provider settings can fix lead there as well as offering "Try again". */
const FIXABLE_IN_SETTINGS = new Set(['auth_invalid', 'model_not_found', 'no_vision', 'invalid_output', 'insecure_url']);

function FailedView({ failure, onRetry, onProviderSettings }: { failure: ScanFailure; onRetry: () => void; onProviderSettings: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kind = failure.kind === 'photo_unreadable' ? 'unknown' : failure.kind;
  const message = (() => {
    if (kind === 'quota' && failure.retryAfterS !== undefined) {
      const { hours, minutes } = waitParts(failure.retryAfterS);
      const time = hours > 0 && minutes > 0 ? t('scan.failure.wait.hm', { hours, minutes }) : hours > 0 ? t('scan.failure.wait.h', { hours }) : t('scan.failure.wait.m', { minutes });
      return t('suggest.failure.quota.messageWait', { time });
    }
    return t(`suggest.failure.${kind}.message`);
  })();
  return (
    <View style={styles.body} accessibilityRole="alert" testID="suggest-failed">
      <View style={[styles.alertIcon, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
        <Icon name={kind === 'timeout' ? 'clock' : 'alert'} size={24} color={colors.warning} />
      </View>
      <AppText variant="heading" accessibilityRole="header">
        {t(`suggest.failure.${kind}.title`)}
      </AppText>
      <AppText tone="muted">{message}</AppText>
      {kind === 'unknown' && failure.detail ? (
        <AppText variant="bodySm" tone="muted" selectable testID="error-detail">
          {failure.detail}
        </AppText>
      ) : null}
      <Button label={t('common.retry')} icon="retake" onPress={onRetry} testID="suggest-retry" />
      {FIXABLE_IN_SETTINGS.has(kind) ? <Button label={t('suggest.failure.providerSettings')} variant="secondary" icon="settings" onPress={onProviderSettings} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.s3 },
  aiTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.s1, paddingHorizontal: spacing.s3, paddingVertical: spacing.s1, borderRadius: radius.pill },
  card: { borderRadius: radius.lg, padding: spacing.s4, gap: spacing.s2, alignItems: 'flex-start' },
  estimate: { paddingHorizontal: spacing.s2, paddingVertical: 2, borderRadius: radius.pill },
  alertIcon: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
