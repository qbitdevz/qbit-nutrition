import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { isDataError } from '@/data';
import { AppText, Button, ErrorState, ScreenFrame, Skeleton, Wordmark, layout, spacing } from '@/ui';
import type { AppServices, OpenServices } from './types';

type StartupState =
  | { status: 'loading' }
  | { status: 'ready'; services: AppServices }
  | { status: 'failed'; error: unknown };

const ServicesContext = createContext<AppServices | null>(null);

/** The repositories and the catalog, opened and migrated. Only valid under a ready `AppProvider`. */
export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used under a ready AppProvider');
  return services;
}

interface AppProviderProps {
  /** Opens `app.db`, runs the migrations, opens the catalog (`openAppServices` in the app; fakes in tests). */
  open: OpenServices;
  children: ReactNode;
}

/**
 * App startup (docs/08 section 8): open the database, run the migrations, open the catalog, then
 * give screens the repositories. Until then it shows a loading state; if opening fails it shows a
 * recovery screen with the typed error. Screens never run SQL: they only see `AppServices`.
 */
export function AppProvider({ open, children }: AppProviderProps) {
  const [openServices] = useState(() => open);
  const [attempt, setAttempt] = useState(0);
  // The result belongs to one attempt; a newer attempt shows the loading state again until it answers.
  const [result, setResult] = useState<{ attempt: number; outcome: Exclude<StartupState, { status: 'loading' }> } | null>(null);

  useEffect(() => {
    let active = true;
    openServices().then(
      (services) => active && setResult({ attempt, outcome: { status: 'ready', services } }),
      (error: unknown) => active && setResult({ attempt, outcome: { status: 'failed', error } }),
    );
    return () => {
      active = false;
    };
  }, [openServices, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const state: StartupState = result && result.attempt === attempt ? result.outcome : { status: 'loading' };
  if (state.status === 'ready') return <ServicesContext.Provider value={state.services}>{children}</ServicesContext.Provider>;
  if (state.status === 'failed') return <RecoveryScreen error={state.error} onRetry={retry} />;
  return <StartupLoading />;
}

function StartupLoading() {
  const { t } = useTranslation();
  return (
    <ScreenFrame scroll={false}>
      <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel={t('startup.loading')} testID="startup-loading">
        <Wordmark name={t('app.name')} label={t('app.wordmarkLabel')} />
        <View style={styles.ring}>
          <Skeleton width={layout.ringSize} height={layout.ringSize} radius={layout.ringSize / 2} />
        </View>
        <AppText tone="muted">{t('startup.loading')}</AppText>
      </View>
    </ScreenFrame>
  );
}

/** Shown when the database cannot be opened or migrated; the previous data is untouched (docs/08 section 8). */
function RecoveryScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const code = isDataError(error) ? error.code : 'startup_failed';
  const detail = error instanceof Error ? error.message : String(error);
  return (
    <ScreenFrame ambient="warm" scroll={false}>
      <View style={styles.recovery} testID="startup-recovery">
        <ErrorState title={t('startup.recovery.title')} message={t('startup.recovery.message')} detail={`${code}: ${detail}`}>
          <Button label={t('startup.recovery.retry')} icon="retake" onPress={onRetry} />
        </ErrorState>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s4, gap: spacing.s6 },
  ring: { alignItems: 'center', paddingTop: spacing.s8 },
  recovery: { flex: 1, padding: spacing.s4, paddingTop: spacing.s10 },
});
