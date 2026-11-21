import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initializeDatabase } from '@/data';
import { createHarness, type Harness } from '@/data/testing/harness';
import { openNodeDatabase } from '@/data/testing/nodeDatabase';
import i18n from '@/i18n';
import { MotionProvider, ThemeProvider } from '@/ui';
import { servicesFrom } from '../../testing/renderApp';
import { AppProvider, useServices } from '../AppProvider';
import type { AppServices } from '../types';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => {
  await cleanup();
  h.close();
});

function Probe() {
  const { repos } = useServices();
  return <Text>{typeof repos.meals.getDay === 'function' ? 'repositories ready' : 'missing'}</Text>;
}

const shell = (open: () => Promise<AppServices>) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <ThemeProvider scheme="dark">
      <MotionProvider reduced>
        <AppProvider open={open}>
          <Probe />
        </AppProvider>
      </MotionProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

describe('AppProvider', () => {
  it('shows a loading state while the database opens, then exposes the repositories', async () => {
    await i18n.changeLanguage('en');
    let finish!: (services: AppServices) => void;
    const opening = new Promise<AppServices>((resolve) => (finish = resolve));
    await render(shell(() => opening));

    expect(screen.getByRole('progressbar', { name: 'Opening your data' })).toBeOnTheScreen();
    expect(screen.queryByText('repositories ready')).not.toBeOnTheScreen();

    finish(servicesFrom(h));
    expect(await screen.findByText('repositories ready')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar', { name: 'Opening your data' })).not.toBeOnTheScreen();
  });

  it('shows a recovery screen with the typed error when a migration fails, and retries', async () => {
    await i18n.changeLanguage('en');
    // A real failing startup: a bundle whose SQL is invalid, on a fresh database.
    const failing = async (): Promise<AppServices> => {
      const node = openNodeDatabase();
      try {
        await initializeDatabase(node.db, { migrations: { '20260101000000_broken': 'CREATE TABLE ( not sql' } });
      } finally {
        node.close();
      }
      return servicesFrom(h);
    };
    let attempts = 0;
    const open = async () => {
      attempts += 1;
      if (attempts === 1) return failing();
      return servicesFrom(h);
    };
    await render(shell(open));

    expect(await screen.findByText('Your data could not be opened')).toBeOnTheScreen();
    expect(screen.getByText(/your existing data was left unchanged/)).toBeOnTheScreen();
    expect(screen.getByTestId('error-detail')).toHaveTextContent(/^migration_failed: /);
    expect(screen.queryByText('repositories ready')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('repositories ready')).toBeOnTheScreen();
    expect(attempts).toBe(2);
  });

  it('names a failure that is not a DataError as a startup failure', async () => {
    await i18n.changeLanguage('es');
    await render(shell(async () => Promise.reject(new Error('catalog asset missing'))));

    expect(await screen.findByText('No se pudieron abrir tus datos')).toBeOnTheScreen();
    expect(screen.getByTestId('error-detail')).toHaveTextContent('startup_failed: catalog asset missing');
  });
});
