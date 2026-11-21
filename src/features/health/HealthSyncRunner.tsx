import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useServices } from '../startup/AppProvider';

/**
 * Keeps the Health Connect integration moving without anyone opening its screen: at every start and every time the app comes back
 * to the foreground, writes the records that are still pending and reads recent weights. While the integration is off it does
 * nothing at all (`retry` returns at once, without calling the platform). Failures stay inside the integration.
 */
export function HealthSyncRunner() {
  const { health } = useServices();
  useEffect(() => {
    const run = () => {
      void health
        .isEnabled()
        .then((on) => (on ? health.retry() : undefined))
        .catch(() => undefined);
    };
    run();
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && run());
    return () => subscription.remove();
  }, [health]);
  return null;
}
