import { cleanup, fireEvent, screen, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { AboutScreen, OFF_LEGAL_URL, SOURCE_URL } from '../../settings/AboutScreen';
import { LicensesScreen } from '../LicensesScreen';
import { PrivacyScreen } from '../PrivacyScreen';
import { licenseReport, type LicenseReport } from '../licenses';

// Jest has no app config; the About screen reads the version from it.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.0.1' } } }));

let h: Harness;
let services: ReturnType<typeof createTestServices>;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

const REPORT: LicenseReport = {
  generatedFrom: 'qbit-nutrition@0.0.1',
  packages: [
    { name: 'alpha', version: '1.0.0', license: 'MIT', repository: null, text: 'MIT License\n\nCopyright (c) alpha authors' },
    { name: 'beta', version: '2.3.4', license: 'ISC', repository: null, text: null },
  ],
};

describe('About (S8)', () => {
  it('names the app, its version, the author, the license and the source, in English', async () => {
    await renderApp(<AboutScreen />, { services });
    const card = await screen.findByTestId('about-app');
    expect(within(card).getByRole('header', { name: 'Qbit Nutrition' })).toBeOnTheScreen();
    expect(within(card).getByText('Version 0.0.1')).toBeOnTheScreen();
    expect(within(card).getByText('By qbitdev')).toBeOnTheScreen();
    expect(within(card).getByText('Open source under the MIT license.')).toBeOnTheScreen();
    expect(within(card).getByText(SOURCE_URL)).toBeOnTheScreen();
  });

  it('says the same in Spanish', async () => {
    await renderApp(<AboutScreen />, { services, locale: 'es' });
    const card = await screen.findByTestId('about-app');
    expect(within(card).getByText('Versión 0.0.1')).toBeOnTheScreen();
    expect(within(card).getByText('Por qbitdev')).toBeOnTheScreen();
    expect(within(card).getByText('Código abierto con licencia MIT.')).toBeOnTheScreen();
  });

  it('opens the source code and the Open Food Facts license page in the browser', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderApp(<AboutScreen />, { services });
    await fireEvent.press(await screen.findByRole('button', { name: 'Open the source code on GitHub (opens your browser)' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Open Food Facts license and terms' }));
    expect(open.mock.calls.map((c) => c[0])).toEqual([SOURCE_URL, OFF_LEGAL_URL]);
  });

  it('keeps the health notice readable, with the USDA citation and the Open Food Facts attribution', async () => {
    await renderApp(<AboutScreen />, { services });
    expect(await screen.findByText('This app is not medical advice')).toBeOnTheScreen();
    const sources = screen.getByTestId('data-sources');
    expect(within(sources).getByText('Food composition data: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.')).toBeOnTheScreen();
    expect(within(sources).getByText(/made available under the Open Database License \(ODbL\)/)).toBeOnTheScreen();
  });

  it('names providers as compatibility only, with a not-affiliated line, in both languages', async () => {
    await renderApp(<AboutScreen />, { services });
    const names = await screen.findByTestId('about-names');
    expect(within(names).getByText(/used only to identify services this app can work with/)).toBeOnTheScreen();
    expect(within(names).getByText(/not affiliated with, endorsed by, or sponsored by any of them/)).toBeOnTheScreen();
    await cleanup();
    await renderApp(<AboutScreen />, { services, locale: 'es' });
    const nombres = await screen.findByTestId('about-names');
    expect(within(nombres).getByText(/solo para identificar servicios/)).toBeOnTheScreen();
    expect(within(nombres).getByText(/no está afiliada, respaldada ni patrocinada/)).toBeOnTheScreen();
  });

  it('links to the privacy policy, the calculation page and the licenses when the screen can open them', async () => {
    const onOpenPrivacy = jest.fn();
    const onOpenLicenses = jest.fn();
    const onOpenCalculation = jest.fn();
    await renderApp(<AboutScreen onOpenPrivacy={onOpenPrivacy} onOpenLicenses={onOpenLicenses} onOpenCalculation={onOpenCalculation} />, { services });
    await fireEvent.press(await screen.findByRole('button', { name: 'Privacy policy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Open-source licenses' }));
    await fireEvent.press(screen.getByRole('button', { name: 'How targets are calculated' }));
    expect([onOpenPrivacy, onOpenLicenses, onOpenCalculation].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('says "not accepted yet" for a profile whose notice was never accepted on this phone (an import)', async () => {
    await h.repos.profile.save({ unitSystem: 'metric', locale: 'en', disclaimerAcceptedAt: '1970-01-01T00:00:00.000Z', disclaimerVersion: '' });
    await renderApp(<AboutScreen />, { services });
    expect(await screen.findByText('Not accepted yet')).toBeOnTheScreen();
  });
});

describe('Privacy policy (S8)', () => {
  it('is readable in English: the sections, the table of what leaves the phone, the Health Connect paragraph, and the draft mark', async () => {
    await renderApp(<PrivacyScreen />, { services });
    expect(await screen.findByRole('header', { name: 'Privacy policy — Qbit Nutrition' })).toBeOnTheScreen();
    expect(screen.getByText(/Draft, pending legal review\./)).toBeOnTheScreen();
    expect(screen.getByText(/Your data stays on your device\. We, the maintainers, do not collect, receive, or store any of it\./)).toBeOnTheScreen();
    for (const row of ['photo', 'suggest', 'barcode', 'export']) expect(screen.getByTestId(`privacy-row-${row}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(/Look up a barcode\. Data sent: The barcode number.*Recipient: Open Food Facts\./)).toBeOnTheScreen();
    expect(screen.getByText(/If you turn on Health Connect/)).toBeOnTheScreen();
    expect(screen.getByText(/No accounts, no analytics, no advertising, no crash reports, no tracking/)).toBeOnTheScreen();
  });

  it('is readable in Spanish, with the same sections', async () => {
    await renderApp(<PrivacyScreen />, { services, locale: 'es' });
    expect(await screen.findByRole('header', { name: 'Política de privacidad — Qbit Nutrition' })).toBeOnTheScreen();
    expect(screen.getByText(/Borrador, pendiente de revisión legal\./)).toBeOnTheScreen();
    expect(screen.getByText(/Tus datos se quedan en tu dispositivo\./)).toBeOnTheScreen();
    for (const row of ['photo', 'suggest', 'barcode', 'export']) expect(screen.getByTestId(`privacy-row-${row}`)).toBeOnTheScreen();
    expect(screen.getByText(/Si activas Health Connect/)).toBeOnTheScreen();
    expect(screen.getByText(/Sin cuentas, sin analítica, sin publicidad/)).toBeOnTheScreen();
  });
});

describe('Open-source licenses (S8)', () => {
  it('lists each package with its license, and shows the license text on request', async () => {
    await renderApp(<LicensesScreen report={REPORT} />, { services });
    expect(await screen.findByRole('header', { name: 'Open-source licenses' })).toBeOnTheScreen();
    expect(screen.getByText('2 packages')).toBeOnTheScreen();
    expect(screen.queryByTestId('license-text-alpha')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'alpha 1.0.0, MIT' }));
    expect(screen.getByTestId('license-text-alpha')).toHaveTextContent(/Copyright \(c\) alpha authors/);
    expect(screen.getByRole('button', { name: 'alpha 1.0.0, MIT' }).props.accessibilityState).toMatchObject({ expanded: true });

    // One open at a time; a package without a license file says so.
    await fireEvent.press(screen.getByRole('button', { name: 'beta 2.3.4, ISC' }));
    expect(screen.queryByTestId('license-text-alpha')).toBeNull();
    expect(screen.getByTestId('license-text-beta')).toHaveTextContent('This package does not ship a license file; its license is named above.');
  });

  it('is in Spanish too', async () => {
    await renderApp(<LicensesScreen report={REPORT} />, { services, locale: 'es' });
    expect(await screen.findByRole('header', { name: 'Licencias de código abierto' })).toBeOnTheScreen();
    expect(screen.getByText('2 paquetes')).toBeOnTheScreen();
    expect(screen.getByText(/La propia Qbit Nutrition se publica bajo la licencia MIT\./)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'alpha 1.0.0, MIT' }));
    expect(screen.getByTestId('license-text-alpha')).toBeOnTheScreen();
  });

  it('says so when the build has no license list', async () => {
    await renderApp(<LicensesScreen report={{ generatedFrom: '', packages: [] }} />, { services });
    expect(await screen.findByText('The license list is not available in this build.')).toBeOnTheScreen();
  });

  it('lists the generated report of this build: real packages, each with a license', async () => {
    expect(licenseReport.packages.length).toBeGreaterThan(100);
    expect(licenseReport.packages.every((p) => p.license && p.license !== 'UNKNOWN')).toBe(true);
    await renderApp(<LicensesScreen />, { services });
    expect(await screen.findByText(`${licenseReport.packages.length} packages`)).toBeOnTheScreen();
  });
});
