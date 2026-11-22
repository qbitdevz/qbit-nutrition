import { NUTRIENT_UNITS, type NutrientCode } from '@/core/nutrition';
import { detectBasis, matchNutrient, normalizeLabel, suggestSheetMapping, unitInLabel } from './headers';
import type { ImportMapping, NutrientColumn, SheetMapping } from './mapping';
import type { Cell, Sheet, TableFile } from './readTypes';
import { detectDecimal } from './values';

/**
 * A preset recognises the LAYOUT of a published table (which row is the header, how the columns are labelled, where the units and the
 * markers are) and fills the mapping in. It is a description of structure only: no row, value, food or list of foods of any table is,
 * or may ever be, written here (S2, RN-16). Each person still downloads the file from the publisher and imports it themselves.
 *
 * Only tables the publisher offers as a spreadsheet have a preset. A table published only as a PDF or as a web query (BEDCA, the
 * Mexican INCMNSZ table, the Colombian TCAC, most of the LATINFOODS list) has none: the generic import reads a spreadsheet version of
 * it if the person has one (docs/guides/importing-food-tables.en.md).
 */
export interface Preset {
  id: string;
  /** The table's name as its publisher calls it. */
  name: string;
  /** The mapping (and a name for the collection) when `file` has this table's layout, null when it does not. */
  recognise(file: TableFile): { mapping: ImportMapping; tableName?: string } | null;
}

const cellText = (cell: Cell | undefined): string => (typeof cell === 'string' ? normalizeLabel(cell) : '');

const HEADER_SEARCH_ROWS = 15;

/** The label of a header cell, ignoring case, accents and punctuation: "Género - especie - variedad" is "genero especie variedad". */
const isTag = (cell: Cell | undefined): boolean => typeof cell === 'string' && /^<\s*[A-Za-z0-9_]+\s*>$/.test(cell.trim());

// ---------------------------------------------------------------------------------------------------------------------
// ARGENFOODS (Universidad Nacional de Luján): published as one .xls per food group.
//
// Layout (from the publisher's own files, checked 2026-11-22; structure only):
//   - one sheet per file; a few title lines (institution, address, the group's name in capitals, "per 100 g of edible portion");
//   - the header row: "Nº", "Alimento", "Género - especie - variedad", then one column per component with the unit in the
//     header in parentheses ("(kj)", "(Kcal)", "(g)", "(mg)"); a word may be split with a hyphen at a line end ("Carbohidra-tos");
//   - under it a row of INFOODS tagnames in angle brackets (a public identifier scheme) and a row of source references ("26*1");
//   - then the foods; a row with a name and no numbers is a heading; "..." marks a missing value, and an empty cell too.
// ---------------------------------------------------------------------------------------------------------------------

/** INFOODS tagnames (Food and Agriculture Organization's public nutrient identifiers) of the nutrients the app tracks. */
const INFOODS_TAGS: Readonly<Record<string, NutrientCode>> = {
  ENERC: 'kcal',
  PROTCNT: 'protein',
  FAT: 'fat',
  CHOCDF: 'carbs',
  FIBTG: 'fiber',
  SUGAR: 'sugars',
  FASAT: 'sat_fat',
  NA: 'sodium',
  K: 'potassium',
  CA: 'calcium',
  FE: 'iron',
  MG: 'magnesium',
  ZN: 'zinc',
  VITA_RAE: 'vit_a',
  VITC: 'vit_c',
  VITD: 'vit_d',
  VITB12: 'vit_b12',
  FOL: 'folate',
  FOLDFE: 'folate',
};

function argenfoodsHeader(sheet: Sheet): number {
  for (let r = 0; r < Math.min(sheet.rows.length, HEADER_SEARCH_ROWS); r++) {
    const row = sheet.rows[r]!;
    if (cellText(row[1]) !== 'alimento' || !cellText(row[2]).startsWith('genero especie')) continue;
    if ((sheet.rows[r + 1] ?? []).filter(isTag).length >= 3) return r;
  }
  return -1;
}

