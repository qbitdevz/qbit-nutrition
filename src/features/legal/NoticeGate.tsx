import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';

import type { Locale } from '@/i18n/locale';
import { AppText, Button, ScreenFooter, ScreenFrame, layout, spacing } from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { acceptCurrentNotice } from './acceptance';
import { Disclaimer } from './Disclaimer';

/**
 * Shows the app, unless the health notice was accepted in an older text than the current one: then it shows the notice again (S8,
 * docs/12 section 2) and nothing else until it is accepted. First launch is not its job: onboarding has its own notice step, and
 * `noticeCurrent` is true until onboarding is done.
 */
export function NoticeGate({ children, now = () => new Date() }: { children: ReactNode; now?: () => Date }) {
  const { onboarded, noticeCurrent } = useSession();
  if (onboarded && !noticeCurrent) return <NoticeUpdateScreen now={now} />;
  return <>{children}</>;
}

function NoticeUpdateScreen({ now }: { now: () => Date }) {
  const { t, i18n } = useTranslation();
  const { repos } = useServices();
  const { markNoticeAccepted } = useSession();
  const [declined, setDeclined] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const accept = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await acceptCurrentNotice(repos, i18n.language as Locale, now());
      markNoticeAccepted();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  if (declined) {
    return (
      <ScreenFrame
        ambient="warm"
        footer={
          <ScreenFooter>
            <Button label={t('legal.update.readAgain')} onPress={() => setDeclined(false)} />
            {Platform.OS === 'android' ? <Button label={t('legal.update.close')} variant="secondary" onPress={() => BackHandler.exitApp()} /> : null}
          </ScreenFooter>
        }>
        <View style={styles.body}>
          <AppText variant="titleLg" accessibilityRole="header">
            {t('legal.update.declinedTitle')}
          </AppText>
          <AppText>{t('legal.update.declinedBody')}</AppText>
        </View>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      footer={
        <ScreenFooter>
          {failed ? (
            <AppText variant="bodySm" tone="warning" accessibilityRole="alert" style={styles.center}>
              {t('legal.update.failed')}
            </AppText>
          ) : null}
          <Button label={t('legal.update.accept')} disabled={saving} onPress={() => void accept()} />
          <Button label={t('legal.update.decline')} variant="secondary" disabled={saving} onPress={() => setDeclined(true)} />
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <AppText variant="bodyMd" tone="primary" accessibilityRole="header">
          {t('legal.update.title')}
        </AppText>
        <AppText tone="muted">{t('legal.update.intro')}</AppText>
        <Disclaimer />
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s6, paddingBottom: spacing.s6, gap: spacing.s4 },
  center: { textAlign: 'center' },
});
