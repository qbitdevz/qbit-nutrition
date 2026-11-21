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

  it('asks for no permission beyond the camera for it, and none for the network lookup (INTERNET is not a runtime permission)', () => {
    const android = config.expo.android as { permissions?: string[] };
    expect(android.permissions).toBeUndefined(); // nothing added by hand: no location, contacts, storage, advertising id
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
