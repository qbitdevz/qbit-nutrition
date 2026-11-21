/// <reference types="node" />
import { strFromU8, strToU8, zipSync } from 'fflate';
import { eq } from 'drizzle-orm';

import { aiProvider } from '@/data/schema';
import { createHarness, type Harness } from '@/data/testing/harness';
import { isValidSecretId } from '@/platform/secretStore';
import { seedEverything } from '../../testing/backupSeed';
import { createDevice, fullState, jpeg, lastShared, pickAndPrepare, type Device } from '../../testing/dataKit';

let a: Harness; // the phone the file comes from
let b: Harness; // the installation that imports
let from: Device;
let to: Device;
beforeEach(async () => {
  a = await createHarness();
  b = await createHarness();
  from = createDevice(a);
  to = createDevice(b);
});
afterEach(() => {
  from.services.close();
  to.services.close();
  a.close();
  b.close();
});

const OLD_KEY = 'sk-old-key-for-the-old-host-0123456789';

/** An export of `a`, as the text of its document. */
async function exportedDocument() {
  await seedEverything(a, { photoPath: 'photos/src-1.jpg' });
  from.platform.addPhoto('photos/src-1.jpg', jpeg(1));
  await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
  return JSON.parse(strFromU8(lastShared(from).bytes));
}

/** The destination has its own provider with a key; the file is edited to reuse that provider's id for another host. */
async function reuseIdForAnotherHost(base?: Awaited<ReturnType<typeof exportedDocument>>) {
  const doc = base ? structuredClone(base) : await exportedDocument();
  const local = await b.repos.aiProviders.create({ label: 'Mine', preset: null, adapter: 'openai_compatible', baseUrl: 'https://trusted.example.com/v1', model: 'm', timeoutS: 30 });
  await to.services.secrets.set(local.id, OLD_KEY);
  doc.ai_providers[0].id = local.id;
  doc.ai_providers[0].base_url = 'https://other-host.example.net/v1';
  return { doc, local };
}

const prepare = (doc: unknown) => pickAndPrepare(to, 'edited.json', strToU8(JSON.stringify(doc)));

/** The invariant of S4: a profile that came from an import is never paired with a key that existed before it. */
async function expectNoImportedProfileHasAKey(preexisting: readonly string[]) {
  for (const row of b.db.select().from(aiProvider).all()) {
    if (preexisting.includes(row.id)) continue;
    expect({ id: row.id, hasKey: await to.services.secrets.has(row.id), key: await to.services.secrets.get(row.id) }).toEqual({ id: row.id, hasKey: false, key: null });
  }
}

