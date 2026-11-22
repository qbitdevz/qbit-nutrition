import { createFakeHealthPlatform, type FakeHealthPlatform } from '@/platform/fakeHealthPlatform';

/**
 * DEVELOPMENT ONLY (QN_DEV_ONLY_HEALTH_PLATFORM; browser preview): Health Connect does not exist in a browser, so the preview talks to the in-memory fake, with a
 * few weights from the last days to import. It is reachable from the browser console as `__qbitHealth.state` (for example
 * `__qbitHealth.state.failWrites = 1`, or `__qbitHealth.state.granted.writeNutrition = false`) to see the pending and revoked
 * states. Dropped from release bundles with `__DEV__`.
 */
export function createDevHealthPlatform(now: () => Date = () => new Date()): FakeHealthPlatform {
  const day = 86_400_000;
  const weights = [3, 6, 9, 14].map((ago, i) => ({ time: new Date(now().getTime() - ago * day).toISOString(), kg: 71.8 - i * 0.4 }));
  const platform = createFakeHealthPlatform({ weights });
  (globalThis as { __qbitHealth?: FakeHealthPlatform }).__qbitHealth = platform;
  return platform;
}
