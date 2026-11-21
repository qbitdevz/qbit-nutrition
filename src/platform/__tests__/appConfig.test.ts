/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';

const config = JSON.parse(readFileSync(path.resolve(__dirname, '../../../app.json'), 'utf8')) as {
  expo: { android?: { allowBackup?: boolean }; plugins?: unknown[] };
};

describe('app.json (docs/06 section 6)', () => {
  it('turns Android automatic backup off, so the database, photos and key store never reach cloud backup', () => {
    expect(config.expo.android?.allowBackup).toBe(false);
  });

  it('includes the secure-store plugin', () => {
    expect(config.expo.plugins).toContain('expo-secure-store');
  });
});