describe('an import can never pair a stored key with a profile it was not entered for (S4)', () => {
  it('imported profiles get fresh ids, even when the file reuses the id of a profile that has a key', async () => {
    const { doc, local } = await reuseIdForAnotherHost();
    const prepared = await prepare(doc);
    jest.spyOn(to.services.secrets, 'remove').mockRejectedValue(new Error('keystore')); // the cleanup after the commit fails
    const result = await to.service.applyImport(prepared);

    const rows = b.db.select().from(aiProvider).all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).not.toContain(local.id);
    expect(rows.every((r) => isValidSecretId(r.id))).toBe(true);
    expect((await to.services.providers.list()).map((p) => p.hasKey)).toEqual([false, false]);
    expect(result.leftovers.keys).toBe(true);
    // The old key is still stored, but under an id no profile has: it is an orphan, not a pairing.
    expect(await to.services.secrets.get(local.id)).toBe(OLD_KEY);
    expect(b.db.select().from(aiProvider).where(eq(aiProvider.id, local.id)).all()).toEqual([]);
  });

  it('the orphan key is removed at the next start', async () => {
    const { doc, local } = await reuseIdForAnotherHost();
    const prepared = await prepare(doc);
    jest.spyOn(to.services.secrets, 'remove').mockRejectedValueOnce(new Error('keystore'));
    await to.service.applyImport(prepared);
    jest.restoreAllMocks();
    expect(await to.services.secrets.has(local.id)).toBe(true);
    await to.service.sweepStartup();
    expect(await to.services.secrets.list()).toEqual([]);
  });

  it('holds after a failure or a kill at any step: before the commit nothing changes at all, after it no imported profile has a key', async () => {
    const steps: { name: string; arm: () => void; committed: boolean }[] = [
      { name: 'the first photo cannot be stored', arm: () => (to.platform.state.failPhotoWriteAt = 1), committed: false },
      { name: 'the database write fails midway', arm: () => b.client.exec(`CREATE TRIGGER boom BEFORE INSERT ON setting BEGIN SELECT RAISE(ABORT, 'injected'); END`), committed: false },
      { name: 'old photos cannot be removed after the commit', arm: () => to.platform.state.failPhotoRemove.add('photos/dest-1.jpg'), committed: true },
      { name: 'old keys cannot be removed after the commit', arm: () => void jest.spyOn(to.services.secrets, 'remove').mockRejectedValue(new Error('keystore')), committed: true },
      {
        name: 'the process dies right after the commit (nothing after it runs)',
        arm: () => {
          jest.spyOn(to.services.secrets, 'remove').mockRejectedValue(new Error('killed'));
          to.platform.state.failPhotoRemove.add('photos/dest-1.jpg');
        },
        committed: true,
      },
    ];
    const base = await exportedDocument();
    for (const step of steps) {
      const { doc, local } = await reuseIdForAnotherHost(base);
      await seedEverything(b, { photoPath: 'photos/dest-1.jpg' }); // the destination has data of its own too
      to.platform.addPhoto('photos/dest-1.jpg', jpeg(7));
      // Use a document with a photo, so a photo write really happens.
      doc.meals[1].photo_path = 'photos/src-1.jpg';
      const zip = zipSync({ 'qbit-nutrition-export.json': strToU8(JSON.stringify(doc)), 'photos/src-1.jpg': jpeg(3) });
      to.platform.state.nextPick = { name: 'edited.zip', bytes: zip };
      const prepared = await to.service.prepareImport((await to.platform.picker.pick())!);
      const before = await fullState(to);
      step.arm();
      const outcome = await to.service.applyImport(prepared).then(() => 'committed', () => 'refused');
      b.client.exec('DROP TRIGGER IF EXISTS boom');
      jest.restoreAllMocks();
      to.platform.state.failPhotoWriteAt = null;
      to.platform.state.failPhotoRemove.clear();

      expect({ step: step.name, outcome }).toEqual({ step: step.name, outcome: step.committed ? 'committed' : 'refused' });
      if (!step.committed) expect({ step: step.name, state: await fullState(to) }).toEqual({ step: step.name, state: before });
      await expectNoImportedProfileHasAKey(step.committed ? [] : [local.id]);

      // Reset for the next step: a clean destination again.
      await to.service.deleteAll({ confirmation: 'DELETE' });
    }
  });
});

describe('an id the secure store would refuse never blocks anything (S4)', () => {
  it('an id in the file that cannot hold a key is replaced by a valid one on import', async () => {
    const doc = await exportedDocument();
    doc.ai_providers[0].id = 'bad id/with slash';
    await to.service.applyImport(await prepare(doc));
    const ids = b.db.select().from(aiProvider).all().map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect(ids.every(isValidSecretId)).toBe(true);
    // And such a profile can receive a key like any other.
    await to.services.secrets.set(ids[0]!, 'a-new-key-for-it');
    expect(await to.services.secrets.has(ids[0]!)).toBe(true);
  });

  it('a profile whose id was stored by an older import can still be removed, and "Delete all" still works', async () => {
    await seedEverything(b);
    b.client.exec(`UPDATE ai_provider SET id = 'bad id/with slash' WHERE label = 'Local'`);
    await to.services.providers.remove('bad id/with slash');
    expect(b.db.select().from(aiProvider).all().map((r) => r.label)).toEqual(['Main']);

    b.client.exec(`INSERT INTO ai_provider (id, label, adapter, base_url, model, timeout_s, is_active) VALUES ('another/bad id', 'X', 'gemini', 'https://x.example.com', 'm', 30, 0)`);
    await expect(to.service.deleteAll({ confirmation: 'DELETE' })).resolves.toBeUndefined();
    expect(b.db.select().from(aiProvider).all()).toEqual([]);
  });
});
