/** @jest-environment node */
import { decodeText } from '../bytes';
import { parseCsv } from '../csv';
import { ImportReadError, readTableFile, READ_LIMITS } from '../readFile';
import { SPANISH_CSV, latin1, makeWorkbook, utf16le, utf8, utf8Bom } from '../testing/synthetic';

describe('decoding text', () => {
  it('reads UTF-8 with and without a byte order mark', () => {
    expect(decodeText(utf8('Plátano')).text).toBe('Plátano');
    expect(decodeText(utf8Bom('Plátano'))).toEqual({ text: 'Plátano', encoding: 'utf-8' });
  });
  it('reads Latin-1 / Windows-1252 when the bytes are not valid UTF-8', () => {
    expect(decodeText(latin1('Piña; Jalapeño; µg'))).toEqual({ text: 'Piña; Jalapeño; µg', encoding: 'windows-1252' });
    expect(decodeText(new Uint8Array([0x80, 0x41])).text).toBe('€A'); // cp1252 maps 0x80 to the euro sign
  });
  it('reads UTF-16 with a byte order mark', () => {
    expect(decodeText(utf16le('Açaí;1'))).toEqual({ text: 'Açaí;1', encoding: 'utf-16le' });
  });
});

describe('parsing CSV', () => {
  const parse = async (text: string) => parseCsv(text);

  it('detects ; , tab and | as the separator', async () => {
    expect((await parse('a;b;c\n1;2;3')).delimiter).toBe(';');
    expect((await parse('a,b,c\n1,2,3')).delimiter).toBe(',');
    expect((await parse('a\tb\tc\n1\t2\t3')).delimiter).toBe('\t');
    expect((await parse('a|b|c\n1|2|3')).delimiter).toBe('|');
  });
  it('prefers ; over , when decimal commas make both look regular', async () => {
    const { delimiter, rows } = await parse('Nombre;kcal;g\nA;52,5;0,3\nB;10,1;2,2');
    expect(delimiter).toBe(';');
    expect(rows[1]).toEqual(['A', '52,5', '0,3']);
  });
  it('handles quotes, doubled quotes, separators and line breaks inside quotes, CRLF and blank cells', async () => {
    const { rows } = await parse('name,note\r\n"Soup, ""thick""","line1\nline2"\r\nplain,\r\n');
    expect(rows).toEqual([['name', 'note'], ['Soup, "thick"', 'line1\nline2'], ['plain', null]]);
  });
  it('turns empty cells into null and keeps empty lines as empty rows', async () => {
    const { rows } = await parse('a;b\n\n1;');
    expect(rows).toEqual([['a', 'b'], [], ['1', null]]);
  });
  it('refuses a file with too many columns', async () => {
    const wide = Array.from({ length: READ_LIMITS.maxColumns + 1 }, (_, i) => `c${i}`).join(',');
    await expect(parse(`${wide}\n1`)).rejects.toMatchObject({ code: 'too_many_columns' });
  });
  it('stops when cancelled', async () => {
    const lines = Array.from({ length: 50_000 }, (_, i) => `f${i};${i}`).join('\n');
    const token = { cancelled: false };
    const run = parseCsv(lines, { cancel: token, onProgress: (f) => f > 0.1 && (token.cancelled = true) });
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe('reading a file', () => {
  it('reads a CSV as one sheet named after the file, in each encoding', async () => {
    for (const bytes of [utf8(SPANISH_CSV), utf8Bom(SPANISH_CSV), latin1(SPANISH_CSV), utf16le(SPANISH_CSV)]) {
      const file = await readTableFile(bytes, 'tabla.csv');
      expect(file.kind).toBe('csv');
      expect(file.sheets).toHaveLength(1);
      expect(file.sheets[0]!.rows[0]![2]).toBe('Energía (kcal)');
      expect(file.sheets[0]!.rows[1]).toEqual(['Manzana inventada', 'Frutas', '52,5', '0,3', '13,8', '0,2', '1']);
    }
  });

  it('reads .xlsx and legacy .xls workbooks: every sheet, numbers as numbers, text as text', async () => {
    const sheets = [
      { name: 'Frutas', rows: [['Alimento', 'kcal'], ['Pera inventada', 57.25], ['Higo', 'tr']] },
      { name: 'Verduras', rows: [['Alimento', 'kcal'], ['Zanahoria ficticia', 41]] },
    ];
    for (const format of ['xlsx', 'xls'] as const) {
      const file = await readTableFile(makeWorkbook(sheets, format), `tabla.${format}`);
      expect(file.kind).toBe(format);
      expect(file.sheets.map((s) => s.name)).toEqual(['Frutas', 'Verduras']);
      expect(file.sheets[0]!.rows).toEqual([['Alimento', 'kcal'], ['Pera inventada', 57.25], ['Higo', 'tr']]);
      expect(file.sheets[1]!.rows[1]).toEqual(['Zanahoria ficticia', 41]);
    }
  });

  it('recognises a workbook by its content, not its name', async () => {
    const file = await readTableFile(makeWorkbook([{ name: 'S', rows: [['a', 'b'], [1, 2]] }]), 'export.csv');
    expect(file.kind).toBe('xlsx');
  });

  it('refuses a file over the size limit with a specific error, without reading it', async () => {
    const big = new Uint8Array(READ_LIMITS.maxFileBytes + 1);
    await expect(readTableFile(big, 'x.csv')).rejects.toMatchObject({ code: 'too_large' });
    await expect(readTableFile(big, 'x.xlsx')).rejects.toBeInstanceOf(ImportReadError);
  });

  it('refuses an empty file, a damaged workbook and a format it does not read', async () => {
    await expect(readTableFile(new Uint8Array(0), 'x.csv')).rejects.toMatchObject({ code: 'empty' });
    const bytes = makeWorkbook([{ name: 'S', rows: [['a'], [1]] }]);
    await expect(readTableFile(bytes.slice(0, 40), 'x.xlsx')).rejects.toMatchObject({ code: 'damaged' });
    await expect(readTableFile(utf8('%PDF-1.7 ....'), 'tabla.pdf')).rejects.toMatchObject({ code: 'unsupported' });
    await expect(readTableFile(utf8('<html><body>no</body></html>'), 'tabla.xls')).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('refuses a workbook that would unpack to far more than its size (a zip bomb)', async () => {
    const bytes = makeWorkbook([{ name: 'S', rows: [['a'], [1]] }]);
    await expect(readTableFile(bytes, 'x.xlsx', { limits: { maxUnpackedBytes: 10 } })).rejects.toMatchObject({ code: 'unpacked_too_large' });
  });

  it('refuses a sheet with more rows than the limit', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => [`f${i}`, i]);
    await expect(readTableFile(makeWorkbook([{ name: 'S', rows }]), 'x.xlsx', { limits: { maxRowsPerSheet: 10 } })).rejects.toMatchObject({ code: 'too_many_rows' });
    await expect(readTableFile(utf8(rows.map((r) => r.join(';')).join('\n')), 'x.csv', { limits: { maxRowsPerSheet: 10 } })).rejects.toMatchObject({ code: 'too_many_rows' });
  });
});
