import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SUPPORTED_LOCALES, type Locale } from '@/i18n/locale';
import { AppText, ScreenFrame, Skeleton, Wordmark, layout, spacing } from '@/ui';
import { DISCLAIMER_VERSION } from '../legal/version';
import { useServices } from '../startup/AppProvider';

/** `setting` keys of the session: the chosen language, and when onboarding was finished. */
export const LOCALE_KEY = 'locale';
export const ONBOARDED_KEY = 'onboarding_completed_at';

interface Session {
  /** True once flow A was completed (the setting is written last, so an interrupted onboarding starts again). */
  onboarded: boolean;
  markOnboarded: () => void;
  /**
   * False when onboarding was completed but the stored acceptance is of an older text of the health notice (or none): the app asks
   * again before anything else (`NoticeGate`). True during first launch, where onboarding has its own notice step.
   */
  noticeCurrent: boolean;
  /** The person accepted the current text of the health notice. */
  markNoticeAccepted: () => void;
  /** Returns the app to first launch after "Delete all data": the guarded routes go away and onboarding starts again. */
  resetOnboarding: () => void;
  /** Goes up whenever meals or goals change outside the screen that shows them (undo from a snackbar); Today reads again. */
  revision: number;
  notifyChange: () => void;
}

const noop = () => undefined;
const SessionContext = createContext<Session>({
  onboarded: false,
  markOnboarded: noop,
  noticeCurrent: true,
  markNoticeAccepted: noop,
  resetOnboarding: noop,
  revision: 0,
  notifyChange: noop,
});

export const useSession = (): Session => useContext(SessionContext);

const isLocale = (value: string | null): value is Locale => value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value);

/**
 * Reads what survives a restart before the first screen: the language the person chose (applied
 * before anything is drawn, so there is no flash of the device language) and whether onboarding was
 * completed. Provides both to the app. Must sit under a ready `AppProvider`.
 */
export function AppSession({ children }: { children: ReactNode }) {
  const { repos } = useServices();
  const { i18n } = useTranslation();
  const [loaded, setLoaded] = useState<{ onboarded: boolean; noticeCurrent: boolean } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      let onboarded = false;
      let noticeCurrent = true;
      try {
        const settings = await repos.settings.getAll();
        const saved = settings[LOCALE_KEY] ?? null;
        if (isLocale(saved) && saved !== i18n.language) await i18n.changeLanguage(saved);
        onboarded = Boolean(settings[ONBOARDED_KEY]);
        // Compared as written: any other stored version (an older text, an empty one from an import) means "ask again".
        if (onboarded) noticeCurrent = (await repos.profile.get())?.disclaimerVersion === DISCLAIMER_VERSION;
      } catch {
        // Unreadable settings: start from the device language and the first-launch flow, never crash.
      }
      if (active) setLoaded({ onboarded, noticeCurrent });
    })();
    return () => {
      active = false;
    };
  }, [repos, i18n]);

  // Onboarding stores the current version itself, so finishing it never needs the notice again.
  const markOnboarded = useCallback(() => setLoaded({ onboarded: true, noticeCurrent: true }), []);
  const markNoticeAccepted = useCallback(() => setLoaded((state) => (state ? { ...state, noticeCurrent: true } : state)), []);
  const resetOnboarding = useCallback(() => {
    setLoaded({ onboarded: false, noticeCurrent: true });
    setRevision((n) => n + 1);
  }, []);
  const notifyChange = useCallback(() => setRevision((n) => n + 1), []);
  const value = useMemo<Session>(
    () => ({
      onboarded: loaded?.onboarded ?? false,
      markOnboarded,
      noticeCurrent: loaded?.noticeCurrent ?? true,
      markNoticeAccepted,
      resetOnboarding,
      revision,
      notifyChange,
    }),
    [loaded, markOnboarded, markNoticeAccepted, resetOnboarding, revision, notifyChange],
  );

  if (!loaded) return <SessionLoading />;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function SessionLoading() {
  const { t } = useTranslation();
  return (
    <ScreenFrame scroll={false}>
      <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel={t('startup.loading')}>
        <Wordmark name={t('app.name')} label={t('app.wordmarkLabel')} />
        <Skeleton height={160} radius={24} />
        <AppText tone="muted">{t('startup.loading')}</AppText>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s4, gap: spacing.s6 },
});
