import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { createFakeDataPlatform } from '@/platform/fakeDataPlatform';
import { createFakeHealthPlatform } from '@/platform/fakeHealthPlatform';
import { DataPlatformProvider } from '../../data/DataPlatformContext';
import { DataScreen } from '../../data/DataScreen';
import { BarcodeScreen } from '../../barcode/BarcodeScreen';
import { ScanFlowScreen } from '../../scan/ScanFlowScreen';
import { ReviewScreen } from '../../logging/ReviewScreen';
import { CalculationScreen } from '../../goals/CalculationScreen';
import { GoalSettingsScreen } from '../../goals/GoalSettingsScreen';
import { MinimumEnergyScreen } from '../../goals/MinimumEnergyScreen';
import { createHealthSync } from '../../health/healthSync';
import { IntegrationsScreen } from '../../health/IntegrationsScreen';
import { LicensesScreen } from '../../legal/LicensesScreen';
import { NoticeGate } from '../../legal/NoticeGate';
import { PrivacyScreen } from '../../legal/PrivacyScreen';
import { CustomFoodScreen } from '../../logging/CustomFoodScreen';
import { FoodSearchScreen } from '../../logging/FoodSearchScreen';
import { MealDetailScreen } from '../../meals/MealDetailScreen';
import { OnboardingFlow } from '../../onboarding/OnboardingFlow';
import { ProgressScreen } from '../../progress/ProgressScreen';
import { AppSession } from '../../session/AppSession';
import { AboutScreen } from '../../settings/AboutScreen';
import { ProfileSettingsScreen } from '../../settings/ProfileSettingsScreen';
import { ProviderFormScreen } from '../../settings/ProviderFormScreen';
import { ProviderPresetsScreen } from '../../settings/ProviderPresetsScreen';
import { ProvidersScreen } from '../../settings/ProvidersScreen';
import { SettingsScreen } from '../../settings/SettingsScreen';
import { TodayScreen } from '../../today/TodayScreen';
import { accessibilityFindings, MIN_TARGET } from '../a11y';
import { seedEverything } from '../backupSeed';
import { renderApp } from '../renderApp';
import { createTestServices } from '../testServices';

/**
 * docs/05 section 9, the part a test can pin: on every screen, every control has a role and an accessible name, every touch target
 * is declared at least 48 dp tall, and every text field has a label. Contrast, focus order, and layout at 200% font scale cannot
 * be seen here; they were checked by hand (see the task evidence).
 */
let h: Harness;
let services: ReturnType<typeof createTestServices>;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
  await seedEverything(h);
  await h.repos.settings.set('locale', 'en');
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
});

const NOW = new Date('2026-06-02T14:00:00');
const noop = () => undefined;

interface Case {
  name: string;
  element: () => ReactElement;
  /** Text that shows the screen has loaded. */
  ready: string | RegExp;
}

const cases: Case[] = [
  { name: 'Today', element: () => <TodayScreen onOpenSettings={noop} onOpenMeal={noop} now={() => NOW} />, ready: /kcal/ },
  { name: 'Progress', element: () => <ProgressScreen now={() => NOW} />, ready: /Progress|Weight/ },
  { name: 'Settings', element: () => <SettingsScreen onOpen={noop} onBack={noop} />, ready: 'Settings' },
  { name: 'About', element: () => <AboutScreen onBack={noop} onOpenCalculation={noop} onOpenPrivacy={noop} onOpenLicenses={noop} />, ready: 'Data sources' },
  { name: 'Privacy policy', element: () => <PrivacyScreen onBack={noop} />, ready: 'Privacy policy — Qbit Nutrition' },
  {
    name: 'Open-source licenses',
    element: () => <LicensesScreen onBack={noop} report={{ generatedFrom: 't', packages: [{ name: 'alpha', version: '1.0.0', license: 'MIT', repository: null, text: 'text' }] }} />,
    ready: '1 package',
  },
  { name: 'Integrations', element: () => <IntegrationsScreen onBack={noop} onOpenPrivacy={noop} />, ready: 'Turn on Health Connect' },
  { name: 'Data', element: () => <DataPlatformProvider platform={createFakeDataPlatform()}><DataScreen onBack={noop} /></DataPlatformProvider>, ready: 'Export your data' },
  { name: 'Profile and units', element: () => <ProfileSettingsScreen now={() => NOW} onBack={noop} />, ready: 'Profile and units' },
  { name: 'Goal and targets', element: () => <GoalSettingsScreen now={() => NOW} onBack={noop} />, ready: 'Goal and targets' },
  { name: 'Minimum energy', element: () => <MinimumEnergyScreen onBack={noop} />, ready: 'Minimum daily energy' },
  { name: 'How targets are calculated', element: () => <CalculationScreen onBack={noop} />, ready: 'How this is calculated' },
  { name: 'AI providers', element: () => <ProvidersScreen onAdd={noop} onOpen={noop} onBack={noop} />, ready: 'AI providers' },
  { name: 'Provider presets', element: () => <ProviderPresetsScreen onChoose={noop} onBack={noop} />, ready: /Choose|provider/i },
  { name: 'Provider form (new)', element: () => <ProviderFormScreen presetId="gemini" onBack={noop} onDone={noop} />, ready: 'New provider' },
  { name: 'Food search', element: () => <FoodSearchScreen onAdded={noop} onOpenReview={noop} onCreateCustom={noop} onBarcode={noop} onBack={noop} />, ready: /Search/i },
  { name: 'Custom food', element: () => <CustomFoodScreen onCreated={noop} onBack={noop} />, ready: /custom food/i },
  { name: 'Onboarding', element: () => <OnboardingFlow onDone={noop} now={() => NOW} />, ready: 'Choose your language' },
];

