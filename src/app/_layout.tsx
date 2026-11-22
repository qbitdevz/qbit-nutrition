import '@/i18n';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { MealDraftProvider } from '@/features/logging/draft';
import { ScanPlatformProvider } from '@/features/scan/ScanPlatformContext';
import { ScanSessionProvider } from '@/features/scan/ScanSession';
import { createExpoScanPlatform } from '@/platform/expoScanPlatform';
import { AppSession, useSession } from '@/features/session/AppSession';
import { AppProvider } from '@/features/startup/AppProvider';
import { openAppServices } from '@/features/startup/openServices';
import { MotionProvider, SnackbarProvider, useAppFonts, useReducedMotion, useTheme } from '@/ui';

void SplashScreen.preventAutoHideAsync();

// DEVELOPMENT ONLY: the browser preview has no useful camera, so it uses a drawn sample plate. Dropped from release bundles with `__DEV__`.
const scanPlatform =
  __DEV__ && Platform.OS === 'web'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('@/features/scan/dev/devPlatform') as typeof import('@/features/scan/dev/devPlatform')).createDevScanPlatform()
    : createExpoScanPlatform();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // A font failure must not block the app; text falls back to the system font.
  if (!ready) return null;

  return (
    <MotionProvider>
      <AppProvider open={openAppServices}>
        <AppSession>
          <SnackbarProvider>
            <ScanPlatformProvider platform={scanPlatform}>
              <ScanSessionProvider>
                <MealDraftProvider>
                  <AppStack />
                </MealDraftProvider>
              </ScanSessionProvider>
            </ScanPlatformProvider>
          </SnackbarProvider>
        </AppSession>
      </AppProvider>
    </MotionProvider>
  );
}

function AppStack() {
  const { colors, scheme } = useTheme();
  const reduced = useReducedMotion();
  const { onboarded } = useSession();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          // Every screen draws its own top bar (TopBar), so the native header is off.
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          // Reduced motion: screens cross-fade instead of travelling (design/system.md, "Reduced motion").
          animation: reduced ? 'fade' : 'slide_from_right',
        }}>
        {/* Until onboarding is completed only the onboarding route exists; afterwards it is gone. */}
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan" options={{ presentation: 'modal', animation: reduced ? 'fade' : 'slide_from_bottom' }} />
          <Stack.Screen name="log/search" />
          <Stack.Screen name="log/review" />
          <Stack.Screen name="log/custom-food" />
          <Stack.Screen name="meal/[id]" />
          <Stack.Screen name="settings/index" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
