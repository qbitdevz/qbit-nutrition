/**
 * Test-only: renders a screen inside the real startup provider, over the Node database harness
 * (`src/data/testing`), so component tests read real repositories instead of mocks. Never import
 * this from app code.
 */
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeScanPlatform } from '@/platform/fakeScanPlatform';
import { createMemorySecretStore } from '@/platform/memorySecretStore';
import type { ScanPlatform } from '@/platform/scanPlatform';
import type { Repositories } from '@/data';
import i18n from '@/i18n';
import type { Locale } from '@/i18n/locale';
import { MotionProvider, SnackbarProvider, ThemeProvider } from '@/ui';
import { MealDraftProvider } from '../logging/draft';
import { ScanPlatformProvider } from '../scan/ScanPlatformContext';
import { ScanSessionProvider } from '../scan/ScanSession';
import { createBarcodeClient } from '../barcode/barcodeClient';
import { createBarcodeService } from '../barcode/barcodeService';
import { createInactiveHealthSync } from '../health/healthSync';
import { createAiServices } from '../startup/aiServices';
import { offlineFetch } from './offline';
import { AppProvider } from '../startup/AppProvider';
import type { AppServices } from '../startup/types';

export interface RenderAppOptions {
  services: AppServices;
  locale?: Locale;
  /** The system "reduce motion" setting; on by default so assertions see final values at once. */
  reducedMotion?: boolean;
  scheme?: 'dark' | 'light';
  /** The camera, gallery, image and file modules; a fake with nothing in it unless the test gives one. */
  scanPlatform?: ScanPlatform;
}

export async function renderApp(ui: ReactElement, { services, locale = 'en', reducedMotion = true, scheme = 'dark', scanPlatform }: RenderAppOptions) {
  const platform = scanPlatform ?? createFakeScanPlatform();
  await i18n.changeLanguage(locale);
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider scheme={scheme}>
        <MotionProvider reduced={reducedMotion}>
          <AppProvider open={async () => services}>
            <SnackbarProvider>
              <ScanPlatformProvider platform={platform}>
                <ScanSessionProvider>
                  <MealDraftProvider>{ui}</MealDraftProvider>
                </ScanSessionProvider>
              </ScanPlatformProvider>
            </SnackbarProvider>
          </AppProvider>
        </MotionProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

/** Services over a harness, optionally with some repository methods replaced (to simulate a failure). */
export function servicesFrom(h: { repos: Repositories; catalog: AppServices['catalog'] }, repos: Repositories = h.repos): AppServices {
  const barcode = createBarcodeService({ repos, client: createBarcodeClient({ fetch: offlineFetch, userAgent: 'QbitNutrition/test (https://example.test)', timeoutMs: 1000 }) });
  return { repos, catalog: h.catalog, ...createAiServices({ repos, secrets: createMemorySecretStore(), fetch: offlineFetch, retryDelayMs: 0 }), barcode, health: createInactiveHealthSync() };
}
