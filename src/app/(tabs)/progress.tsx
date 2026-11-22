import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ProgressScreen } from '@/features/progress/ProgressScreen';

export default function ProgressRoute() {
  const [focusToken, setFocusToken] = useState(0);
  // Meals, goals and weights can change while Progress is not on screen: read again on return.
  useFocusEffect(useCallback(() => setFocusToken((n) => n + 1), []));
  return <ProgressScreen focusToken={focusToken} />;
}
