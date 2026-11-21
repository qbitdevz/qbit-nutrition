import { createContext, useContext, type ReactNode } from 'react';

import type { ScanPlatform } from '@/platform/scanPlatform';

const PlatformContext = createContext<ScanPlatform | null>(null);

/** The device modules behind the scan flow (camera, gallery, image processing, files). The app gives the Expo ones; tests give a fake. */
export function ScanPlatformProvider({ platform, children }: { platform: ScanPlatform; children: ReactNode }) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

export function useScanPlatform(): ScanPlatform {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error('useScanPlatform must be used under a ScanPlatformProvider');
  return platform;
}
