import { parseNumber, parseWhole } from '../../forms/numbers';
import { convertUnits, emptyProfileValues, validateProfile } from '../profileForm';

const TODAY = '2026-11-21';
const base = () => ({ ...emptyProfileValues('metric') });

describe('parsing typed numbers', () => {
  it('reads decimals with a point or a comma and rejects everything else', () => {
    expect(parseNumber('70,5')).toEqual({ kind: 'number', value: 70.5 });
    expect(parseNumber(' 70 ')).toEqual({ kind: 'number', value: 70 });
    expect(parseNumber('')).toEqual({ kind: 'empty' });
    expect(parseNumber('1e3')).toEqual({ kind: 'invalid' });
    expect(parseNumber('abc')).toEqual({ kind: 'invalid' });
    expect(parseWhole('14.5')).toEqual({ kind: 'invalid' });
  });
});

describe('profile validation', () => {
  it('accepts an empty profile: every field is optional', () => {
    const { errors, result } = validateProfile(base(), TODAY);
    expect(errors).toEqual({});
    expect(result).toMatchObject({ sex: null, birthDate: null, heightCm: null, weightKg: null, activityLevel: null, specialCondition: null });
  });

  it.each([
    ['height', { heightCm: '49' }],
    ['height', { heightCm: '261' }],
    ['weight', { weight: '19' }],
    ['weight', { weight: '501' }],
    ['birth', { day: '29', month: '2', year: '2023' }],
    ['birth', { day: '1', month: '1', year: '2027' }],
    ['birth', { day: '1', month: '1', year: '1890' }],
    ['birth', { day: '1', month: '1' }],
  ] as const)('rejects impossible %s values without clamping', (field, patch) => {
    const { errors, result } = validateProfile({ ...base(), ...patch }, TODAY);
    expect(errors[field]).toBeDefined();
    expect(result).toBeNull();
  });

  it('stores imperial entry as metric', () => {
    const { result } = validateProfile({ ...base(), unit: 'imperial', heightFt: '5', heightIn: '9', weight: '154' }, TODAY);
    expect(result?.unitSystem).toBe('imperial');
    expect(result?.heightCm).toBe(175.3);
    expect(result?.weightKg).toBe(69.9);
  });

  it('keeps typed values when the unit changes', () => {
    const metric = { ...base(), heightCm: '175', weight: '70' };
    const imperial = convertUnits(metric, 'imperial');
    expect(imperial).toMatchObject({ heightFt: '5', heightIn: '9', weight: '154' });
    expect(convertUnits(imperial, 'metric')).toMatchObject({ heightCm: '175.3', weight: '69.9' });
  });
});
