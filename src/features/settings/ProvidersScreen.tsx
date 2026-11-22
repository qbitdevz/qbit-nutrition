import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, EmptyState, ErrorState, ScreenFooter, ScreenFrame, SettingsRow, Skeleton, TopBar, layout, spacing } from '@/ui';
import { useSession } from '../session/AppSession';
import { hostOf } from './destination';
import { useServices } from '../startup/AppProvider';
import type { ProviderView } from './providerService';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; providers: ProviderView[] };

interface ProvidersScreenProps {
  onAdd: () => void;
  onOpen: (id: string) => void;
  onBack?: () => void;
}

/** Settings → AI providers (flow E): the profiles, the active one marked, and "Add". */
export function ProvidersScreen({ onAdd, onOpen, onBack }: ProvidersScreenProps) {
  const { t } = useTranslation();
  const { providers } = useServices();
  const { revision } = useSession();
  const [state, setState] = useState<State>({ status: 'loading' });

  const read = useCallback(() => {
    providers.list().then(
      (list) => setState({ status: 'ready', providers: list }),
      () => setState({ status: 'error' }),
    );
  }, [providers]);
  // Read again whenever a profile changes on another screen (`revision`).
  useEffect(read, [read, revision]);

  const retry = () => {
    setState({ status: 'loading' });
    read();
  };

  const list = state.status === 'ready' ? state.providers : [];
  return (
    <ScreenFrame
      header={<TopBar title={t('providers.title')} onBack={onBack} backLabel={t('common.back')} />}
      footer={
        state.status === 'ready' && list.length > 0 ? (
          <ScreenFooter>
            <Button label={t('providers.add')} icon="plus" onPress={onAdd} />
          </ScreenFooter>
        ) : undefined
      }>
      <View style={styles.body}>
        {state.status === 'loading' ? <Skeleton height={72} radius={24} /> : null}
        {state.status === 'error' ? (
          <ErrorState title={t('providers.title')} message={t('providers.list.error')}>
            <Button label={t('common.retry')} icon="retake" onPress={retry} />
          </ErrorState>
        ) : null}
        {state.status === 'ready' && list.length === 0 ? (
          <EmptyState title={t('providers.list.empty.title')} body={t('providers.list.empty.body')} icon="sparkle">
            <Button label={t('providers.add')} icon="plus" onPress={onAdd} />
          </EmptyState>
        ) : null}
        {list.length > 0 ? (
          <View style={styles.rows}>
            {list.map((provider) => (
              <SettingsRow
                key={provider.id}
                icon={provider.isActive ? 'check' : 'sparkle'}
                title={provider.label}
                detail={[provider.isActive ? t('providers.active') : null, hostOf(provider.baseUrl), provider.model, provider.hasKey ? t('providers.keySaved') : t('providers.noKey'), provider.imported ? t('providers.imported.tag') : null]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => onOpen(provider.id)}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.notes}>
          <AppText variant="bodySm" tone="muted">
            {t('providers.privacy')}
          </AppText>
          <AppText variant="bodySm" tone="muted">
            {t('providers.notAffiliated')}
          </AppText>
        </View>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s6, gap: spacing.s6 },
  rows: { gap: spacing.s2 },
  notes: { gap: spacing.s2, paddingHorizontal: spacing.s2 },
});
