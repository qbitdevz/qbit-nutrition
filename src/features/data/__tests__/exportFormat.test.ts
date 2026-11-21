import { validDocument } from '../../testing/validDocument';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, ExportDocumentSchema, parseExportDocument } from '../exportFormat';

const clone = (): any => JSON.parse(JSON.stringify(validDocument()));

describe('ExportDocumentSchema (the single definition of the export format)', () => {
  it('accepts a complete document', () => {
    expect(ExportDocumentSchema.safeParse(validDocument()).success).toBe(true);
  });

  it('accepts the smallest document: no profile, nothing else', () => {
    const doc = { ...validDocument(), profile: null, goals: [], body_measurements: [], meals: [], custom_foods: [], food_usage: [], match_memory: [], ai_providers: [], settings: {} };
    expect(ExportDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('names the format and its version', () => {
    expect(EXPORT_FORMAT).toBe('qbit-nutrition-export');
    expect(EXPORT_FORMAT_VERSION).toBe(1);
  });

  it('has no place for an API key: an extra field is dropped, never carried', () => {
    const doc = clone();
    doc.ai_providers[0].api_key = 'sk-secret';
    doc.ai_providers[0].apiKey = 'sk-secret';
    const parsed = ExportDocumentSchema.parse(doc);
    expect(JSON.stringify(parsed)).not.toContain('sk-secret');
    expect(Object.keys(parsed.ai_providers[0]!).sort()).toEqual(
      ['adapter', 'base_url', 'id', 'is_active', 'label', 'last_test_at', 'last_test_result', 'model', 'output_mode', 'preset', 'timeout_s'],
    );
  });
});

describe('parseExportDocument', () => {
  it('reads a valid document', () => {
    const result = parseExportDocument(validDocument());
    expect(result.ok).toBe(true);
  });

  it('says it is not an export when the format is another', () => {
    expect(parseExportDocument({ format: 'something-else', format_version: 1 })).toEqual({ ok: false, code: 'not_export' });
    expect(parseExportDocument([])).toEqual({ ok: false, code: 'not_export' });
    expect(parseExportDocument('text')).toEqual({ ok: false, code: 'not_export' });
    expect(parseExportDocument(null)).toEqual({ ok: false, code: 'not_export' });
  });

  it('refuses a newer version before reading anything else, and says which one it is', () => {
    expect(parseExportDocument({ format: EXPORT_FORMAT, format_version: 2, meals: 'whatever the new shape is' })).toEqual({
      ok: false,
      code: 'newer_version',
      fileVersion: 2,
      supportedVersion: 1,
    });
  });

  it('refuses a version that is not a positive whole number', () => {
    for (const format_version of [0, -1, 1.5, '1', null]) {
      expect(parseExportDocument({ ...validDocument(), format_version })).toMatchObject({ ok: false, code: 'invalid' });
    }
  });

  it('points at the exact place of a wrong type inside a meal', () => {
    const doc = clone();
    doc.meals[0].items[0].grams = 'lots';
    expect(parseExportDocument(doc)).toEqual({ ok: false, code: 'invalid', where: 'meals[0].items[0].grams' });
  });

  it('points at a missing field', () => {
    const doc = clone();
    delete doc.meals[0].slot;
    expect(parseExportDocument(doc)).toEqual({ ok: false, code: 'invalid', where: 'meals[0].slot' });
  });

  it('refuses a value the database would refuse: a negative amount, an unknown slot, a bad date', () => {
    const negative = clone();
    negative.meals[0].items[0].grams = -5;
    expect(parseExportDocument(negative)).toMatchObject({ ok: false, where: 'meals[0].items[0].grams' });

    const slot = clone();
    slot.meals[0].slot = 'brunch';
    expect(parseExportDocument(slot)).toMatchObject({ ok: false, where: 'meals[0].slot' });

    const date = clone();
    date.meals[0].local_date = '2026-02-31';
    expect(parseExportDocument(date)).toMatchObject({ ok: false, where: 'meals[0].local_date' });

    const nutrient = clone();
    nutrient.meals[0].items[0].nutrients = { unobtainium: 3 };
    expect(parseExportDocument(nutrient)).toMatchObject({ ok: false, where: 'meals[0].items[0].nutrients' });

    const headline = clone();
    headline.meals[0].items[0].nutrients = { kcal: 3 };
    expect(parseExportDocument(headline)).toMatchObject({ ok: false, where: 'meals[0].items[0].nutrients' });
  });

  it('refuses rows that would collide: repeated ids, two open goals, two active providers, a repeated day', () => {
    const ids = clone();
    ids.meals.push({ ...ids.meals[0] });
    expect(parseExportDocument(ids)).toMatchObject({ ok: false, where: 'meals[1].id' });

    const itemIds = clone();
    itemIds.meals[0].items.push({ ...itemIds.meals[0].items[0], position: 1 });
    expect(parseExportDocument(itemIds)).toMatchObject({ ok: false });

    const goals = clone();
    goals.goals.push({ ...goals.goals[0], id: 'goal-2', start_date: '2026-03-01' });
    expect(parseExportDocument(goals)).toMatchObject({ ok: false, where: 'goals[1].end_date' });

    const providers = clone();
    providers.ai_providers.push({ ...providers.ai_providers[0], id: 'prov-2' });
    expect(parseExportDocument(providers)).toMatchObject({ ok: false, where: 'ai_providers[1].is_active' });

    const days = clone();
    days.body_measurements.push({ ...days.body_measurements[0], id: 'bm-2' });
    expect(parseExportDocument(days)).toMatchObject({ ok: false, where: 'body_measurements[1].measured_on' });
  });

  it('refuses a goal that ends before it starts', () => {
    const doc = clone();
    doc.goals[0].end_date = '2025-12-31';
    expect(parseExportDocument(doc)).toMatchObject({ ok: false, where: 'goals[0].end_date' });
  });

  it('refuses a provider URL that creating a profile would refuse', () => {
    for (const url of ['http://api.example.com/v1', 'https://user:pass@api.example.com/v1', 'ftp://x']) {
      const doc = clone();
      doc.ai_providers[0].base_url = url;
      expect(parseExportDocument(doc)).toMatchObject({ ok: false, where: 'ai_providers[0].base_url' });
    }
    const local = clone();
    local.ai_providers[0].base_url = 'http://192.168.1.5:11434/v1';
    expect(parseExportDocument(local).ok).toBe(true);
  });

  it('only lets a meal point at a photo inside the photos folder, with a plain name', () => {
    for (const bad of ['../secret.jpg', '/etc/passwd', 'photos/../x.jpg', 'photos/a/b.jpg', 'photos/a.png', 'C:\\x.jpg', 'photos/']) {
      const doc = clone();
      doc.meals[0].photo_path = bad;
      expect(parseExportDocument(doc)).toMatchObject({ ok: false, where: 'meals[0].photo_path' });
    }
    const ok = clone();
    ok.meals[0].photo_path = 'photos/abc-123_x.jpg';
    expect(parseExportDocument(ok).ok).toBe(true);
  });
});
