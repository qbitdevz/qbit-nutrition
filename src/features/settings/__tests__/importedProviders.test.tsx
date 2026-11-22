import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import { strFromU8, strToU8 } from 'fflate';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { seedEverything } from '../../testing/backupSeed';
import { createDevice, lastShared, pickAndPrepare, type Device } from '../../testing/dataKit';
import { renderApp } from '../../testing/renderApp';
import { destinationOf, hostOf } from '../destination';
import { importedKey } from '../providerService';
import { ProviderFormScreen } from '../ProviderFormScreen';
import { ProvidersScreen } from '../ProvidersScreen';

describe('the host of a base URL', () => {
  it.each([
    ['https://api.openai.com/v1', 'api.openai.com'],
    ['https://API.Example.com:8443/v1/x?y=1', 'api.example.com:8443'],
    ['http://192.168.1.5:11434/v1', '192.168.1.5:11434'],
    ['https://user@host.example.com/v1', 'host.example.com'],
    ['http://[::1]:8080/v1', '[::1]:8080'],
    ['not a url', 'not a url'],
  ])('%s → %s', (url, host) => expect(hostOf(url)).toBe(host));

  it('is written next to the label wherever a destination is named', () => {
    expect(destinationOf({ label: 'Main', baseUrl: 'https://evil.example.net/v1' })).toBe('Main (evil.example.net)');
  });
});

let a: Harness; // where the file comes from
let b: Harness; // this phone
let from: Device;
let to: Device;
beforeEach(async () => {
  a = await createHarness();
  b = await createHarness();
  from = createDevice(a);
  to = createDevice(b);
});
afterEach(async () => {
  await cleanup();
  from.services.close();
  to.services.close();
  a.close();
  b.close();
  await i18n.changeLanguage('en');
});

/** A file whose provider claims to be active and has a label that looks like a trusted one, pointing at another host. */
async function importHostile() {
  await seedEverything(a);
  await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
  const doc = JSON.parse(strFromU8(lastShared(from).bytes));
  doc.ai_providers = [{ ...doc.ai_providers[0], label: 'OpenAI', preset: 'openai', base_url: 'https://collector.attacker.example/v1', is_active: true }];
  await to.service.applyImport(await pickAndPrepare(to, 'x.json', strToU8(JSON.stringify(doc))));
  const [view] = await to.services.providers.list();
  return view!;
}

describe('imported provider profiles are not trusted until the person has looked at them (S4)', () => {
  it('arrive inactive and marked as imported, whatever the file says', async () => {
    const view = await importHostile();
    expect(view).toMatchObject({ label: 'OpenAI', isActive: false, imported: true, hasKey: false });
    expect(await to.services.providers.list()).toHaveLength(1);
    expect(await to.services.scan.activeProvider()).toBeNull();
  });

  it('cannot be made active, or given a key, or used to test a key, until they are confirmed', async () => {
    const view = await importHostile();
    await expect(to.services.providers.setActive(view.id)).rejects.toMatchObject({ code: 'not_confirmed' });
    await expect(to.services.providers.update(view.id, { apiKey: 'sk-typed-for-the-old-host-123456' })).rejects.toMatchObject({ code: 'not_confirmed' });
    await expect(
      to.services.providers.testConnection({ id: view.id, adapter: view.adapter, baseUrl: view.baseUrl, model: view.model, timeoutS: 30, apiKey: 'sk-typed-for-the-old-host-123456' }),
    ).rejects.toMatchObject({ code: 'not_confirmed' });
    expect(await to.services.secrets.has(view.id)).toBe(false);
  });

  it('can be confirmed once, after which they behave like any other profile', async () => {
    const view = await importHostile();
    expect((await to.services.providers.confirmImported(view.id)).imported).toBe(false);
    await to.services.providers.update(view.id, { apiKey: 'sk-typed-after-looking-123456' });
    expect(await to.services.providers.setActive(view.id)).toMatchObject({ isActive: true, imported: false, hasKey: true });
  });

  it('are asked about again before anything is sent: the "this photo will be sent to" notices are not acknowledged', async () => {
    const view = await importHostile();
    expect(await to.services.scan.noticeAcknowledged(view.id)).toBe(false);
    expect(await to.services.scan.suggestNoticeAcknowledged(view.id)).toBe(false);
  });

  it('removing the profile removes the mark, and a file cannot carry the mark in or out', async () => {
    const view = await importHostile();
    expect(await b.repos.settings.get(importedKey(view.id))).toBe('1');
    await to.services.providers.remove(view.id);
    expect(await b.repos.settings.get(importedKey(view.id))).toBeNull();

    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const text = strFromU8(lastShared(from).bytes);
    expect(text).not.toContain('ai_imported');
  });

  it('a profile the person created is never marked', async () => {
    const created = await to.services.providers.create({ label: 'Mine', preset: null, adapter: 'openai_compatible', baseUrl: 'https://mine.example.com/v1', model: 'm', timeoutS: 30 });
    expect(created.imported).toBe(false);
  });
});

describe('screens', () => {
  it('the list shows the host next to the label and says a profile is imported and not yet confirmed', async () => {
    await importHostile();
    await renderApp(<ProvidersScreen onAdd={jest.fn()} onOpen={jest.fn()} onBack={jest.fn()} />, { services: to.services });
    expect(await screen.findByRole('button', { name: 'OpenAI' })).toBeOnTheScreen();
    expect(screen.getByText(/collector\.attacker\.example/)).toBeOnTheScreen();
    expect(screen.getByText(/Imported, not confirmed/)).toBeOnTheScreen();
  });

  it('the profile screen shows the host, offers no key field until the person confirms it, and then does', async () => {
    const view = await importHostile();
    await renderApp(<ProviderFormScreen providerId={view.id} onBack={jest.fn()} onDone={jest.fn()} />, { services: to.services });
    expect(await screen.findByText(/Its name can say anything/)).toBeOnTheScreen();
    expect(screen.getAllByText(/collector\.attacker\.example/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'I checked the address: use collector.attacker.example' }));
    expect(await screen.findByLabelText('API key')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeOnTheScreen();
    expect((await to.services.providers.get(view.id))!.imported).toBe(false);
  });
});
