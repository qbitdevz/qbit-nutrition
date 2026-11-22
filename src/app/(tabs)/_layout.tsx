import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useState } from 'react';

import { AppDock, DockPulseContext } from '@/features/navigation/AppDock';

export default function TabsLayout() {
  const [pulse, setPulse] = useState(false);
  return (
    <DockPulseContext.Provider value={setPulse}>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
        tabBar={({ state }) => (
          <AppDock
            activeRoute={state.routes[state.index]?.name ?? 'index'}
            onNavigate={(route) => router.navigate(route === 'index' ? '/' : '/progress')}
            onScan={() => router.push('/scan')}
            pulse={pulse}
          />
        )}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="progress" />
      </Tabs>
    </DockPulseContext.Provider>
  );
}
