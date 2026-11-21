import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { typography } from '@/ui/tokens';
import { useTheme } from '@/ui/useTheme';

export default function TabsLayout() {
  const colors = useTheme();
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.rule },
        tabBarLabelStyle: typography.label,
        tabBarIconStyle: { display: 'none' },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.today') }} />
      <Tabs.Screen name="progress" options={{ title: t('tabs.progress') }} />
    </Tabs>
  );
}
