import { cleanup, fireEvent, screen } from '@testing-library/react-native';

import { DateOutOfRangeError, EARLIEST_DAY } from '@/data';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { DateStepper } from '../DateStepper';
import { ProgressScreen } from '../ProgressScreen';

const NOW = new Date(2026, 3, 1, 12, 0);

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

describe('the date stepper stops at the earliest day a record may have (A1)', () => {
  it('cannot step before 2000-01-01', async () => {
    const onChange = jest.fn();
    await renderApp(<DateStepper value={EARLIEST_DAY} max="2026-04-01" onChange={onChange} />, { services });
    const previous = screen.getByRole('button', { name: 'No earlier day' });
    fireEvent.press(previous);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('steps back normally from any later day', async () => {
    const onChange = jest.fn();
    await renderApp(<DateStepper value="2000-01-02" max="2026-04-01" onChange={onChange} />, { services });
    fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    expect(onChange).toHaveBeenCalledWith('2000-01-01');
  });
});

describe('a date the repository refuses is explained, and what was typed is kept (A1)', () => {
  it('says the date is out of range and that the phone’s date may be wrong', async () => {
    jest.spyOn(h.repos.measurements, 'record').mockRejectedValue(new DateOutOfRangeError('measuredOn', '1999-01-01', new Date('1970-01-01T00:00:00.000Z')));
    await renderApp(<ProgressScreen now={() => NOW} />, { services });
    await screen.findByText('Log a few days to see trends');
    fireEvent.press(screen.getByRole('radio', { name: 'Weight' }));
    await screen.findByText('No weight logged yet');
    fireEvent.press(screen.getByRole('button', { name: 'Log weight' }));
    await fireEvent.changeText(await screen.findByTestId('entry-value'), '80');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/That date is outside what the app accepts \(2000-01-01 to 1970-01-03\)\. If this phone’s date is wrong/)).toBeOnTheScreen();
    expect(screen.getByTestId('entry-value').props.value).toBe('80');
  });
});