const sentenceCase = (text: string): string => {
  const t = text.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const argenfoods: Preset = {
  id: 'argenfoods',
  name: 'ARGENFOODS',
  recognise(file) {
    const index = file.sheets.findIndex((s) => argenfoodsHeader(s) >= 0);
    if (index < 0) return null;
    const sheet = file.sheets[index]!;
    const h = argenfoodsHeader(sheet);
    const base = suggestSheetMapping(sheet, index, { headerRow: h });
    const header = sheet.rows[h]!;
    const tags = sheet.rows[h + 1]!;
    // Tagnames are more reliable than the wording of the labels; the unit still comes from the header text.
    const byCode = new Map<NutrientCode, NutrientColumn[]>();
    tags.forEach((tag, column) => {
      if (!isTag(tag)) return;
      const code = INFOODS_TAGS[String(tag).replace(/[<>\s]/g, '').toUpperCase()];
      if (!code) return;
      const stated = typeof header[column] === 'string' ? unitInLabel(header[column] as string) : null;
      byCode.set(code, [...(byCode.get(code) ?? []), { column, unit: stated ?? NUTRIENT_UNITS[code], unitAssumed: stated === null }]);
    });
    const nutrients: SheetMapping['nutrients'] = { ...base.nutrients };
    for (const [code, list] of byCode) nutrients[code] = list.find((c) => c.unit === NUTRIENT_UNITS[code]) ?? list[0]!;

    // The reference row under the tags ("26*1") is not a food.
    const references = (sheet.rows[h + 2] ?? []).filter((c) => typeof c === 'string' && /^\d+\*\d+$/.test(c.trim())).length;
    const firstDataRow = h + (references >= 3 ? 3 : 2);
    // The group's name is the capitals title above the header ("CEREALES Y DERIVADOS"): one group for the whole file.
    let title: string | null = null;
    for (let r = h - 1; r >= 0 && title === null; r--) {
      const first = (sheet.rows[r] ?? []).find((c): c is string => typeof c === 'string' && c.trim() !== '');
      if (first && first === first.toUpperCase() && /\p{L}{3}/u.test(first) && !/POR 100/.test(first)) title = sentenceCase(first);
    }
    const sheetMapping: SheetMapping = { ...base, headerRow: h, firstDataRow, nameColumn: 1, groupColumn: null, groupFromSheetName: false, groupText: title, nutrients };
    const stated = detectBasis(sheet.rows.slice(0, h));
    return {
      mapping: { sheets: [sheetMapping], basis: stated.basis === 'other' ? 'g100' : stated.basis, basisAssumed: stated.basis === 'other' ? true : stated.assumed, decimal: detectDecimal(sheet.rows.slice(firstDataRow)), presetId: null },
      tableName: title ? `ARGENFOODS · ${title}` : 'ARGENFOODS',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// CIQUAL (ANSES, France): published as one Excel file (French and English editions) and as XML.
//
// Layout (the identifier columns are the publisher's own naming; the nutrient columns follow "<component> (<unit>/100 g)"):
//   - one sheet; the header on the first row;
//   - identifier columns `alim_grp_*`, `alim_ssgrp_*`, `alim_ssssgrp_*` (group codes and names), `alim_code`, `alim_nom_fr` or
//     `alim_nom_eng` (the food's name), `alim_nom_sci`;
//   - then one column per component with the unit and "/100 g" in the header, several for energy (kJ and kcal, different rules);
//   - missing values are written "-", "traces", or "< x" (below a limit); numbers may be text with a decimal comma.
// NOT VERIFIED AGAINST THE LIVE FILE: ciqual.anses.fr answered "maintenance" (HTTP 503) on 2026-11-22, so this layout is the one the
// publisher has used in earlier releases. If a release changes it, the preset does not recognise the file and the generic import
// (which reads the same labels) takes over.
// ---------------------------------------------------------------------------------------------------------------------

function ciqualHeader(sheet: Sheet): number {
  for (let r = 0; r < Math.min(sheet.rows.length, 3); r++) {
    const labels = (sheet.rows[r] ?? []).map(cellText);
    const hasName = labels.some((l) => /^alim nom (fr|eng)$/.test(l));
    const per100 = labels.filter((l) => /\b100 ?g\b/.test(l)).length;
    if (labels.includes('alim code') && hasName && per100 >= 3) return r;
  }
  return -1;
}

const ciqual: Preset = {
  id: 'ciqual',
  name: 'CIQUAL (ANSES)',
  recognise(file) {
    const index = file.sheets.findIndex((s) => ciqualHeader(s) >= 0);
    if (index < 0) return null;
    const sheet = file.sheets[index]!;
    const h = ciqualHeader(sheet);
    const labels = (sheet.rows[h] ?? []).map(cellText);
    const base = suggestSheetMapping(sheet, index, { headerRow: h });
    const nameColumn = labels.findIndex((l) => /^alim nom (fr|eng)$/.test(l));
    const groupColumn = labels.findIndex((l) => /^alim grp nom (fr|eng)$/.test(l));
    const sheetMapping: SheetMapping = { ...base, headerRow: h, firstDataRow: h + 1, nameColumn, groupColumn: groupColumn >= 0 ? groupColumn : null, groupFromSheetName: false, nutrients: base.nutrients };
    // Identifier columns are never nutrients.
    for (const code of Object.keys(sheetMapping.nutrients) as NutrientCode[]) {
      const column = sheetMapping.nutrients[code]!.column;
      if (column === nameColumn || column === groupColumn || matchNutrient(String((sheet.rows[h] ?? [])[column] ?? '')) !== code) delete sheetMapping.nutrients[code];
    }
    return { mapping: { sheets: [sheetMapping], basis: 'g100', basisAssumed: false, decimal: detectDecimal(sheet.rows.slice(h + 1)), presetId: null }, tableName: 'CIQUAL' };
  },
};

export const PRESETS: readonly Preset[] = [argenfoods, ciqual];

export const presetById = (id: string): Preset | null => PRESETS.find((p) => p.id === id) ?? null;

/** The first preset that recognises the file, with its mapping and a name for the collection. */
export function detectPreset(file: TableFile): { preset: Preset; mapping: ImportMapping; tableName: string } | null {
  for (const preset of PRESETS) {
    const found = preset.recognise(file);
    if (found) return { preset, mapping: { ...found.mapping, presetId: preset.id }, tableName: found.tableName ?? preset.name };
  }
  return null;
}
