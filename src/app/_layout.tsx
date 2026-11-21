import '@/i18n';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { MealDraftProvider } from '@/features/logging/draft';
import { AppSession, useSession } from '@/features/session/AppSession';
import { AppProvider } from '@/features/startup/AppProvider';
import { openAppServices } from '@/features/startup/openServices';
import { MotionProvider, SnackbarProvider, useAppFonts, useReducedMotion, useTheme } from '@/ui';

void SplashScreen.preventAutoHideAsync();

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
            <MealDraftProvider>
              <AppStack />
            </MealDraftProvider>
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
