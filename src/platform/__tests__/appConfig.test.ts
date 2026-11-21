/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';

const config = JSON.parse(readFileSync(path.resolve(__dirname, '../../../app.json'), 'utf8')) as {
  expo: { android?: { allowBackup?: boolean; blockedPermissions?: string[] }; plugins?: unknown[] };
};

describe('app.json (docs/06 section 6)', () => {
  it('turns Android automatic backup off, so the database, photos and key store never reach cloud backup', () => {
    expect(config.expo.android?.allowBackup).toBe(false);
  });

  it('includes the secure-store plugin', () => {
    expect(config.expo.plugins).toContain('expo-secure-store');
  });

  const plugin = (name: string) =>
    (config.expo.plugins ?? []).find((p) => (Array.isArray(p) ? p[0] === name : p === name)) as [string, Record<string, unknown>] | undefined;

  it('configures the camera for meal photos and product barcodes: no microphone, no audio recording, barcode reading on', () => {
    expect(plugin('expo-camera')?.[1]).toMatchObject({ microphonePermission: false, recordAudioAndroid: false, barcodeScannerEnabled: true });
  });

  it('asks for exactly two permissions by hand, both Health Connect: write nutrition and read weight (and none for location, contacts, storage, advertising id)', () => {
    const android = config.expo.android as { permissions?: string[] };
    expect([...(android.permissions ?? [])].sort()).toEqual(['android.permission.health.READ_WEIGHT', 'android.permission.health.WRITE_NUTRITION']);
  });

  it('adds the Health Connect config plugin (the permission-rationale entry points) and keeps the minimum Android at 8 (API 26)', () => {
    expect(config.expo.plugins).toContain('react-native-health-connect');
    expect(plugin('expo-build-properties')?.[1]).toMatchObject({ android: { minSdkVersion: 26 } });
  });

  it('allows plain HTTP at the Android level so a model on the own computer of the user can be reached; the app itself refuses HTTP to any host that is not local or private (core/ai/url.ts)', () => {
    // Android 9 and later block cleartext traffic unless the manifest allows it. The only destinations are the AI provider
    // (validated by core/ai/url.ts: HTTPS, or HTTP only to loopback and private addresses) and Open Food Facts (a fixed HTTPS URL).
    expect(plugin('expo-build-properties')?.[1]).toMatchObject({ android: { usesCleartextTraffic: true } });
  });

  it('gives the app a version code, which a release must raise so phones accept the update', () => {
    const android = config.expo.android as { versionCode?: number };
    expect(Number.isInteger(android.versionCode)).toBe(true);
  });

  it('keeps the gallery picker free of photo-library and microphone permissions', () => {
    expect(plugin('expo-image-picker')?.[1]).toMatchObject({ photosPermission: false, microphonePermission: false });
  });

  it('blocks the audio and legacy storage permissions that libraries would otherwise merge in', () => {
    expect(config.expo.android?.blockedPermissions).toEqual(
      expect.arrayContaining(['android.permission.RECORD_AUDIO', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE']),
    );
  });

  it('explains the camera use in plain words', () => {
    const text = String(plugin('expo-camera')?.[1]?.cameraPermission);
    expect(text).toMatch(/photograph your meals/);
    expect(text).toMatch(/barcodes/);
    expect(text).toMatch(/only when you choose/);
  });
});
