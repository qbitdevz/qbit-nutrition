/** The project's public page, as the contact in the User-Agent (Open Food Facts asks API clients to identify the app: `AppName/Version (contact)`). */
export const CONTACT_URL = 'https://github.com/qbitdevz/qbit-nutrition';

/** `QbitNutrition/0.0.1 (https://github.com/qbitdevz/qbit-nutrition)`: names the app and its version, and nothing about the person or the phone. */
export function barcodeUserAgent(version: string | undefined): string {
  return `QbitNutrition/${version && /^[\w.+-]{1,32}$/.test(version) ? version : '0'} (${CONTACT_URL})`;
}
