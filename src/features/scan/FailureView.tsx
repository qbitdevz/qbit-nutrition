import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { AppText, Button, ErrorState, Icon, ScreenFooter, ScreenFrame, TopBar, layout, radius, spacing, useTheme } from '@/ui';
import type { IconName } from '@/ui';
import type { FailureKind, ScanFailure } from './failures';
import { waitParts } from './waitTime';

export type FailureAction = 'retry' | 'providerSettings' | 'setupProvider' | 'switchProvider' | 'retake' | 'copyDetail' | 'retryLater' | 'manual';

interface Plan {
  icon: IconName;
  primary: FailureAction;
  /** Between the primary button and "Add manually". */
  secondary?: FailureAction[];
  /** After "Add manually", as a text button. */
  ghost?: FailureAction;
}

/** What each cause offers (docs/04 flow C). "Add manually" is added to every one of them. */
const PLANS: Record<FailureKind, Plan> = {
  no_provider: { icon: 'sparkle', primary: 'setupProvider', secondary: ['retry'] },
  no_network: { icon: 'alert', primary: 'retry' },
  auth_invalid: { icon: 'alert', primary: 'providerSettings', secondary: ['retry'] },
  quota: { icon: 'alert', primary: 'switchProvider', secondary: ['retry'], ghost: 'retryLater' },
  no_vision: { icon: 'alert', primary: 'providerSettings', secondary: ['retry'] },
  model_not_found: { icon: 'alert', primary: 'providerSettings', secondary: ['retry'] },
  invalid_output: { icon: 'alert', primary: 'retry' },
  no_food: { icon: 'plate', primary: 'retake' },
  provider_changed: { icon: 'alert', primary: 'retry' },
  insecure_url: { icon: 'alert', primary: 'providerSettings', secondary: ['retry'] },
  timeout: { icon: 'clock', primary: 'retry' },
  provider_unavailable: { icon: 'alert', primary: 'retry' },
  photo_unreadable: { icon: 'alert', primary: 'retake' },
  unknown: { icon: 'alert', primary: 'retry', secondary: ['copyDetail'] },
};

const LABELS: Record<FailureAction, { text: string; icon?: IconName }> = {
  retry: { text: 'common.retry', icon: 'retake' },
  providerSettings: { text: 'scan.failure.action.providerSettings', icon: 'settings' },
  setupProvider: { text: 'scan.failure.action.setupProvider', icon: 'settings' },
  switchProvider: { text: 'scan.failure.action.switchProvider', icon: 'swap' },
  retake: { text: 'scan.preview.retake', icon: 'retake' },
  copyDetail: { text: 'scan.failure.action.copyDetail', icon: 'copy' },
  retryLater: { text: 'scan.failure.action.retryLater', icon: 'clock' },
  manual: { text: 'scan.manual', icon: 'pencil' },
};

interface FailureViewProps {
  failure: ScanFailure;
  /** The photo, kept for a retry; null when there is none to show. */
  photoUri: string | null;
  onAction: (action: FailureAction) => void;
  onClose: () => void;
}

/**
 * Flow C: one screen per cause, with its specific message, the photo kept, a way forward, and "Add
 * manually" every time. Amber with an icon and text, never red (design/system.md).
 */
export function FailureView({ failure, photoUri, onAction, onClose }: FailureViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const plan = PLANS[failure.kind];

  const message = (() => {
    if (failure.kind === 'quota' && failure.retryAfterS !== undefined) {
      const { hours, minutes } = waitParts(failure.retryAfterS);
      const time = hours > 0 && minutes > 0 ? t('scan.failure.wait.hm', { hours, minutes }) : hours > 0 ? t('scan.failure.wait.h', { hours }) : t('scan.failure.wait.m', { minutes });
      return t('scan.failure.quota.messageWait', { time });
    }
    return t(`scan.failure.${failure.kind}.message`);
  })();

  const button = (action: FailureAction, variant: 'primary' | 'secondary' | 'ghost') => (
    <Button key={action} label={t(LABELS[action].text)} icon={LABELS[action].icon} variant={variant} onPress={() => onAction(action)} testID={`failure-${action}`} />
  );

  return (
    <ScreenFrame
      ambient="warm"
      header={<TopBar title={t('scan.failure.header')} onBack={onClose} backLabel={t('common.close')} />}
      footer={
        <ScreenFooter>
          {button(plan.primary, 'primary')}
          {(plan.secondary ?? []).map((action) => button(action, 'secondary'))}
          {button('manual', 'secondary')}
          {plan.ghost ? button(plan.ghost, 'ghost') : null}
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <ErrorState title={t(`scan.failure.${failure.kind}.title`)} message={message} detail={failure.kind === 'unknown' ? failure.detail : undefined} icon={plan.icon}>
          {failure.providerLabel ? (
            <View style={[styles.chip, { backgroundColor: colors.aiSoft }]}>
              <Icon name="sparkle" size={16} color={colors.ai} />
              <AppText variant="bodySm" tone="ai">
                {t('scan.analyzing.provider', { provider: failure.providerHost ? `${failure.providerLabel} (${failure.providerHost})` : failure.providerLabel })}
              </AppText>
            </View>
          ) : null}
          {photoUri ? (
            <View style={[styles.kept, { backgroundColor: colors.surface }]}>
              <Image source={{ uri: photoUri }} style={[styles.thumb, { backgroundColor: colors.surfaceHigh }]} accessibilityLabel={t('scan.photoLabel')} testID="failure-photo" />
              <View style={styles.keptText}>
                <AppText variant="itemName">{t('scan.failure.kept')}</AppText>
                <AppText variant="bodySm" tone="muted">
                  {t('scan.failure.keptBody')}
                </AppText>
              </View>
            </View>
          ) : null}
        </ErrorState>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingBottom: spacing.s6 },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.s2, paddingHorizontal: spacing.s3, paddingVertical: spacing.s1, borderRadius: radius.pill },
  kept: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, padding: spacing.s3, borderRadius: radius.lg },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  keptText: { flex: 1, gap: 2 },
});
