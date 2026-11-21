/// <reference types="node" />
import { strFromU8, strToU8, zipSync } from 'fflate';

import { createHarness, type Harness } from '@/data/testing/harness';
import { seedEverything } from '../../testing/backupSeed';
import { createDevice, fullState, jpeg, lastShared, type Device } from '../../testing/dataKit';

let a: Harness;
let b: Harness;
let from: Device;
beforeEach(async () => {
  a = await createHarness();
  b = await createHarness();
  from = createDevice(a);
  await seedEverything(a, { photoPath: 'photos/src-1.jpg' });
});
afterEach(() => {
  from.services.close();
  a.close();
  b.close();
});

async function documentText() {
  await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
  return strFromU8(lastShared(from).bytes);
}

/** A destination with data of its own, so "nothing was written" means something. */
async function destination(limits: Parameters<typeof createDevice>[1] = {}) {
  await seedEverything(b, { photoPath: 'photos/dest-1.jpg' });
  const device = createDevice(b, limits);
  device.platform.addPhoto('photos/dest-1.jpg', jpeg(7));
  return device;
}

async function pick(device: Device, name: string, bytes: Uint8Array, size?: number | null) {
  device.platform.state.nextPick = { name, bytes };
  const picked = (await device.platform.picker.pick())!;
  return device.service.prepareImport(size === undefined ? picked : { ...picked, size });
}

/** The byte range of one entry's compressed data in a ZIP made by `zipSync` (local header: 30 bytes, the name, then the data). */
function dataOf(zip: Uint8Array, name: string): [number, number] {
  const at = Buffer.from(zip).indexOf(Buffer.from(name));
  const start = at + name.length;
  const view = new DataView(zip.buffer, zip.byteOffset);
  const compressed = view.getUint32(at - 30 + 18, true);
  return [start, start + compressed];
}

describe('importing a ZIP unpacks only what the document needs (S3)', () => {
  it('never unpacks an entry the document does not name: a corrupt one is simply ignored', async () => {
    const text = await documentText();
    const zip = zipSync({ 'qbit-nutrition-export.json': strToU8(text), 'photos/unreferenced.jpg': [strToU8('x'.repeat(2000)), { level: 6 }] });
    const [start, end] = dataOf(zip, 'photos/unreferenced.jpg');
    zip.fill(0xff, start, end); // an invalid deflate stream: unpacking it would fail
    const device = await destination();
    const prepared = await pick(device, 'x.zip', zip);
    expect(prepared.preview.counts.photos).toBe(0);
    device.services.close();
  });

  it('keeps only the photos the document names, however many the ZIP holds', async () => {
    const doc = JSON.parse(await documentText());
    doc.meals[1].photo_path = 'photos/one.jpg';
    const zip = zipSync({ 'qbit-nutrition-export.json': strToU8(JSON.stringify(doc)), 'photos/one.jpg': jpeg(1), 'photos/two.jpg': jpeg(2), 'photos/three.jpg': jpeg(3) });
    const device = await destination();
    const prepared = await pick(device, 'x.zip', zip);
    expect([...prepared.photos.keys()]).toEqual(['photos/one.jpg']);
    device.services.close();
  });
});

describe('sizes are checked before the bytes are read or unpacked (S3)', () => {
  it('refuses a file the picker did not size, by asking the platform for its size before reading it', async () => {
    const device = await destination({ limits: { maxFileBytes: 100 } });
    const before = await fullState(device);
    device.platform.state.reportSize = false;
    await expect(pick(device, 'big.bin', new Uint8Array(500))).rejects.toMatchObject({ code: 'too_large' });
    expect(device.platform.state.readCount).toBe(0);
    expect(device.platform.state.cache.size).toBe(0);
    expect(await fullState(device)).toEqual(before);
    device.services.close();
  });

  it('refuses a document larger than the limit, plain or inside a ZIP, with its own message', async () => {
    const text = await documentText();
    const device = await destination({ limits: { maxDocumentBytes: 500 } });
    const before = await fullState(device);
    await expect(pick(device, 'x.json', strToU8(text))).rejects.toMatchObject({ code: 'archive_too_large' });
    await expect(pick(device, 'x.zip', zipSync({ 'qbit-nutrition-export.json': strToU8(text) }))).rejects.toMatchObject({ code: 'archive_too_large' });
    expect(await fullState(device)).toEqual(before);
    device.services.close();
  });

  it('refuses a ZIP whose referenced photos together unpack to more than the total allowed', async () => {
    const doc = JSON.parse(await documentText());
    doc.meals[0].photo_path = 'photos/one.jpg';
    doc.meals[1].photo_path = 'photos/two.jpg';
    const json = JSON.stringify(doc);
    const zip = zipSync({ 'qbit-nutrition-export.json': strToU8(json), 'photos/one.jpg': jpeg(1), 'photos/two.jpg': jpeg(2) });
    // Each photo alone is fine; the document plus both is one byte over.
    const device = await destination({ limits: { maxTotalBytes: strToU8(json).byteLength + jpeg(1).byteLength * 2 - 1 } });
    const before = await fullState(device);
    await expect(pick(device, 'x.zip', zip)).rejects.toMatchObject({ code: 'archive_too_large' });
    expect(await fullState(device)).toEqual(before);
    device.services.close();
  });

  it('refuses a referenced photo larger than a photo may be, naming it', async () => {
    const doc = JSON.parse(await documentText());
    doc.meals[0].photo_path = 'photos/big.jpg';
    const big = new Uint8Array(300);
    big.set([0xff, 0xd8, 0xff]);
    const device = await destination({ limits: { maxPhotoBytes: 200 } });
    await expect(pick(device, 'x.zip', zipSync({ 'qbit-nutrition-export.json': strToU8(JSON.stringify(doc)), 'photos/big.jpg': [big, { level: 0 }] }))).rejects.toMatchObject({ code: 'photo_invalid', where: 'photos/big.jpg' });
    device.services.close();
  });

  it('accepts everything at the default limits', async () => {
    const device = await destination();
    await expect(pick(device, 'x.json', strToU8(await documentText()))).resolves.toBeDefined();
    device.services.close();
  });
});
