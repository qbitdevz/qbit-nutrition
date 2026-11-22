import { openServicesOnce } from './openServicesCore';
import type { AppServices } from './types';

/** The real startup sequence on a device; see `openServicesCore.ts`. (The web preview has its own: `openServices.web.ts`.) */
export function openAppServices(): Promise<AppServices> {
  return openServicesOnce();
}
