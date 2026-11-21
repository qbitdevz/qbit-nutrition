import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import type { MealWarning } from '@/core/ai';
import { useScanPlatform } from './ScanPlatformContext';

/** What the review needs to know about the scan it is showing. */
export interface ScanReview {
  scanId: string | null;
  dishName: string;
  /** The photo to show above the items. */
  photoUri: string;
  /** The compressed JPEG that is kept when the person chooses to keep photos. */
  preparedUri: string;
  mealWarnings: readonly MealWarning[];
}

export interface ScanSession {
  /** Set once a scan finished and its items are in the review; null otherwise. */
  review: ScanReview | null;
  /** Registers a temporary file (a capture, a gallery copy, a processed JPEG) to be deleted when the session ends. */
  track: (uri: string) => void;
  /** Deletes one temporary file now (Retake). */
  drop: (uri: string) => Promise<void>;
  startReview: (review: ScanReview) => void;
  /**
   * Ends the session: deletes every temporary file it still holds and forgets the review. Called when
   * the meal is saved, discarded, retaken, or the scan is closed or fails for good. Safe to call twice.
   */
  release: () => Promise<void>;
}

const SessionContext = createContext<ScanSession | null>(null);

export function useScanSession(): ScanSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useScanSession must be used under a ScanSessionProvider');
  return session;
}

/**
 * Owns the temporary files of the scan in progress. They live in the device cache; whatever happens to
 * the scan (saved, canceled, failed, discarded) ends in `release`, which deletes them.
 */
export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const { files } = useScanPlatform();
  const tracked = useRef(new Set<string>());
  const [review, setReview] = useState<ScanReview | null>(null);

  const drop = useCallback(
    async (uri: string) => {
      tracked.current.delete(uri);
      await files.discard(uri).catch(() => undefined);
    },
    [files],
  );

  const release = useCallback(async () => {
    const uris = [...tracked.current];
    tracked.current.clear();
    setReview(null);
    await Promise.all(uris.map((uri) => files.discard(uri).catch(() => undefined)));
  }, [files]);

  const value = useMemo<ScanSession>(
    () => ({
      review,
      track: (uri) => void tracked.current.add(uri),
      drop,
      startReview: setReview,
      release,
    }),
    [review, drop, release],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
