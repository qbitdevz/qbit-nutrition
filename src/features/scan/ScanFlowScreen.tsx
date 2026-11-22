import { destinationOf } from '../settings/destination';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import type { AiProvider } from '@/data';
import type { Locale } from '@/i18n/locale';
import type { Photo, PreparedPhoto } from '@/platform/scanPlatform';
import { useSnackbar } from '@/ui';
import { useMealDraft } from '../logging/draft';
import { useServices } from '../startup/AppProvider';
import { analyzePhoto } from './analyzeScan';
import { AnalyzingView } from './AnalyzingView';
import { CaptureView } from './CaptureView';
import { SLOW_AFTER_MS } from './constants';
import { FailureView, type FailureAction } from './FailureView';
import type { ScanFailure } from './failures';
import { NoticeSheet } from './NoticeSheet';
import { PreviewView } from './PreviewView';
import { createScanDeps } from './scanDeps';
import { useScanPlatform } from './ScanPlatformContext';
import { useScanSession } from './ScanSession';

/** DEVELOPMENT ONLY: scenario picker of the browser preview's fake provider. `__DEV__` is false in release builds, so Metro drops the require. */
const DevScanPanel: typeof import('./dev/DevScanPanel').DevScanPanel | null =
  __DEV__ && Platform.OS === 'web'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('./dev/DevScanPanel') as typeof import('./dev/DevScanPanel')).DevScanPanel
    : null;

type Phase = 'capture' | 'preview' | 'analyzing' | 'failed';

interface ScanFlowScreenProps {
  /** Leaves the scan without a result (close, "Retry later"). */
  onClose: () => void;
  /** "Add manually": opens the food search. */
  onManual: () => void;
  /** Opens the provider settings on top of the scan, which stays as it is underneath. */
  onProviderSettings: () => void;
  /** A scan finished: its items are in the draft and the review screen takes over. */
  onReview: () => void;
  /** How long Analyzing waits before saying the provider is slow; tests shorten it. */
  slowAfterMs?: number;
}

/**
 * The scan flow of docs/04 flow B and C: camera or gallery, preview with a hint, the one-time notice,
 * Analyzing with Cancel, and the failure screens. The work itself is `analyzePhoto`; this screen holds
 * the state between those steps and the temporary photo files, which end in `ScanSession.release`
 * whenever the flow ends without handing a result to the review.
 */
export function ScanFlowScreen({ onClose, onManual, onProviderSettings, onReview, slowAfterMs = SLOW_AFTER_MS }: ScanFlowScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const services = useServices();
  const platform = useScanPlatform();
  const session = useScanSession();
  const draft = useMealDraft();
  const snackbar = useSnackbar();

  const [phase, setPhase] = useState<Phase>('capture');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [hint, setHint] = useState('');
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  const [notice, setNotice] = useState<AiProvider | null>(null);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [checking, setChecking] = useState(false);

  const prepared = useRef<PreparedPhoto | null>(null);
  const controller = useRef<AbortController | null>(null);
  const handedOff = useRef(false);
  const alive = useRef(true);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Leaving by any road (back gesture included) cancels a request in flight and removes the temporary files, unless the review took them over.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
      if (!handedOff.current) void sessionRef.current.release();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [phase, slowAfterMs]);

  const takePhoto = useCallback(
    (taken: Photo) => {
      session.track(taken.uri);
      prepared.current = null;
      setHint('');
      setPhoto(taken);
      setPhase('preview');
    },
    [session],
  );

  const retake = async () => {
    const files = [photo?.uri, prepared.current?.uri].filter((uri): uri is string => Boolean(uri));
    prepared.current = null;
    setPhoto(null);
    setFailure(null);
    setPhase('capture');
    await Promise.all(files.map((uri) => session.drop(uri)));
  };

  const run = async (current: Photo) => {
    const abort = new AbortController();
    controller.current = abort;
    setFailure(null);
    setSlow(false);
    setPhase('analyzing');
    const outcome = await analyzePhoto(createScanDeps(services, platform), { photo: current, prepared: prepared.current, hint, locale, signal: abort.signal });
    if (!alive.current) {
      // The screen was left while the request ran: the session is already released, so a file made since is removed here.
      if (outcome.prepared) void platform.files.discard(outcome.prepared.uri).catch(() => undefined);
      return;
    }
    if (outcome.prepared) {
      prepared.current = outcome.prepared;
      session.track(outcome.prepared.uri);
    }
    setChecking(false);
    if (outcome.kind === 'cancelled') return setPhase('preview');
    if (outcome.kind === 'failed') {
      setFailure(outcome.failure);
      return setPhase('failed');
    }
    draft.loadScan(outcome.items);
    session.startReview({
      scanId: outcome.scanId,
      dishName: outcome.dishName,
      photoUri: current.uri,
      preparedUri: outcome.prepared.uri,
      mealWarnings: outcome.mealWarnings,
    });
    handedOff.current = true;
    onReview();
  };

  /** "Analyze": nothing is sent before the person has acknowledged where the photo goes (S4). */
  const analyze = async () => {
    if (!photo || checking) return;
    setChecking(true);
    const provider = await services.scan.activeProvider().catch(() => null);
    setProviderLabel(provider ? destinationOf(provider) : null);
    if (provider && !(await services.scan.noticeAcknowledged(provider.id).catch(() => false))) {
      setNotice(provider);
      return setChecking(false);
    }
    await run(photo);
  };

  const acknowledge = async () => {
    const provider = notice;
    if (!provider || !photo) return;
    setNotice(null);
    // If the acknowledgement cannot be written the person still agreed just now; the notice will come again next time.
    await services.scan.acknowledgeNotice(provider.id).catch(() => undefined);
    setChecking(true);
    await run(photo);
  };

  const decline = () => {
    setNotice(null);
    setChecking(false);
  };

  const cancel = () => controller.current?.abort();

  const leave = (then: () => void) => {
    void session.release();
    then();
  };

  const onFailureAction = (action: FailureAction) => {
    if (!photo) return;
    switch (action) {
      case 'retry':
        return void run(photo);
      case 'retake':
        return void retake();
      case 'providerSettings':
      case 'setupProvider':
      case 'switchProvider':
        return onProviderSettings();
      case 'copyDetail':
        return void platform.clipboard.copy(failure?.detail ?? '').then(() => snackbar.show({ message: t('scan.failure.copied') }), () => undefined);
      case 'retryLater':
        return leave(onClose);
      case 'manual':
        return leave(onManual);
    }
  };

  if (phase === 'capture' || !photo) {
    return (
      <>
        <CaptureView onPhoto={takePhoto} onClose={() => leave(onClose)} onManual={() => leave(onManual)} />
        {DevScanPanel ? <DevScanPanel /> : null}
      </>
    );
  }

  return (
    <>
      {DevScanPanel ? <DevScanPanel /> : null}
      {phase === 'preview' ? (
        <PreviewView photoUri={photo.uri} hint={hint} onHint={setHint} onRetake={() => void retake()} onAnalyze={() => void analyze()} onClose={() => leave(onClose)} busy={checking} />
      ) : null}
      {phase === 'analyzing' ? <AnalyzingView photoUri={photo.uri} providerLabel={providerLabel} slow={slow} onCancel={cancel} /> : null}
      {phase === 'failed' && failure ? <FailureView failure={failure} photoUri={photo.uri} onAction={onFailureAction} onClose={() => leave(onClose)} /> : null}
      <NoticeSheet provider={notice ? destinationOf(notice) : null} onContinue={() => void acknowledge()} onDecline={decline} />
    </>
  );
}
