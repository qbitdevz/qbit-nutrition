import { ONBOARDED_KEY } from '../session/AppSession';

/**
 * Which `setting` rows travel in an export and which an import replaces.
 *
 * - The person's preferences (language, whether photos are kept, the minimum energy, the scan tip counter) are
 *   part of their data: they are exported and imported.
 * - Installation state is not theirs to move: when onboarding was finished here, and which bundled catalog is
 *   installed here (the catalog installer reads it at every start). These are neither exported nor replaced: an
 *   import keeps this installation's own values.
 * - Acknowledgements (`ai_notice_ack.<provider id>`: "this photo will be sent to [provider]") are consent given
 *   to a destination on one installation. They are neither exported nor imported, and an import removes the
 *   ones that exist, so the notice is shown again before the first scan with each imported provider.
 */

/** Same value as `CATALOG_MARKER_KEY` in `src/data/expo/catalogDatabase.ts` (a test keeps them equal; that module needs native code, so it is not imported here). */
export const CATALOG_MARKER_SETTING = 'catalog_asset_hash';

/** Prefix of the per-provider notice acknowledgement (`noticeKey` in `providerService.ts`). */
export const NOTICE_ACK_PREFIX = 'ai_notice_ack.';

const INSTALLATION_STATE: readonly string[] = [ONBOARDED_KEY, CATALOG_MARKER_SETTING];

export const isInstallationState = (key: string): boolean => INSTALLATION_STATE.includes(key);
export const isAcknowledgement = (key: string): boolean => key.startsWith(NOTICE_ACK_PREFIX);

/** True for a setting that is part of the person's data: it goes into an export and comes back with an import. */
export const isPortableSetting = (key: string): boolean => !isInstallationState(key) && !isAcknowledgement(key);

export function portableSettings(settings: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => isPortableSetting(key)));
}

/** The settings an import keeps from this installation: its own state, nothing else. */
export function keptSettings(settings: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => isInstallationState(key)));
}
