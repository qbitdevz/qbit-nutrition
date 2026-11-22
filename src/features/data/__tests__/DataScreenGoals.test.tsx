import { cleanup, fireEvent, screen } from '@testing-library/react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { formatLongDate } from '@/i18n/format';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { AppSession } from '../../session/AppSession';
import { seedEverything } from '../../testing/backupSeed';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { DataPlatformProvider } from '../DataPlatformContext';
import { DataScreen } from '../DataScreen';

/** S10, F3: a goal period left out of an export is said plainly, with its dates, what it costs, and a way to open the goal settings. */
let h: Harness;
let services: ReturnType<typeof createTestServices>;
let platform: FakeDataPlatform;
const onOpenGoals = jest.fn();
beforeEach(async () => {
  onOpenGoals.mockReset();
  h = await createHarness();
  services = createTestServices(h);
  platform = createFakeDataPlatform();
  await seedEverything(h);
  await h.repos.settings.set('locale', 'en');
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
async function exportFromScreen(locale: 'en' | 'es' = 'en') {
  await h.repos.settings.set('locale', locale);
  await renderApp(
    <DataPlatformProvider platform={platform}>
      <AppSession>
        <DataScreen onOpenGoals={onOpenGoals} />
      </AppSession>
    </DataPlatformProvider>,
    { services, locale },
  );
  await screen.findByTestId('export-button');
  await press(locale === 'en' ? 'Export data' : 'Exportar datos');
  await press(locale === 'en' ? 'Share file' : 'Compartir archivo');
}
const insertGoal = (id: string, start: string, end: string | null) =>
  h.client.exec(`INSERT INTO goal (id, type, start_date, end_date, kcal_target, is_custom) VALUES ('${id}', 'maintain', '${start}', ${end ? `'${end}'` : 'NULL'}, 2000, 0)`);

describe('a goal period left out of the file', () => {
  it('says so plainly, with its dates, that those days will have no targets after a restore, and offers the goal settings', async () => {
    insertGoal('old', '1990-01-01', '1999-12-31');
    await exportFromScreen();
    expect(await screen.findByText(/A goal period was left out of the file: Jan 1, 1990 to Dec 31, 1999\. Its dates are outside what the app accepts, so after a restore the days it covered will have no targets\. To check your goals, open the goal settings\./)).toBeOnTheScreen();
    expect(platform.state.shared).toHaveLength(1);
    press('Open goal settings');
    expect(onOpenGoals).toHaveBeenCalledTimes(1);
  });

  it('names an open period by its start', async () => {
    h.client.exec(`UPDATE goal SET start_date = '2031-01-01' WHERE end_date IS NULL`);
    await exportFromScreen();
    expect(await screen.findByText(/A goal period was left out of the file: the one that starts on Jan 1, 2031 and has no end\. Its dates are outside what the app accepts, so after a restore the days it covered will have no targets/)).toBeOnTheScreen();
  });

  it('says the same in Spanish, with the dates', async () => {
    insertGoal('old', '1990-01-01', '1999-12-31');
    await exportFromScreen('es');
    const from = formatLongDate('es', '1990-01-01');
    const to = formatLongDate('es', '1999-12-31');
    expect(await screen.findByText(new RegExp(`Se dejó fuera del archivo un período de objetivo: del ${from} al ${to}\. Sus fechas están fuera de lo que acepta la aplicación, así que tras restaurar los días que cubría no tendrán objetivos\. Para revisar tus objetivos, abre los ajustes del objetivo\.`))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Abrir ajustes del objetivo' })).toBeOnTheScreen();
  });
});

describe('any other goal problem stops the export', () => {
  it('names the goal period, says nothing was written, and offers the goal settings', async () => {
    h.client.exec(`UPDATE goal SET end_date = '2026-06-10' WHERE end_date = '2026-06-01'`);
    await exportFromScreen();
    expect(await screen.findByText(/The export was stopped: the goal period that starts on Jun 2, 2026 and has no end cannot be written to the file/)).toBeOnTheScreen();
    expect(platform.state.shared).toHaveLength(0);
    press('Open goal settings');
    expect(onOpenGoals).toHaveBeenCalledTimes(1);
  });

  it('in Spanish', async () => {
    h.client.exec(`UPDATE goal SET end_date = '2026-06-10' WHERE end_date = '2026-06-01'`);
    await exportFromScreen('es');
    expect(await screen.findByText(/Se detuvo la exportación: el período de objetivo que empieza el 2 jun 2026 y no tiene fin no se puede escribir en el archivo/)).toBeOnTheScreen();
  });
});
