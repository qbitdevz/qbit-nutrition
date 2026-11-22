import { ImportReadError, READ_LIMITS, throwIfCancelled, yieldToUi, type Cell, type ReadOptions } from './readTypes';

/** In order of preference when two look equally regular: decimal commas make `,` look regular in a `;` file, never the other way round. */
const DELIMITERS = ['\t', ';', '|', ','] as const;

/** The separator of a text table: the one that splits the first lines into the same number of cells, outside quotes. */
export function detectDelimiter(text: string): string {
  const sample = text.length > 200_000 ? text.slice(0, 200_000) : text;
  const perLine: Record<string, number[]> = { '\t': [], ';': [], '|': [], ',': [] };
  let current: Record<string, number> = { '\t': 0, ';': 0, '|': 0, ',': 0 };
  let lines = 0;
  let hasContent = false;
  let quoted = false;
  const endLine = () => {
    if (hasContent) {
      for (const d of DELIMITERS) perLine[d]!.push(current[d]!);
      lines += 1;
    }
    current = { '\t': 0, ';': 0, '|': 0, ',': 0 };
    hasContent = false;
  };
  for (let i = 0; i < sample.length && lines < 40; i++) {
    const ch = sample[i]!;
    if (ch === '"') {
      quoted = !quoted;
      hasContent = true;
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && sample[i + 1] === '\n') i += 1;
      endLine();
    } else {
      if (!quoted && current[ch] !== undefined) current[ch]! += 1;
      if (ch !== ' ') hasContent = true;
    }
  }
  endLine();
  let best: string = ',';
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const counts = perLine[d]!;
    const filled = counts.filter((c) => c > 0);
    if (filled.length === 0) continue;
    // How many lines split into the same number of cells as the most common split: a regular separator scores high.
    const modal = [...filled].sort((a, b) => filled.filter((x) => x === b).length - filled.filter((x) => x === a).length)[0]!;
    const score = counts.filter((c) => c === modal).length;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export interface ParsedCsv {
  rows: Cell[][];
  delimiter: string;
}

const CHECK_EVERY = 25_000;

/**
 * Splits text into rows of cells: quoted fields with doubled quotes, separators and line breaks inside quotes, CRLF, LF or CR
 * line ends. An empty cell is `null`; every other cell is exactly the text in the file (numbers are read later, with the decimal
 * rule the person sees). Gives the UI a turn every so often and stops when cancelled.
 */
export async function parseCsv(text: string, options: ReadOptions & { delimiter?: string } = {}): Promise<ParsedCsv> {
  const maxRows = options.limits?.maxRowsPerSheet ?? READ_LIMITS.maxRowsPerSheet;
  const maxColumns = options.limits?.maxColumns ?? READ_LIMITS.maxColumns;
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  let hadQuotes = false;
  const n = text.length;

  const endField = () => {
    row.push(hadQuotes ? field : field.trim() === '' ? null : field);
    if (row.length > maxColumns) throw new ImportReadError('too_many_columns', maxColumns);
    field = '';
    hadQuotes = false;
  };
  const endRow = () => {
    endField();
    // A line with no characters at all is an empty row (kept, so row numbers match what a spreadsheet shows).
    rows.push(row.length === 1 && row[0] === null ? [] : row);
    if (rows.length > maxRows) throw new ImportReadError('too_many_rows', maxRows);
    row = [];
  };

  for (let i = 0; i < n; i++) {
    if (i % CHECK_EVERY === 0 && i > 0) {
      throwIfCancelled(options.cancel);
      options.onProgress?.(i / n);
      await yieldToUi();
      throwIfCancelled(options.cancel);
    }
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
      hadQuotes = true;
    } else if (ch === delimiter) endField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
    } else field += ch;
  }
  // The last line has no line break: it still counts, unless the file ended on one.
  if (field !== '' || hadQuotes || row.length > 0) endRow();
  options.onProgress?.(1);
  return { rows, delimiter };
}
