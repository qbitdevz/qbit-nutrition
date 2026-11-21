import { CONTACT_URL, barcodeUserAgent } from '../userAgent';

describe('the User-Agent Open Food Facts asks API clients to send (AppName/Version (contact))', () => {
  it('names the app, its version and the project page, and nothing about the person or the phone', () => {
    expect(barcodeUserAgent('0.0.1')).toBe('QbitNutrition/0.0.1 (https://github.com/qbitdevz/qbit-nutrition)');
    expect(CONTACT_URL).toMatch(/^https:\/\/github\.com\/qbitdevz\/qbit-nutrition$/);
  });

  it('falls back to a plain version when the app version is missing or odd, so no stray text reaches a header', () => {
    expect(barcodeUserAgent(undefined)).toBe(`QbitNutrition/0 (${CONTACT_URL})`);
    expect(barcodeUserAgent('1.0\r\nX-Injected: yes')).toBe(`QbitNutrition/0 (${CONTACT_URL})`);
    expect(barcodeUserAgent('')).toBe(`QbitNutrition/0 (${CONTACT_URL})`);
  });
});
