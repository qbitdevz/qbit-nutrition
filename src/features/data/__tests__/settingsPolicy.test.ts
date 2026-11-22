/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ONBOARDED_KEY } from '../../session/AppSession';
import { importedKey, noticeKey } from '../../settings/providerService';
import { CATALOG_MARKER_SETTING, IMPORTED_PROVIDER_PREFIX, NOTICE_ACK_PREFIX, isPortableSetting, keptSettings, portableSettings } from '../settingsPolicy';

describe('which settings travel', () => {
  it('keeps the names equal to the ones the app writes', () => {
    expect(isPortableSetting(ONBOARDED_KEY)).toBe(false);
    expect(noticeKey('some-id').startsWith(NOTICE_ACK_PREFIX)).toBe(true);
    expect(importedKey('some-id').startsWith(IMPORTED_PROVIDER_PREFIX)).toBe(true);
    expect(isPortableSetting(importedKey('some-id'))).toBe(false); // local state about this installation's profiles: never exported
    // The catalog installer needs native modules, so its constant is read from the source instead of imported.
    const source = readFileSync(path.resolve(__dirname, '../../../data/expo/catalogDatabase.ts'), 'utf8');
    expect(source).toContain(`CATALOG_MARKER_KEY = '${CATALOG_MARKER_SETTING}'`);
  });

  it('exports preferences and leaves out installation state and acknowledgements', () => {
    const all = { locale: 'es', keep_photos: 'false', minimum_daily_kcal: '1400', [ONBOARDED_KEY]: 'x', [CATALOG_MARKER_SETTING]: 'h', [noticeKey('p1')]: 'x' };
    expect(portableSettings(all)).toEqual({ locale: 'es', keep_photos: 'false', minimum_daily_kcal: '1400' });
    expect(keptSettings(all)).toEqual({ [ONBOARDED_KEY]: 'x', [CATALOG_MARKER_SETTING]: 'h' });
  });

  it('treats the barcode and suggestion notices as acknowledgements: consent stays on the installation that gave it', () => {
    const all = { locale: 'en', 'notice_ack.barcode': 'x', 'notice_ack.suggest.p1': 'x' };
    expect(isPortableSetting('notice_ack.barcode')).toBe(false);
    expect(portableSettings(all)).toEqual({ locale: 'en' });
    expect(keptSettings(all)).toEqual({});
  });
});
