import '@/i18n';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

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
        <SnackbarProvider>
          <AppStack />
        </SnackbarProvider>
      </AppProvider>
    </MotionProvider>
  );
}

function AppStack() {
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: 'Outfit_600SemiBold' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          // Reduced motion: screens cross-fade instead of travelling (design/system.md, "Reduced motion").
          animation: reduced ? 'fade' : 'slide_from_right',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="scan"
          options={{ title: t('scan.title'), presentation: 'modal', animation: reduced ? 'fade' : 'slide_from_bottom' }}
        />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
      </Stack>
    </>
  );
}
