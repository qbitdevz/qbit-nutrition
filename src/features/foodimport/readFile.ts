import { unzipSync } from 'fflate';

import { decodeText } from './bytes';
import { parseCsv } from './csv';
import { ImportReadError, READ_LIMITS, throwIfCancelled, yieldToUi, type Cell, type ReadLimits, type ReadOptions, type Sheet, type TableFile } from './readTypes';

export { ImportReadError, READ_LIMITS } from './readTypes';
export type { Cell, CancelToken, ImportReadErrorCode, ReadLimits, ReadOptions, Sheet, TableFile, TableKind } from './readTypes';

const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
/** The OLE2 container of the legacy binary `.xls` format. */
const isOle = (b: Uint8Array) => b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
const startsWith = (b: Uint8Array, text: string) => text.split('').every((ch, i) => b[i] === ch.charCodeAt(0));

const baseName = (fileName: string) => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '') || fileName;

/** A text file's first bytes that no text table has: control characters other than tab and line breaks (a binary file renamed .csv). */
function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return false;
  for (let i = 0; i < n; i++) {
    const b = bytes[i]!;
    if (b === 0 || (b < 9) || (b > 13 && b < 32 && b !== 27)) return true;
  }
  return false;
}

function limitsOf(options: ReadOptions): ReadLimits {
  return { ...READ_LIMITS, ...options.limits };
}

/** An `.xlsx` is a ZIP: its declared sizes are summed from the directory, without unpacking a byte. */
function checkUnpackedSize(bytes: Uint8Array, limit: number): void {
  let total = 0;
  try {
    unzipSync(bytes, {
      filter: (entry) => {
        total += entry.originalSize;
        if (total > limit) throw new ImportReadError('unpacked_too_large', limit);
        return false;
      },
    });
  } catch (error) {
    if (error instanceof ImportReadError) throw error;
    throw new ImportReadError('damaged');
  }
}

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = typeof value === 'string' ? value : String(value);
  return text.trim() === '' ? null : text;
}

async function readWorkbook(bytes: Uint8Array, options: ReadOptions, limits: ReadLimits): Promise<Sheet[]> {
  if (isZip(bytes)) checkUnpackedSize(bytes, limits.maxUnpackedBytes);
  throwIfCancelled(options.cancel);
  options.onProgress?.(0.1);
  // The spreadsheet reader is large: it is first required here (Metro's inline requires), not when the app starts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('@e965/xlsx') as typeof import('@e965/xlsx');
  // Parsing a workbook is one synchronous call: let the screen show "reading" before it starts, and honour a Cancel pressed before it.
  await yieldToUi();
  throwIfCancelled(options.cancel);
  options.onProgress?.(0.3);
  let book;
  try {
    book = XLSX.read(bytes, { type: 'array', dense: true, cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
  } catch {
    throw new ImportReadError('damaged');
  }
  if (book.SheetNames.length > limits.maxSheets) throw new ImportReadError('too_many_sheets', limits.maxSheets);
  const sheets: Sheet[] = [];
  book.SheetNames.forEach((name, index) => {
    const ws = book.Sheets[name];
    if (!ws || !ws['!ref']) {
      sheets.push({ name, rows: [] });
      return;
    }
    const range = XLSX.utils.decode_range(ws['!ref']);
    // The size of the sheet as the file declares it, checked before any row is built.
    if (range.e.r + 1 > limits.maxRowsPerSheet) throw new ImportReadError('too_many_rows', limits.maxRowsPerSheet);
    if (range.e.c + 1 > limits.maxColumns) throw new ImportReadError('too_many_columns', limits.maxColumns);
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true, range: { s: { r: 0, c: 0 }, e: range.e } });
    const rows = raw.map((r) => {
      const cells = r.map(toCell);
      return cells.every((c) => c === null) ? [] : cells;
    });
    while (rows.length > 0 && rows[rows.length - 1]!.length === 0) rows.pop();
    sheets.push({ name, rows });
    options.onProgress?.(0.3 + (0.7 * (index + 1)) / book.SheetNames.length);
  });
  return sheets;
}

/**
 * Reads a table file the person picked: CSV (any common separator, quoted fields, UTF-8, UTF-16 or Latin-1) or a spreadsheet
 * (`.xlsx`, or the legacy `.xls`). What it is comes from the first bytes, not the name. Everything is read into memory, so
 * every bound of `READ_LIMITS` is enforced before the work it guards. Nothing here touches the network.
 * Throws `ImportReadError`.
 */
export async function readTableFile(bytes: Uint8Array, fileName: string, options: ReadOptions = {}): Promise<TableFile> {
  const limits = limitsOf(options);
  if (bytes.length > limits.maxFileBytes) throw new ImportReadError('too_large', limits.maxFileBytes);
  if (bytes.length === 0) throw new ImportReadError('empty');
  throwIfCancelled(options.cancel);

  if (isZip(bytes) || isOle(bytes)) {
    const sheets = await readWorkbook(bytes, options, limits);
    if (sheets.every((s) => s.rows.length === 0)) throw new ImportReadError('empty');
    return { fileName, kind: isZip(bytes) ? 'xlsx' : 'xls', sheets };
  }
  if (startsWith(bytes, '%PDF') || /\.pdf$/i.test(fileName) || looksBinary(bytes)) throw new ImportReadError('unsupported');

  const { text, encoding } = decodeText(bytes);
  // A "spreadsheet" that is really a web page or XML (some sites save HTML as .xls): not a table this reads.
  if (/^\s*</.test(text)) throw new ImportReadError('unsupported');
  const { rows, delimiter } = await parseCsv(text, options);
  while (rows.length > 0 && rows[rows.length - 1]!.length === 0) rows.pop();
  if (rows.length === 0) throw new ImportReadError('empty');
  return { fileName, kind: 'csv', encoding, delimiter, sheets: [{ name: baseName(fileName), rows }] };
}
