/// <reference types="node" />
/**
 * Test-only helpers shared by the data-ownership tests: a data service over a harness database with a fake
 * device, JPEG-looking bytes, and a way to hand an exported file to the picker. Never import this from app code.
 */
import { unzipSync, strFromU8 } from 'fflate';

import type { Harness } from '@/data/testing/harness';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { createTestServices } from './testServices';
import { createDataService, type DataService, type PreparedImport } from '../data/dataService';

export const NOW = new Date('2026-11-21T12:00:00.000Z');

export interface Device {
  h: Harness;
  services: ReturnType<typeof createTestServices>;
  platform: FakeDataPlatform;
  service: DataService;
  /** Cleanups the service asked to run later (the delayed removal of the export file). */
  scheduled: { run: () => void; ms: number }[];
}

export function createDevice(h: Harness, options: { nowMs?: () => number } = {}): Device {
  const services = createTestServices(h);
  const platform = createFakeDataPlatform();
  const scheduled: Device['scheduled'] = [];
  const service = createDataService({
    repos: h.repos,
    providers: services.providers,
    platform,
    appVersion: '1.0.0',
    now: () => new Date(NOW),
    nowMs: options.nowMs,
    schedule: (run, ms) => scheduled.push({ run, ms }),
  });
  return { h, services, platform, service, scheduled };
}

/** Bytes that start like a JPEG (the importer checks the signature); `n` makes each one different. */
export const jpeg = (n: number): Uint8Array => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, n, n, n, n]);

/** The last thing the share sheet received. */
export function lastShared(device: Device) {
  const file = device.platform.state.shared[device.platform.state.shared.length - 1];
  if (!file) throw new Error('Nothing was shared.');
  return file;
}

/** Hands bytes to the picker as the next chosen file and reads them like the import screen does. */
export async function pickAndPrepare(device: Device, name: string, bytes: Uint8Array): Promise<PreparedImport> {
  device.platform.state.nextPick = { name, bytes };
  const picked = await device.platform.picker.pick();
  return device.service.prepareImport(picked!);
}

/** The JSON text of an exported file, whether it is a plain JSON file or a ZIP. */
export function documentText(bytes: Uint8Array): string {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  return isZip ? strFromU8(unzipSync(bytes)['qbit-nutrition-export.json']!) : strFromU8(bytes);
}

/** All the bytes that could carry a secret: the file as written and, for a ZIP, every entry unpacked. */
export function everyByteOf(bytes: Uint8Array): Buffer[] {
  const out = [Buffer.from(bytes)];
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) for (const entry of Object.values(unzipSync(bytes))) out.push(Buffer.from(entry));
  return out;
}
