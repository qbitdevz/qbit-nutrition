import { cleanup, fireEvent, screen } from '@testing-library/react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { formatLongDate, formatNumber } from '@/i18n/format';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { GoalSettingsScreen } from '../GoalSettingsScreen';

/** S10: setting a goal never deletes the stored one silently; a conflict is explained in both languages, with the dates. */
const NOW = new Date(2026, 10, 21, 10, 0);
const clock = () => new Date(NOW);
const TODAY = '2026-11-21';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
  h.setDayClock('2026-11-21T10:00:00.000Z');
  await h.repos.profile.save({
    sex: 'female',
    birthDate: '1990-01-01',
    heightCm: 150,
    activityLevel: 'sedentary',
    unitSystem: 'metric',
    locale: 'en',
    disclaimerAcceptedAt: '2026-11-01T10:00:00.000Z',
    disclaimerVersion: '2026-11-21',
  });
  await h.repos.measurements.record({ measuredOn: '2026-11-20', kind: 'weight', value: 70 });
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

const insertOpen = (start: string) =>
  h.client.exec(`INSERT INTO goal (id, type, start_date, end_date, kcal_target, protein_g_target, carbs_g_target, fat_g_target, is_custom) VALUES ('stored', 'maintain', '${start}', NULL, 2100, 150, 220, 70, 0)`);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const stored = async () => (await h.repos.goals.history()).map((g) => [g.id, g.startDate, g.endDate]);

async function saveTargets(labels: { change: string; maintain: string; cont: string; kcal: string; save: string }) {
  await press(labels.change);
  await fireEvent.press(await screen.findByRole('radio', { name: labels.maintain }));
  await press(labels.cont);
  await fireEvent.changeText(await screen.findByLabelText(labels.kcal), '2000');
  await press(labels.save);
}
const EN = { change: 'Change goal or targets', maintain: 'Maintain weight', cont: 'Continue', kcal: 'Calories (kcal)', save: 'Save targets' };
const ES = { change: 'Cambiar meta u objetivos', maintain: 'Mantener el peso', cont: 'Continuar', kcal: 'Calorías (kcal)', save: 'Guardar objetivos' };

describe('a stored goal that starts beyond the latest accepted day (the phone’s date is behind it)', () => {
  it('asks before replacing, shows both dates and the goal’s values, and replaces nothing when the person keeps it', async () => {
    insertOpen('2027-03-01');
    await renderApp(<GoalSettingsScreen now={clock} />, { services });
    await screen.findByText('Since Mar 1, 2027');
    await saveTargets(EN);

    expect(await screen.findByText('Replace your current goal?')).toBeOnTheScreen();
    expect(screen.getByText(/Your current goal starts on Mar 1, 2027, which is after this phone’s date \(Nov 21, 2026\)/)).toBeOnTheScreen();
    expect(screen.getByText(/2,100 kcal · Protein 150 g · Carbs 220 g · Fat 70 g/)).toBeOnTheScreen();
    expect(await stored()).toEqual([['stored', '2027-03-01', null]]);

    press('Keep my current goal');
    expect(await stored()).toEqual([['stored', '2027-03-01', null]]);
  });

  it('replaces it after the person confirms, and says which goal was replaced', async () => {
    insertOpen('2027-03-01');
    await renderApp(<GoalSettingsScreen now={clock} />, { services });
    await screen.findByText('Since Mar 1, 2027');
    await saveTargets(EN);
    await screen.findByText('Replace your current goal?');
    press('Replace the goal');

    expect(await screen.findByText('Targets saved. The goal that started on Mar 1, 2027 was replaced.')).toBeOnTheScreen();
    const history = await h.repos.goals.history();
    expect(history.map((g) => [g.id === 'stored', g.startDate, g.endDate, g.kcalTarget])).toEqual([[false, TODAY, null, 2000]]);
  });

  it('in Spanish: the confirmation names both dates, and the result names the replaced goal', async () => {
    await i18n.changeLanguage('es');
    insertOpen('2027-03-01');
    const open = formatLongDate('es', '2027-03-01');
    const today = formatLongDate('es', TODAY);
    await renderApp(<GoalSettingsScreen now={clock} />, { services, locale: 'es' });
    await screen.findByText(`Desde el ${open}`);
    await saveTargets(ES);

    expect(await screen.findByText('¿Reemplazar tu objetivo actual?')).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(`Tu objetivo actual empieza el ${open}.*\(${today}\)`))).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(`${formatNumber('es', 2100)} kcal · Proteína 150 g · Carbohidratos 220 g · Grasa 70 g`))).toBeOnTheScreen();
    press('Reemplazar el objetivo');
    expect(await screen.findByText(`Objetivos guardados. Se reemplazó el objetivo que empezaba el ${open}.`)).toBeOnTheScreen();
  });
});

describe('a stored goal that starts later but inside the accepted days', () => {
  it('refuses with a message about the phone’s date, naming both dates, and changes nothing', async () => {
    insertOpen('2026-11-22');
    await renderApp(<GoalSettingsScreen now={clock} />, { services });
    await screen.findByText('Since Nov 22, 2026');
    await saveTargets(EN);

    expect(await screen.findByText(/This phone’s date looks earlier than your current goal’s start date\. Your current goal starts on Nov 22, 2026, and this phone says today is Nov 21, 2026\. Check the date and time settings/)).toBeOnTheScreen();
    expect(screen.queryByText('Replace your current goal?')).toBeNull();
    expect(await stored()).toEqual([['stored', '2026-11-22', null]]);
  });

  it('says the same in Spanish', async () => {
    await i18n.changeLanguage('es');
    insertOpen('2026-11-22');
    await renderApp(<GoalSettingsScreen now={clock} />, { services, locale: 'es' });
    await screen.findByText(`Desde el ${formatLongDate('es', '2026-11-22')}`);
    await saveTargets(ES);
    expect(await screen.findByText(/La fecha de este teléfono parece anterior al inicio de tu objetivo actual\. Tu objetivo actual empieza el 22 nov 2026, y este teléfono indica que hoy es 21 nov 2026\. Revisa la configuración de fecha y hora/)).toBeOnTheScreen();
    expect(await stored()).toEqual([['stored', '2026-11-22', null]]);
  });
});

describe('a stored goal that starts before 2000', () => {
  it('is closed the day before, with a normal confirmation and no warning', async () => {
    insertOpen('1990-01-01');
    await renderApp(<GoalSettingsScreen now={clock} />, { services });
    await screen.findByText('Since Jan 1, 1990');
    await saveTargets(EN);
    expect(await screen.findByText('Targets saved')).toBeOnTheScreen();
    expect(await stored()).toEqual([['stored', '1990-01-01', '2026-11-20'], [expect.any(String), TODAY, null]]);
  });
});
