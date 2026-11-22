import { useCallback, useEffect, useState } from 'react';

export type LoadState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

/**
 * Runs `load` whenever `key` changes and shows the loading state until its answer arrives. A change of
 * `refresh` reads again without the loading state (the data on screen stays until the new data
 * replaces it); `retry` restarts after a failure with the loading state. An answer for a key the
 * person already left is ignored.
 */
export function useLoad<T>(load: () => Promise<T>, key: string, refresh = 0): LoadState<T> & { retry: () => void; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [again, setAgain] = useState(0);
  const [result, setResult] = useState<{ key: string; state: Exclude<LoadState<T>, { status: 'loading' }> } | null>(null);
  const resultKey = `${key}#${attempt}`;

  useEffect(() => {
    let active = true;
    load().then(
      (data) => active && setResult({ key: resultKey, state: { status: 'ready', data } }),
      (error: unknown) => active && setResult({ key: resultKey, state: { status: 'error', error } }),
    );
    return () => {
      active = false;
    };
    // `load` closes over `key`; it is read when `key`, a retry or a refresh asks for a new read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey, refresh, again]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const reload = useCallback(() => setAgain((n) => n + 1), []);
  const state: LoadState<T> = result && result.key === resultKey ? result.state : { status: 'loading' };
  return { ...state, retry, reload };
}
