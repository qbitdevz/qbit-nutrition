/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';

import raw from '../presets.json';
import { SAMPLE_MEAL_JPEG_BASE64 } from '../sampleMeal';
import { PRESETS, getPreset, groupPresets, parsePresetFile } from '../presets';

const clone = () => JSON.parse(JSON.stringify(raw)) as typeof raw;

describe('presets file', () => {
  it('validates against its schema', () => {
    expect(() => parsePresetFile(raw)).not.toThrow();
  });

  it('gives every preset both languages for its cost and data-use notes, and a last-verified date', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(6);
    for (const preset of PRESETS) {
      for (const note of [preset.cost, preset.dataUse]) {
        expect(note.en.trim().length).toBeGreaterThan(20);
        expect(note.es.trim().length).toBeGreaterThan(20);
        expect(note.es).not.toBe(note.en);
      }
      expect(preset.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(preset.lastVerified))).toBe(false);
    }
  });

  it('includes the required presets', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining(['gemini', 'openrouter', 'openai', 'anthropic', 'ollama', 'custom']));
    expect(getPreset('custom')?.adapter).toBe('openai_compatible');
    expect(getPreset('nope')).toBeUndefined();
  });

  it('lists the options with a zero-cost path first, and the custom one last', () => {
    const { zeroCost, paid, custom } = groupPresets();
    expect(zeroCost.length).toBeGreaterThan(0);
    expect(zeroCost.every((p) => p.zeroCostPath)).toBe(true);
    expect(paid.every((p) => !p.zeroCostPath && p.id !== 'custom')).toBe(true);
    expect(custom.id).toBe('custom');
    expect([...zeroCost, ...paid, custom].map((p) => p.id).sort()).toEqual(PRESETS.map((p) => p.id).sort());
  });

  it('leaves the fields that belong to the person empty on the custom preset, with a note, and has no model default anywhere', () => {
    const custom = getPreset('custom')!;
    expect(custom).toMatchObject({ baseUrl: '', keyUrl: '', termsUrl: '', models: [] });
    expect(custom.notes.length).toBeGreaterThan(0);
    // Presets only suggest models; nothing in the file marks one as the default.
    expect(JSON.stringify(raw)).not.toMatch(/"default(Model)?"/i);
  });

  it('records the pages each preset was verified on', () => {
    for (const preset of PRESETS.filter((p) => p.id !== 'custom')) {
      expect(preset.sources.length).toBeGreaterThan(0);
      for (const source of preset.sources) expect(source).toMatch(/^https:\/\//);
    }
  });

  describe('rejects a file that is wrong', () => {
    const mutate = (change: (file: ReturnType<typeof clone>) => void) => {
      const file = clone();
      change(file);
      return () => parsePresetFile(file);
    };

    it('without Spanish', () => expect(mutate((f) => ((f.presets[0]!.cost as { es: string }).es = ''))).toThrow());
    it('without a last-verified date', () => expect(mutate((f) => delete (f.presets[0] as { lastVerified?: string }).lastVerified)).toThrow());
    it('with a date that is not a date', () => expect(mutate((f) => (f.presets[0]!.lastVerified = '21/11/2026'))).toThrow());
    it('with an unknown adapter', () => expect(mutate((f) => ((f.presets[0] as { adapter: string }).adapter = 'magic'))).toThrow());
    it('with plain http to a public host', () => expect(mutate((f) => (f.presets[0]!.baseUrl = 'http://api.example.com/v1'))).toThrow());
    it('with a link that is not https', () => expect(mutate((f) => (f.presets[0]!.termsUrl = 'http://example.com/terms'))).toThrow());
    it('with a repeated id', () => expect(mutate((f) => (f.presets[1]!.id = f.presets[0]!.id))).toThrow());
    it('with a keyed preset that has no key page', () => expect(mutate((f) => (f.presets[0]!.keyUrl = ''))).toThrow());
    it('with a hosted preset that has no models to suggest', () => expect(mutate((f) => (f.presets[0]!.models = []))).toThrow());
  });
});

describe('bundled sample meal picture', () => {
  it('is a JPEG under 100 KB that matches the file in assets', () => {
    const bytes = Buffer.from(SAMPLE_MEAL_JPEG_BASE64, 'base64');
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(bytes.length).toBeLessThan(100 * 1024);
    const file = readFileSync(path.resolve(__dirname, '../../../../assets/images/sample-meal.jpg'));
    expect(file.equals(bytes)).toBe(true);
  });
});
