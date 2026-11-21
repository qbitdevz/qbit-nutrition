import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CameraHandle, CameraPermission, Photo } from '@/platform/scanPlatform';
import { AppText, Button, EmptyState, Icon, IconButton, PressableScale, ScreenFrame, TopBar, layout, radius, spacing } from '@/ui';
import { useServices } from '../startup/AppProvider';
import { TIP_COUNT_KEY, TIP_SHOWN_TIMES } from './constants';
import { useScanPlatform } from './ScanPlatformContext';

interface CaptureViewProps {
  /** A photo was taken or chosen. */
  onPhoto: (photo: Photo) => void;
  onClose: () => void;
  onManual: () => void;
}

const SHUTTER = 76;

/**
 * Flow B step 1: a full-screen viewfinder with shutter, gallery and flash, and the framing tip on the
 * first three openings. Camera permission is explained before it is asked, and a denied permission
 * leaves the gallery and manual entry working.
 */
export function CaptureView({ onPhoto, onClose, onManual }: CaptureViewProps) {
  const { t } = useTranslation();
  const platform = useScanPlatform();
  const [permission, setPermission] = useState<CameraPermission | null>(null);

  useEffect(() => {
    let active = true;
    platform.camera.getPermission().then(
      (result) => active && setPermission(result),
      () => active && setPermission({ status: 'denied', canAskAgain: false }),
    );
    return () => {
      active = false;
    };
  }, [platform]);

  const gallery = useGallery(onPhoto);

  if (permission === null) return <View style={styles.black} accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} />;
  if (permission.status === 'granted') return <Viewfinder onPhoto={onPhoto} onClose={onClose} onGallery={gallery.pick} galleryFailed={gallery.failed} />;

  const denied = permission.status === 'denied';
  return (
    <ScreenFrame header={<TopBar title={t('scan.title')} onBack={onClose} backLabel={t('common.close')} />}>
      <View style={styles.permission}>
        <EmptyState icon="scan" title={denied ? t('scan.permission.deniedTitle') : t('scan.permission.title')} body={denied ? t('scan.permission.deniedBody') : t('scan.permission.body')}>
          {denied ? (
            <Button label={t('scan.permission.openSettings')} icon="settings" onPress={() => void platform.camera.openSettings()} />
          ) : (
            <Button
              label={t('scan.permission.allow')}
              icon="scan"
              onPress={() => void platform.camera.requestPermission().then(setPermission, () => setPermission({ status: 'denied', canAskAgain: false }))}
            />
          )}
        </EmptyState>
        <Button label={t('scan.capture.gallery')} variant="secondary" icon="image" onPress={() => void gallery.pick()} />
        <Button label={t('scan.manual')} variant="secondary" icon="pencil" onPress={onManual} testID="add-manually" />
        {gallery.failed ? (
          <AppText variant="bodySm" tone="warning">
            {t('scan.capture.galleryError')}
          </AppText>
        ) : null}
      </View>
    </ScreenFrame>
  );
}

function useGallery(onPhoto: (photo: Photo) => void) {
  const platform = useScanPlatform();
  const [failed, setFailed] = useState(false);
  const pick = useCallback(async () => {
    setFailed(false);
    try {
      const photo = await platform.picker.pick();
      if (photo) onPhoto(photo);
    } catch {
      setFailed(true);
    }
  }, [platform, onPhoto]);
  return { pick, failed };
}

interface ViewfinderProps {
  onPhoto: (photo: Photo) => void;
  onClose: () => void;
  onGallery: () => Promise<void>;
  galleryFailed: boolean;
}

function Viewfinder({ onPhoto, onClose, onGallery, galleryFailed }: ViewfinderProps) {
  const { t } = useTranslation();
  const platform = useScanPlatform();
  const { repos } = useServices();
  const insets = useSafeAreaInsets();
  const handle = useRef<CameraHandle | null>(null);
  const [flash, setFlash] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Null until the counter is read, so the tip never flashes in and out.
  const [tip, setTip] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      let shown = 0;
      try {
        shown = Number((await repos.settings.get(TIP_COUNT_KEY)) ?? '0') || 0;
        await repos.settings.set(TIP_COUNT_KEY, String(shown + 1));
      } catch {
        // Without the counter the tip simply shows.
      }
      if (active) setTip(shown < TIP_SHOWN_TIMES);
    })();
    return () => {
      active = false;
    };
  }, [repos]);

  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => setFailed(true), []);
  const { Surface } = platform.camera;

  const shoot = async () => {
    if (!handle.current || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      onPhoto(await handle.current.capture());
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  if (tip === null) return <View style={styles.black} accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} />;

  return (
    <View style={styles.black} testID="viewfinder">
      <Surface flash={flash} handleRef={handle} onReady={onReady} onError={onError} />
      <View style={[styles.top, { paddingTop: Math.max(insets.top, spacing.s2) + spacing.s2 }]}>
        <View style={styles.round}>
          <IconButton icon="x" label={t('common.close')} onPress={onClose} />
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('scan.capture.flash')}
          accessibilityState={{ selected: flash }}
          onPress={() => setFlash((on) => !on)}
          style={[styles.flash, flash ? styles.flashOn : null]}>
          <Icon name="bolt" size={22} color={flash ? '#04070D' : '#FFFFFF'} filled={flash} />
          <AppText variant="bodySm" style={{ color: flash ? '#04070D' : '#FFFFFF' }} aria-hidden>
            {flash ? t('scan.capture.flashOn') : t('scan.capture.flashOff')}
          </AppText>
        </PressableScale>
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.s4) + spacing.s4 }]}>
        {tip ? (
          <View style={styles.tip} testID="scan-tip">
            <Icon name="info" size={18} color="#FFFFFF" />
            <AppText variant="bodySm" style={styles.tipText}>
              {t('scan.capture.tip')}
            </AppText>
          </View>
        ) : null}
        {failed || galleryFailed ? (
          <AppText variant="bodySm" tone="warning" style={styles.error} accessibilityRole="alert">
            {failed ? t('scan.capture.error') : t('scan.capture.galleryError')}
          </AppText>
        ) : null}
        <View style={styles.controls}>
          <View style={styles.side}>
            <View style={styles.round}>
              <IconButton icon="image" label={t('scan.capture.gallery')} onPress={() => void onGallery()} />
            </View>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('scan.capture.shutter')}
            accessibilityState={{ disabled: !ready || busy }}
            disabled={!ready || busy}
            onPress={() => void shoot()}
            style={[styles.shutter, !ready || busy ? styles.shutterWaiting : null]}>
            <View style={styles.shutterInner} />
          </PressableScale>
          <View style={styles.side} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000000' },
  permission: { paddingHorizontal: layout.screenMargin, gap: spacing.s3, paddingBottom: spacing.s6 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.s3 },
  round: { borderRadius: radius.pill, backgroundColor: 'rgba(4, 7, 13, 0.62)' },
  flash: {
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.s4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(4, 7, 13, 0.62)',
  },
  flashOn: { backgroundColor: '#FFC857' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: spacing.s4 },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(4, 7, 13, 0.72)',
  },
  tipText: { color: '#FFFFFF' },
  error: { textAlign: 'center', paddingHorizontal: spacing.s4 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: spacing.s6 },
  side: { width: layout.touchTarget + spacing.s2, alignItems: 'flex-start' },
  shutter: { width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterWaiting: { opacity: 0.5 },
  shutterInner: { width: SHUTTER - 18, height: SHUTTER - 18, borderRadius: (SHUTTER - 18) / 2, backgroundColor: '#FFFFFF' },
});
