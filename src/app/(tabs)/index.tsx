import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDockPulse } from '@/features/navigation/AppDock';
import { TodayScreen, type TodayScreenHandle } from '@/features/today/TodayScreen';

export default function TodayRoute() {
  const router = useRouter();
  const handle = useRef<TodayScreenHandle>(null);
  const [empty, setEmpty] = useState(false);
  useDockPulse(empty);

  // Meals can change while Today is not on screen (logging, editing): read the day again on return.
  useFocusEffect(
    useCallback(() => {
      handle.current?.reload();
    }, []),
  );

  return (
    <TodayScreen
      handleRef={handle}
      onEmptyDayChange={setEmpty}
      onOpenSettings={() => router.push('/settings')}
      onOpenMeal={(id) => router.push({ pathname: '/meal/[id]', params: { id } })}
      onSetupTargets={() => router.push('/settings/goal')}
      onProviderSettings={() => router.push('/settings/providers')}
      // Only the name and the grams of a suggestion go to the search; the values saved come from the catalog.
      onAddSuggestion={(s) => router.push({ pathname: '/log/search', params: { q: s.name, grams: String(s.grams) } })}
    />
  );
}
