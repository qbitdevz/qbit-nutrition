import type { ScanPlatform } from '@/platform/scanPlatform';
import { loadFoodView } from '../logging/foods';
import type { AppServices } from '../startup/types';
import type { AnalyzeDeps } from './analyzeScan';

/** The use case's dependencies, taken from the app's services and the device platform. */
export function createScanDeps(services: AppServices, platform: Pick<ScanPlatform, 'images'>): AnalyzeDeps {
  return {
    gateway: services.scan,
    scans: services.repos.scans,
    catalog: services.catalog,
    resolveFood: async (ref, locale) => {
      const view = await loadFoodView(services, ref, locale);
      return view ? { name: view.name, per100g: view.per100g } : null;
    },
    prepare: (photo) => platform.images.prepare(photo),
  };
}
