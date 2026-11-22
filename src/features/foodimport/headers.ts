import { NUTRIENT_UNITS, parseSourceUnit, unitRule, type NutrientCode, type SourceUnit } from '@/core/nutrition';
import { detectDecimal } from './values';
import type { Basis, ImportMapping, NutrientColumn, SheetMapping } from './mapping';
import type { Cell, Sheet, TableFile } from './readTypes';

/**
 * Header labels in Spanish, English, Portuguese and French, so the mapping screen starts filled in. It only suggests: the person
 * sees every choice and can change it. A label that is not recognised stays unmapped (nothing is guessed from the numbers).
 */

/** Lowercase, no diacritics, punctuation to single spaces ("Énergie (kcal/100 g)" is "energie kcal 100 g"). */
export function normalizeLabel(label: string): string {
  return label
    .replace(/[µμ]/g, 'u')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    // A word split by a hyphen at the end of a line ("Carbohidra-tos") is one word.
    .replace(/([a-z])-([a-z])/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface Rule {
  code: NutrientCode;
  match: RegExp;
  /** Words that make the label something else (added sugars are not sugars, "fat" in "saturated fat" is not total fat). */
  not?: RegExp;
}

/** Order matters: the first rule a label satisfies claims it (saturated fat before fat). */
const RULES: Rule[] = [
  { code: 'sat_fat', match: /\b(satur\w*|sat fat|ags)\b/, not: /\b(mono\w*|poli\w*|poly\w*|trans)\b/ },
  { code: 'kcal', match: /\b(kcal|calorias?|calories?|caloricos?|energia|energy|energie|valor energetico|valeur energetique)\b/ },
  { code: 'protein', match: /\b(proteinas?|proteines?|proteins?|protides?|prot)\b/ },
  { code: 'carbs', match: /\b(carbohidratos?|carbohydrates?|carboidratos?|glucides?|glucidos?|hidratos?( de carbono)?|carbs|cho)\b/ },
  { code: 'fat', match: /\b(grasas?|lipidos?|lipides?|lipideos?|lipidios?|fat|fats|gordura|gorduras|matieres grasses)\b/, not: /\b(mono\w*|poli\w*|poly\w*|trans|colesterol|cholesterol|acidos?|acides?|omega)\b/ },
  { code: 'fiber', match: /\b(fibras?|fibres?|fibers?)\b/ },
  { code: 'sugars', match: /\b(azucar\w*|sugars?|acucar\w*|sucres?)\b/, not: /\b(anadid\w*|added|adicion\w*|ajoutes?|libres|free|reducto\w*)\b/ },
  { code: 'sodium', match: /\b(sodio|sodium)\b|^na\b/ },
  { code: 'potassium', match: /\b(potasio|potassium|potassio)\b|^k\b/ },
  { code: 'calcium', match: /\b(calcio|calcium)\b|^ca\b/ },
  { code: 'iron', match: /\b(hierro|iron|ferro|fer)\b|^fe\b/ },
  { code: 'magnesium', match: /\b(magnesio|magnesium)\b/ },
  { code: 'zinc', match: /\b(zinc|zinco)\b|^zn\b/ },
  { code: 'vit_b12', match: /\bb ?12\b|\b(cobalamin\w*|cianocobalamin\w*)\b/ },
  { code: 'vit_a', match: /\bvitamin[ae]? a\b|\bvit a\b/, not: /carot/ },
  { code: 'vit_c', match: /\bvitamin[ae]? c\b|\bvit c\b|\bascorb\w*/ },
  { code: 'vit_d', match: /\bvitamin[ae]? d\b|\bvit d\b/ },
  { code: 'folate', match: /\b(folatos?|folates?|folacin\w*|folic\w*|acido folico|acide folique)\b/ },
];

const NAME = /^(alimentos?|nombre|descripcion|food|food name|food item|name|description|nome|aliment|nom|designation|denomination|libelle|producto|ingrediente|item)( |$)/;
const GROUP = /^(grupo|group|groupe|categoria|category|categorie|tipo|familia|clase)( |$)|\b(food group|grupo de alimentos|groupe d aliments?)\b/;

export function matchNutrient(label: string): NutrientCode | null {
  const n = normalizeLabel(label);
  if (n === '') return null;
  for (const rule of RULES) if (rule.match.test(n) && !(rule.not && rule.not.test(n))) return rule.code;
  return null;
}

/** The unit a header states: "(mg)", "kJ", "µg RAE", "g/100 g". "per 100 g" itself is the basis, not the unit. */
export function unitInLabel(label: string): SourceUnit | null {
  const t = label
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/(?:\/|\b(?:per|por|pour|par)\b)\s*100\s*(?:g|gr|ml)\b/g, ' ')
    .replace(/\b100\s*(?:g|gr|ml)\b/g, ' ');
  const found = /(?:^|[^a-z])(kcal|kj|mg|ug|mcg|g|iu|ui)(?![a-z])/.exec(t);
  return found ? parseSourceUnit(found[1]!) : null;
}

/** What the values of the table are "per", from the lines above and including the header. Nothing stated: per 100 g, marked as assumed. */
export function detectBasis(rows: readonly (readonly Cell[])[]): { basis: Basis; assumed: boolean } {
  const all = rows
    .slice(0, 40)
    .flat()
    .filter((c): c is string => typeof c === 'string')
    .map(normalizeLabel)
    // "Edible portion" is the part of the food the values refer to, not a serving.
    .map((t) => t.replace(/\b(porcion comestible|parte comestible|edible portion|portion comestible|porcao comestivel)\b/g, ' '))
    .join(' | ');
  if (/\b100 ?(g|gr|gramos|grams|gramas|grammes)\b/.test(all)) return { basis: 'g100', assumed: false };
  if (/\b100 ?ml\b/.test(all)) return { basis: 'ml100', assumed: false };
  if (/\b(por|per|par|pour) (1 )?(kg|kilo)\b|\b1 ?kg\b/.test(all)) return { basis: 'kg1', assumed: false };
  if (/\b(porcion|porciones|portion|portions|serving|servings|racao|racoes|ration|rations|unidad|unidade|per item|por unidad)\b|\b100 ?kcal\b/.test(all)) return { basis: 'other', assumed: false };
  return { basis: 'g100', assumed: true };
}

const isUnitRow = (row: readonly Cell[]): boolean => {
  const filled = row.filter((c) => c !== null && c !== undefined);
  if (filled.length < 2) return false;
  const units = filled.filter((c) => typeof c === 'string' && parseSourceUnit(c) !== null).length;
  return units >= 2 && units >= filled.length * 0.5;
};

const HEADER_SEARCH_ROWS = 40;

/** The row whose cells name the most nutrients: the header, wherever it is (title lines above it are common). */
function findHeaderRow(sheet: Sheet): number {
  let best = -1;
  let bestScore = 0;
  sheet.rows.slice(0, HEADER_SEARCH_ROWS).forEach((row, index) => {
    const codes = new Set<NutrientCode>();
    for (const cell of row) if (typeof cell === 'string') {
      const code = matchNutrient(cell);
      if (code) codes.add(code);
    }
    if (codes.size > bestScore) {
      bestScore = codes.size;
      best = index;
    }
  });
  return best;
}

/** First column whose data cells are mostly text: the likely names, when no header says so. */
function guessNameColumn(sheet: Sheet, from: number): number {
  const sample = sheet.rows.slice(from, from + 30).filter((r) => r.length > 0);
  const width = Math.max(0, ...sample.map((r) => r.length));
  for (let c = 0; c < width; c++) {
    const cells = sample.map((r) => r[c]).filter((v): v is string | number => v !== null && v !== undefined);
    if (cells.length > 0 && cells.filter((v) => typeof v === 'string' && Number.isNaN(Number(v.replace(',', '.')))).length >= cells.length * 0.8) return c;
  }
  return -1;
}

/** How well a column's unit serves a nutrient, to pick between two columns for the same one (kcal over kJ, grams over a refused unit). */
function unitScore(code: NutrientCode, column: NutrientColumn): number {
  if (column.unit === NUTRIENT_UNITS[code]) return column.unitAssumed ? 2 : 4;
  return unitRule(column.unit, code).kind === 'refused' ? 0 : 3;
}

/** `headerRow` forces the header line (the person chose it); otherwise it is looked for. */
export function suggestSheetMapping(sheet: Sheet, index: number, options: { headerRow?: number } = {}): SheetMapping {
  const headerRow = options.headerRow ?? findHeaderRow(sheet);
  const header = headerRow >= 0 ? (sheet.rows[headerRow] ?? []) : [];
  const unitsRow = headerRow >= 0 && sheet.rows[headerRow + 1] && isUnitRow(sheet.rows[headerRow + 1]!) ? (sheet.rows[headerRow + 1] as Cell[]) : null;
  const firstDataRow = headerRow >= 0 ? headerRow + (unitsRow ? 2 : 1) : 1;

  let nameColumn = -1;
  let groupColumn: number | null = null;
  const claimed = new Set<number>();
  header.forEach((cell, column) => {
    if (typeof cell !== 'string') return;
    const n = normalizeLabel(cell);
    if (groupColumn === null && GROUP.test(n)) {
      groupColumn = column;
      claimed.add(column);
    } else if (nameColumn < 0 && NAME.test(n) && matchNutrient(cell) === null) {
      nameColumn = column;
      claimed.add(column);
    }
  });

  const candidates = new Map<NutrientCode, NutrientColumn[]>();
  header.forEach((cell, column) => {
    if (typeof cell !== 'string' || claimed.has(column)) return;
    const code = matchNutrient(cell);
    if (!code) return;
    const stated = unitInLabel(cell) ?? (unitsRow && typeof unitsRow[column] === 'string' ? parseSourceUnit(unitsRow[column] as string) : null);
    const entry: NutrientColumn = { column, unit: stated ?? NUTRIENT_UNITS[code], unitAssumed: stated === null };
    candidates.set(code, [...(candidates.get(code) ?? []), entry]);
  });
  const nutrients: SheetMapping['nutrients'] = {};
  for (const [code, list] of candidates) {
    // The best unit wins; on a tie the leftmost column.
    nutrients[code] = [...list].sort((a, b) => unitScore(code, b) - unitScore(code, a) || a.column - b.column)[0]!;
  }

  if (nameColumn < 0) nameColumn = guessNameColumn(sheet, firstDataRow);
  return { sheet: index, headerRow: Math.max(headerRow, 0), firstDataRow, nameColumn, groupColumn, groupFromSheetName: false, nutrients };
}

export interface MappingSuggestion {
  mapping: ImportMapping;
}

/** The mapping the generic import starts from, for one sheet of the file. */
export function suggestMapping(file: TableFile, sheetIndex: number, options: { headerRow?: number } = {}): MappingSuggestion {
  const sheet = file.sheets[sheetIndex] ?? { name: '', rows: [] };
  const sheetMapping = suggestSheetMapping(sheet, sheetIndex, options);
  const { basis, assumed } = detectBasis(sheet.rows.slice(0, sheetMapping.firstDataRow));
  return {
    mapping: { sheets: [sheetMapping], basis, basisAssumed: assumed, decimal: detectDecimal(sheet.rows.slice(sheetMapping.firstDataRow)), presetId: null },
  };
}
