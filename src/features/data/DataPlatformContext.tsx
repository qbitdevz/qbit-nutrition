import { createContext, useContext, type ReactNode } from 'react';

import type { DataPlatform } from '@/platform/dataPlatform';

const DataPlatformContext = createContext<DataPlatform | null>(null);

/** Gives the data screens the device's files, share sheet and file picker (the Expo ones in the app, fakes in tests and the preview). */
export function DataPlatformProvider({ platform, children }: { platform: DataPlatform; children: ReactNode }) {
  return <DataPlatformContext.Provider value={platform}>{children}</DataPlatformContext.Provider>;
}

export function useDataPlatform(): DataPlatform {
  const platform = useContext(DataPlatformContext);
  if (!platform) throw new Error('useDataPlatform must be used under a DataPlatformProvider');
  return platform;
}
