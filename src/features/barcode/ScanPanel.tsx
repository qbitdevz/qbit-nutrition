import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { parseBarcode } from '@/core/barcode';
import type { CameraPermission } from '@/platform/scanPlatform';
import { AppText, Button, EmptyState, IconButton, TextField, radius, spacing, useTheme } from '@/ui';
import { useScanPlatform } from '../scan/ScanPlatformContext';

interface ScanPanelProps {
  /** A valid barcode (typed or scanned), as the lookup code. The panel never sends anything itself. */
  onCode: (code: string) => void;
  /** The code to show in the field again (after a failed lookup the person comes back to what they typed). */
  initialText?: string;
  /** A lookup is waiting for the person (the notice is open): the camera's reads are ignored meanwhile. */
  paused?: boolean;
}

const REASON_KEY = {
  empty: 'barcode.errors.empty',
  not_digits: 'barcode.errors.digits',
  length: 'barcode.errors.length',
  check_digit: 'barcode.errors.check',
} as const;

const FRAME_HEIGHT = 220;

/**
 * Step 1 of the barcode flow: the camera reads the barcode on its own, or the person types the number. The camera
 * is optional: denied, broken or not wanted, the field below it does everything. Typing never calls the service:
 * a lookup starts only from "Look up product" (or a read from the camera) after the check digit is valid.
 */
export function ScanPanel({ onCode, initialText = '', paused = false }: ScanPanelProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const platform = useScanPlatform();
  const [permission, setPermission] = useState<CameraPermission | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [torch, setTorch] = useState(false);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [scanProblem, setScanProblem] = useState(false);
  const handled = useRef(false);
  const lastBad = useRef('');

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

  const validate = (value: string): { code: string | null; message: string | null } => {
    const parsed = parseBarcode(value);
    return parsed.ok ? { code: parsed.code, message: null } : { code: null, message: t(REASON_KEY[parsed.reason]) };
  };

  const submit = () => {
    const { code, message } = validate(text);
    setError(message);
    if (code) onCode(code);
  };

  // The camera keeps reading while it is on screen: the first valid read is taken, the rest are ignored.
  const onScanned = useCallback(
    ({ code }: { code: string }) => {
      if (handled.current || paused) return;
      const parsed = parseBarcode(code);
      if (!parsed.ok) {
        if (lastBad.current !== code) {
          lastBad.current = code;
          setScanProblem(true);
        }
        return;
      }
      handled.current = true;
      setScanProblem(false);
      onCode(parsed.code);
    },
    [onCode, paused],
  );
  // A read that is not used (the notice was declined) can be made again.
  useEffect(() => {
    if (!paused) handled.current = false;
  }, [paused]);

  const onReady = useCallback(() => undefined, []);
  const onError = useCallback(() => setCameraFailed(true), []);
  const { BarcodeSurface } = platform.camera;

  const granted = permission?.status === 'granted';
  const denied = permission?.status === 'denied';

  return (
    <View style={styles.root}>
      {permission === null ? (
        <View style={[styles.frame, { backgroundColor: colors.surface }]} accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} />
      ) : granted && !cameraFailed ? (
        <View style={styles.cameraBlock}>
          <View style={[styles.frame, { backgroundColor: '#000000' }]} accessibilityLabel={t('barcode.cameraLabel')} testID="barcode-camera">
            <BarcodeSurface torch={torch} onScanned={onScanned} onReady={onReady} onError={onError} />
            <View pointerEvents="none" style={styles.guideWrap}>
              <View style={styles.guide} />
            </View>
            <View style={styles.torch}>
              <IconButton icon="bolt" label={torch ? t('barcode.torchOn') : t('barcode.torch')} onPress={() => setTorch((on) => !on)} testID="barcode-torch" />
            </View>
          </View>
          <AppText variant="bodySm" tone="muted" style={styles.center}>
            {t('barcode.frameHint')}
          </AppText>
        </View>
      ) : granted && cameraFailed ? (
        <AppText variant="bodyMd" tone="warning" accessibilityRole="alert" testID="barcode-camera-error">
          {t('barcode.cameraError')}
        </AppText>
      ) : (
        <EmptyState icon="scan" title={denied ? t('barcode.permission.deniedTitle') : t('barcode.permission.title')} body={denied ? t('barcode.permission.deniedBody') : t('barcode.permission.body')}>
          {denied ? (
            <Button label={t('barcode.permission.openSettings')} icon="settings" onPress={() => void platform.camera.openSettings()} />
          ) : (
            <Button
              label={t('barcode.permission.allow')}
              icon="scan"
              onPress={() => void platform.camera.requestPermission().then(setPermission, () => setPermission({ status: 'denied', canAskAgain: false }))}
              testID="barcode-allow-camera"
            />
          )}
        </EmptyState>
      )}

      {scanProblem ? (
        <AppText variant="bodySm" tone="warning" accessibilityRole="alert">
          {t('barcode.errors.scanned')}
        </AppText>
      ) : null}

      <View style={styles.manual}>
        <AppText variant="heading" accessibilityRole="header">
          {t('barcode.manualTitle')}
        </AppText>
        <TextField
          label={t('barcode.manualLabel')}
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (error) setError(null);
          }}
          onBlur={() => setError(text.trim() === '' ? null : validate(text).message)}
          onSubmitEditing={submit}
          error={error}
          hint={t('barcode.manualHint')}
          keyboardType="number-pad"
          returnKeyType="search"
          maxLength={17}
          testID="barcode-input"
        />
        <Button label={t('barcode.lookup')} icon="search" onPress={submit} testID="barcode-lookup" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.s4 },
  cameraBlock: { gap: spacing.s2 },
  frame: { height: FRAME_HEIGHT, borderRadius: radius.xl, overflow: 'hidden' },
  guideWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  guide: { width: '72%', height: '46%', borderRadius: radius.lg, borderWidth: 3, borderColor: '#FFFFFF' },
  torch: { position: 'absolute', top: spacing.s2, right: spacing.s2, borderRadius: radius.pill, backgroundColor: 'rgba(4, 7, 13, 0.62)' },
  center: { textAlign: 'center' },
  manual: { gap: spacing.s3 },
});
