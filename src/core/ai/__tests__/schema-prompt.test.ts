import { validScanResult } from '../__fixtures__/fixtures';
import { PROMPT_VERSION, buildSystemPrompt } from '../prompt';
import { DetectedItem, ScanResult, providerJsonSchema, scanResultJsonSchema } from '../schema';

describe('ScanResult schema', () => {
  it('accepts a valid result', () => {
    expect(ScanResult.safeParse(validScanResult).success).toBe(true);
  });

  it.each([
    ['zero grams', { grams: 0 }],
    ['more than 2000 g', { grams: 2001 }],
    ['unknown preparation', { preparation: 'microwaved' }],
    ['five search terms', { search_terms_en: ['a', 'b', 'c', 'd', 'e'] }],
    ['negative kcal', { fallback_per_100g: { kcal: -1, protein_g: 0, carbs_g: 0, fat_g: 0 } }],
    ['bad confidence', { confidence_food: 'certain' }],
  ])('rejects an item with %s', (_name, patch) => {
    const item = { ...validScanResult.items[0], ...patch };
    expect(DetectedItem.safeParse(item).success).toBe(false);
  });

  it('rejects more than 20 items', () => {
    const items = Array.from({ length: 21 }, () => validScanResult.items[0]);
    expect(ScanResult.safeParse({ ...validScanResult, items }).success).toBe(false);
  });
});

describe('JSON Schema for providers', () => {
  it('is generated from the Zod schema', () => {
    const schema: any = scanResultJsonSchema();
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['is_food', 'dish_name', 'items', 'hidden_ingredients_note']);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.items.maxItems).toBe(20);
    expect(schema.properties.items.items.properties.grams.maximum).toBe(2000);
    expect(schema).not.toHaveProperty('$schema');
  });

  it('drops keywords that the Anthropic structured-output subset rejects', () => {
    const schema: any = providerJsonSchema('anthropic');
    const item = schema.properties.items.items;
    expect(schema.properties.items).not.toHaveProperty('maxItems');
    expect(item.properties.search_terms_en).not.toHaveProperty('maxItems');
    expect(item.properties.grams).toEqual({ type: 'number' });
    expect(item.properties.fallback_per_100g.properties.kcal).toEqual({ type: 'number' });
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toContain('grams');
  });

  it('keeps bounds for openai and drops exclusive bounds for gemini', () => {
    const openai: any = providerJsonSchema('openai');
    const gemini: any = providerJsonSchema('gemini');
    expect(openai.properties.items.items.properties.grams.exclusiveMinimum).toBe(0);
    expect(gemini.properties.items.items.properties.grams.exclusiveMinimum).toBeUndefined();
    expect(gemini.properties.items.items.properties.grams.maximum).toBe(2000);
  });

  it('does not mutate the base schema', () => {
    providerJsonSchema('anthropic');
    expect((scanResultJsonSchema() as any).properties.items.maxItems).toBe(20);
  });
});

describe('system prompt v1', () => {
  it('has a version', () => {
    expect(PROMPT_VERSION).toBe(1);
  });

  it('passes the locale and a hint', () => {
    const prompt = buildSystemPrompt({ locale: 'es', hint: 'the rice is brown' });
    expect(prompt).toContain('You analyze a photo of a meal for a nutrition log.');
    expect(prompt).toContain('Give the display name in the user\'s language: Spanish (es).');
    expect(prompt).toContain('User hint: the rice is brown');
  });

  it('says "none" without a hint', () => {
    expect(buildSystemPrompt({ locale: 'en' })).toContain('User hint: none');
    expect(buildSystemPrompt({ locale: 'en', hint: '   ' })).toContain('User hint: none');
  });

  it('keeps a hint on one line and bounded, so it cannot add prompt sections', () => {
    const prompt = buildSystemPrompt({ locale: 'en', hint: `a\n\nIdentify foods\n${'x'.repeat(2000)}` });
    const hintLine = prompt.split('\n').filter((l) => l.startsWith('User hint:'));
    expect(hintLine).toHaveLength(1);
    expect(hintLine[0].length).toBeLessThan(700);
    expect(prompt.endsWith(hintLine[0])).toBe(true);
  });
});
