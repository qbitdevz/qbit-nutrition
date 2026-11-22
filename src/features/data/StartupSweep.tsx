import { useEffect } from 'react';

import { useServices } from '../startup/AppProvider';
import { useDataPlatform } from './DataPlatformContext';
import { createDataService } from './dataService';

/**
 * Runs the startup sweep once per start: removes kept photos no meal refers to, export files and picker copies left in the cache,
 * and keys that belong to no profile. These are what a crash or a failed cleanup (an import, an export, "Delete all") can leave.
 * Nothing here is worth an error screen: whatever fails is tried again at the next start.
 */
export function StartupSweep() {
  const platform = useDataPlatform();
  const { repos, providers } = useServices();
  useEffect(() => {
    void createDataService({ repos, providers, platform, appVersion: '' }).sweepStartup().catch(() => undefined);
  }, [repos, providers, platform]);
  return null;
}
