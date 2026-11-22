import type { Cell } from './readTypes';

/**
 * What a table writes when it has no number for a nutrient. Every one of these becomes UNKNOWN, never zero: "traces" is not a
 * measurement, "not detected" depends on a detection limit nobody gave us, and an empty cell says nothing. The same list is shown
 * to the person on the mapping screen (rule set of S4), in this order.
 */
export const MISSING_MARKERS: readonly string[] = [
  '-', '–', '—', '.', '..', '...', '?', 'x', '*', 'tr', 'tr.', 'trace', 'traces', 'traza', 'trazas', 'trazo', 'trazos', 'traco', 'tracos', 'traço', 'traços', 'vestigios',
  'nd', 'n.d.', 'n/d', 'n.d', 'nd.', 'na', 'n.a.', 'n/a', 'n.a', 'nc', 'n.c.', 'ne', 'sd', 's/d', 's.d.', 'no detectado', 'no determinado', 'no disponible',
  'non detecte', 'non détecté', 'nao detectado', 'não detectado', 'not detected', 'not determined', 'not available', 'null', 'nan', '#n/a',
];

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const MARKER_SET: ReadonlySet<string> = new Set(MISSING_MARKERS.map(normalize));
/** "<0,1", "< 0.5", "<LOQ": below a limit, which is not a value. */
const BELOW_LIMIT = /^<\s*[\d.,]*\s*[a-z]*$/;

export type ParsedValue = { kind: 'number'; value: number } | { kind: 'missing' } | { kind: 'invalid' };

const NUMBER = /^[+-]?(\d+([.,]\d+)*|[.,]\d+)(e[+-]?\d+)?$/i;

/**
 * One value, with `decimal` as the table's decimal separator. A number that is only readable one way is read that way
 * (`52,5` in a point table is 52.5); groups of three digits after a first group are thousands (`1.234,5`, `1,234`),
 * and a leading zero is never a group (`0,125` is 0.125). Brackets around a number are dropped.
 */
export function parseValue(cell: Cell, decimal: ',' | '.'): ParsedValue {
  if (cell === null) return { kind: 'missing' };
  if (typeof cell === 'number') return Number.isFinite(cell) ? { kind: 'number', value: cell } : { kind: 'missing' };
  const raw = cell.trim();
  if (raw === '') return { kind: 'missing' };
  const marker = normalize(raw);
  if (MARKER_SET.has(marker) || BELOW_LIMIT.test(marker)) return { kind: 'missing' };

  let text = raw.replace(/[\s  ]/g, '');
  const bracketed = /^[([](.*)[)\]]$/.exec(text);
  if (bracketed) text = bracketed[1]!;
  if (!NUMBER.test(text)) return { kind: 'invalid' };

  const other = decimal === ',' ? '.' : ',';
  const hasDecimal = text.includes(decimal);
  const hasOther = text.includes(other);
  let normalized: string;
  if (hasDecimal && hasOther) {
    // Both appear: the last one is the decimal separator, the other groups thousands.
    const lastDecimal = text.lastIndexOf(decimal);
    const lastOther = text.lastIndexOf(other);
    const [dec, group] = lastDecimal > lastOther ? [decimal, other] : [other, decimal];
    if (text.split(dec).length > 2) return { kind: 'invalid' };
    normalized = text.split(group).join('').replace(dec, '.');
  } else if (hasOther) {
    const groups = new RegExp(`^[+-]?[1-9]\\d{0,2}(\\${other}\\d{3})+$`);
    if (groups.test(text)) normalized = text.split(other).join('');
    else if (text.split(other).length > 2) return { kind: 'invalid' };
    else normalized = text.replace(other, '.');
  } else if (hasDecimal) {
    if (text.split(decimal).length > 2) return { kind: 'invalid' };
    normalized = text.replace(decimal, '.');
  } else normalized = text;

  const value = Number(normalized);
  return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'invalid' };
}

/**
 * The decimal separator of a table, from the numbers written as text (spreadsheet numbers say nothing): a comma followed by one or
 * two digits, or four or more, is a decimal comma; a point likewise. Exactly three digits are ambiguous (`1,234`) and count for
 * nothing. With no evidence the answer is the point.
 */
export function detectDecimal(rows: readonly (readonly Cell[])[]): ',' | '.' {
  let comma = 0;
  let point = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      const text = cell.trim();
      if (/^[+-]?\d+,(\d{1,2}|\d{4,})$/.test(text)) comma += 1;
      else if (/^[+-]?\d+\.(\d{1,2}|\d{4,})$/.test(text)) point += 1;
    }
  }
  return comma > point ? ',' : '.';
}
