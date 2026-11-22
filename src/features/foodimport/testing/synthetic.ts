/// <reference types="node" />
/**
 * Test-only: SYNTHETIC files for the importer. Every food and number here is invented; they only imitate the
 * shape of real tables (separators, sheets, header rows). Never put a row of a real table in here (docs/guides, S2).
 * Never import this from app code.
 */
import * as XLSX from '@e965/xlsx';

export type SyntheticCell = string | number | null;
export interface SyntheticSheet {
  name: string;
  rows: SyntheticCell[][];
}

/** A workbook as bytes: `xlsx` (the current format) or `xls` (the legacy binary format older tables use). */
export function makeWorkbook(sheets: SyntheticSheet[], format: 'xlsx' | 'xls' = 'xlsx'): Uint8Array {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows as unknown[][]), sheet.name);
  const out = XLSX.write(book, { type: 'array', bookType: format === 'xls' ? 'biff8' : 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}

export const utf8 = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'utf8'));
export const latin1 = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'latin1'));
export const utf8Bom = (text: string): Uint8Array => new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]));
export const utf16le = (text: string): Uint8Array => new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));

/** An invented table, Spanish headers, decimal commas and `;` as the separator. */
export const SPANISH_CSV = [
  'Alimento;Grupo;Energía (kcal);Proteínas (g);Hidratos de carbono (g);Grasa total (g);Sodio (mg)',
  'Manzana inventada;Frutas;52,5;0,3;13,8;0,2;1',
  'Pan de ejemplo;Cereales;265;9;49;3,2;491',
  'Yogur ficticio;Lácteos;tr;3,5;4,7;nd;46',
].join('\n');
