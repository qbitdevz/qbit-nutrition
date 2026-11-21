import { useCallback, useEffect, useState } from 'react';

import type { Repositories } from '@/data';
import { loadToday, type TodayData } from './loadToday';

export type TodayState =
  | { status: 'loading' }
  | { status: 'ready'; data: TodayData }
  | { status: 'error'; error: unknown };

type Outcome = Exclude<TodayState, { status: 'loading' }>;

/**
 * Loads one day for the Today screen. Changing `localDate` (or `retry`) shows the loading state;
 * `reload` refreshes quietly (the data stays on screen), e.g. when the screen regains focus after a
 * save. A slow answer for a date the person already left is ignored. `now` is read once, at mount.
 */
export function useTodayData(
  repos: Pick<Repositories, 'meals' | 'goals'>,
  localDate: string,
  now: () => Date,
): TodayState & { reload: () => void; retry: () => void } {
  const [clock] = useState(() => now);
  // `attempt` restarts a failed load (shows loading); `refresh` re-reads quietly. The stored
  // outcome belongs to one date and attempt; anything else is "loading" until its answer arrives.
  const [attempt, setAttempt] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; outcome: Outcome } | null>(null);
  const key = `${localDate}#${attempt}`;

  useEffect(() => {
    let active = true;
    loadToday({ repos, localDate, now: clock() }).then(
      (data) => active && setResult({ key, outcome: { status: 'ready', data } }),
      (error: unknown) => active && setResult({ key, outcome: { status: 'error', error } }),
    );
    return () => {
      active = false;
    };
  }, [repos, localDate, clock, key, refresh]);

  const reload = useCallback(() => setRefresh((n) => n + 1), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: TodayState = result && result.key === key ? result.outcome : { status: 'loading' };
  return { ...state, reload, retry };
}
