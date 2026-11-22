import type { SettingsRepository } from '@/data';
import { KEEP_PHOTOS_KEY } from './constants';

/** Whether scanned photos are kept after saving (S9, FR-28). On unless the person turned it off. */
export async function readKeepPhotos(settings: Pick<SettingsRepository, 'get'>): Promise<boolean> {
  return (await settings.get(KEEP_PHOTOS_KEY)) !== 'false';
}

export function writeKeepPhotos(settings: Pick<SettingsRepository, 'set'>, keep: boolean): Promise<void> {
  return settings.set(KEEP_PHOTOS_KEY, keep ? 'true' : 'false');
}
