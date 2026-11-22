import { createContext, useContext, useEffect, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FloatingDock, layout, type DockTab } from '@/ui';

/** Lets a screen ask the dock to pulse its scan button (the first-day prompt) while it is on screen. */
export const DockPulseContext = createContext<Dispatch<SetStateAction<boolean>>>(() => undefined);

export function useDockPulse(active: boolean): void {
  const setPulse = useContext(DockPulseContext);
  useEffect(() => {
    setPulse(active);
    return () => setPulse(false);
  }, [active, setPulse]);
}

interface AppDockProps {
  /** Name of the focused tab route (`index` or `progress`). */
  activeRoute: string;
  onNavigate: (route: 'index' | 'progress') => void;
  onScan: () => void;
  pulse: boolean;
}

/**
 * The app's floating dock: Today, the raised Scan button, Progress (docs/04 navigation map). It
 * floats over the screens, so the tab navigator gives it no layout space of its own.
 */
export function AppDock({ activeRoute, onNavigate, onScan, pulse }: AppDockProps) {
  const { t } = useTranslation();
  const tabs: [DockTab, DockTab] = [
    { key: 'index', label: t('tabs.today'), icon: 'today', active: activeRoute === 'index', onPress: () => onNavigate('index') },
    { key: 'progress', label: t('tabs.progress'), icon: 'progress', active: activeRoute === 'progress', onPress: () => onNavigate('progress') },
  ];
  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <FloatingDock tabs={tabs} navLabel={t('tabs.nav')} scanLabel={t('today.scan')} scanCaption={t('tabs.scan')} onScan={onScan} pulse={pulse} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Tall enough to hold the dock and the scan button that rises above it, so touches reach both on Android.
  layer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: layout.dockHeight + layout.dockInset * 2 + 80 },
});