describe('accessibility: every screen (S10, docs/05 section 9)', () => {
  it.each(cases)('$name', async ({ element, ready }) => {
    await renderApp(element(), { services });
    expect((await screen.findAllByText(ready)).length).toBeGreaterThan(0);
    expect(accessibilityFindings(screen.root as never)).toEqual([]);
  });

  it('the meal detail screen, with items and steppers', async () => {
    const day = await h.repos.meals.getDay('2026-06-02');
    await renderApp(<MealDetailScreen mealId={day.meals[0]!.id} now={() => NOW} onClose={noop} onCopied={noop} />, { services });
    expect((await screen.findAllByText(/Grandma soup/)).length).toBeGreaterThan(0);
    expect(accessibilityFindings(screen.root as never)).toEqual([]);
  });

  it.each([
    ['Barcode', () => <BarcodeScreen onAdded={noop} onCreateCustom={noop} onBack={noop} />],
    ['Scan', () => <ScanFlowScreen onClose={noop} onManual={noop} onProviderSettings={noop} onReview={noop} />],
    ['Review (nothing to review yet)', () => <ReviewScreen now={() => NOW} onAddItem={noop} onSaved={noop} onClose={noop} />],
  ])('%s', async (_name, element) => {
    await renderApp(element(), { services });
    expect((await screen.findAllByRole('button')).length).toBeGreaterThan(0);
    expect(accessibilityFindings(screen.root as never)).toEqual([]);
  });

  it('the sheets of Data: the export reminder and the delete confirmation', async () => {
    await renderApp(
      <DataPlatformProvider platform={createFakeDataPlatform()}>
        <DataScreen onBack={noop} />
      </DataPlatformProvider>,
      { services },
    );
    await fireEvent.press(await screen.findByTestId('export-button'));
    expect((await screen.findAllByText(/not encrypted/i)).length).toBeGreaterThan(0);
    expect(accessibilityFindings(screen.root as never)).toEqual([]);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await fireEvent.press(await screen.findByTestId('delete-button'));
    expect((await screen.findAllByTestId('confirm-word')).length).toBeGreaterThan(0);
    expect(accessibilityFindings(screen.root as never)).toEqual([]);
  });

  it('the health integration once it is on, with a pending record and a revoked grant', async () => {
    const platform = createFakeHealthPlatform();
    const health = createHealthSync({ repos: h.repos, platform });
    await health.turnOn();
    platform.state.granted.writeNutrition = false;
    await health.mealChanged((await h.repos.meals.listIds())[0]!);
    await renderApp(<IntegrationsScreen onBack={noop} />, { services: { ...services, health } });
    expect((await screen.findAllByText(/Access was taken away/)).length).toBeGreaterThan(0);
    expect(accessibilityFindings(screen.root as never)).toEqual([]);
  });

  it('the health notice that comes back when its text changes, and the screen after declining it', async () => {
    await h.repos.profile.save({ unitSystem: 'metric', locale: 'en', disclaimerAcceptedAt: '2026-01-01T00:00:00.000Z', disclaimerVersion: '2026-01-01' });
    await renderApp(
      <AppSession>
        <NoticeGate>{null}</NoticeGate>
      </AppSession>,
      { services },
    );
    expect(await screen.findByText('I have read it')).toBeOnTheScreen();
    expect(accessibilityFindings(screen.root as never)).toEqual([]);
  });

  it('knows what a failure looks like: a control with no name, no role, or a small target is reported', () => {
    const control = (props: Record<string, unknown>, children: unknown[] = []) => ({ type: 'View', props: { onClick: () => undefined, ...props }, children });
    const tree = (...nodes: unknown[]) => ({ type: 'View', props: {}, children: nodes }) as never;
    expect(accessibilityFindings(tree(control({ accessibilityRole: 'button', style: { minHeight: MIN_TARGET } })))).toEqual([expect.stringContaining('no accessible name')]);
    expect(accessibilityFindings(tree(control({ accessibilityLabel: 'Go', style: { minHeight: MIN_TARGET } })))).toEqual([expect.stringContaining('no role')]);
    expect(accessibilityFindings(tree(control({ accessibilityLabel: 'Go', accessibilityRole: 'button', style: { height: 32 } })))).toEqual([expect.stringContaining('32 dp tall')]);
    expect(accessibilityFindings(tree(control({ accessibilityLabel: 'Go', accessibilityRole: 'button', style: { minHeight: 48, width: 40 } })))).toEqual([expect.stringContaining('40 dp wide')]);
    expect(accessibilityFindings(tree({ type: 'TextInput', props: {}, children: [] }))).toEqual([expect.stringContaining('text field with no label')]);
    // A name from the text inside, a hidden decoration, and an exempt inline link are fine.
    expect(accessibilityFindings(tree(control({ accessibilityRole: 'button', style: { minHeight: 56 } }, [{ type: 'Text', props: {}, children: ['Save'] }])))).toEqual([]);
    expect(accessibilityFindings(tree(control({ 'aria-hidden': true })))).toEqual([]);
    expect(accessibilityFindings(tree(control({ accessibilityRole: 'link', accessibilityLabel: 'More' })))).toEqual([]);
  });
});
