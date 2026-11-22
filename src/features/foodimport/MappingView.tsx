import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { NUTRIENT_CODES, NUTRIENT_UNITS, unitRule, type NutrientCode, type SourceUnit } from '@/core/nutrition';
import { AppText, BottomSheet, Button, ChoiceChips, FieldMessage, Icon, OptionList, PressableScale, TextField, layout, pressScale, radius, spacing, useTheme } from '@/ui';
import { mappingProblems, type Basis, type ImportMapping, type NutrientColumn, type SheetMapping } from './mapping';
import type { Cell, Sheet, TableFile } from './readTypes';
import { MISSING_MARKERS } from './values';

/** The symbols of the units a table may state. */
const UNIT_LABEL: Record<SourceUnit, string> = { kcal: 'kcal', kj: 'kJ', g: 'g', mg: 'mg', ug: 'µg', iu: 'IU' };
const ENERGY_UNITS: SourceUnit[] = ['kcal', 'kj'];
const MASS_UNITS: SourceUnit[] = ['g', 'mg', 'ug', 'iu'];
const MAX_COLUMN_OPTIONS = 150;

export const columnLetter = (index: number): string => {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

const show = (cell: Cell | undefined): string => (cell === null || cell === undefined ? '' : String(cell).trim());

interface ColumnInfo {
  index: number;
  header: string;
  example: string;
}

/** The columns a person can choose from: those with a header or a value near the top, as the header row names them. */
function columnsOf(sheet: Sheet, mapping: SheetMapping): ColumnInfo[] {
  const header = sheet.rows[mapping.headerRow] ?? [];
  const sample = sheet.rows.slice(mapping.firstDataRow, mapping.firstDataRow + 12);
  const width = Math.max(header.length, ...sample.map((r) => r.length), 0);
  const out: ColumnInfo[] = [];
  for (let index = 0; index < width && out.length < MAX_COLUMN_OPTIONS; index++) {
    const example = sample.map((r) => show(r[index])).find((v) => v !== '') ?? '';
    const head = show(header[index]);
    if (head === '' && example === '') continue;
    out.push({ index, header: head, example });
  }
  return out;
}

type Target = { kind: 'name' } | { kind: 'group' } | { kind: 'nutrient'; code: NutrientCode };

interface MappingViewProps {
  file: TableFile;
  sheetIndex: number;
  mapping: ImportMapping;
  presetName: string | null;
  onSheet: (index: number) => void;
  onMapping: (mapping: ImportMapping) => void;
  onHeaderRow: (row: number) => void;
}

/**
 * The mapping step (S4): every choice the importer made, visible and changeable. Name, group, basis, decimal mark, and each nutrient
 * with the column it comes from and the unit that column is written in. Nothing is saved from here.
 */
export function MappingView({ file, sheetIndex, mapping, presetName, onSheet, onMapping, onHeaderRow }: MappingViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sheet = file.sheets[sheetIndex] ?? { name: '', rows: [] };
  const sheetMapping = mapping.sheets[0]!;
  const columns = columnsOf(sheet, sheetMapping);
  const [target, setTarget] = useState<Target | null>(null);
  const [headerText, setHeaderText] = useState(String(sheetMapping.headerRow + 1));
  const problems = mappingProblems(mapping);

  const patchSheet = (patch: Partial<SheetMapping>) => onMapping({ ...mapping, sheets: [{ ...sheetMapping, ...patch }, ...mapping.sheets.slice(1)] });
  const setNutrient = (code: NutrientCode, column: NutrientColumn | null) => {
    const nutrients = { ...sheetMapping.nutrients };
    if (column) nutrients[code] = column;
    else delete nutrients[code];
    patchSheet({ nutrients });
  };

  const columnLabel = (index: number | null): string => {
    if (index === null || index < 0) return t('import.map.notMapped');
    const info = columns.find((c) => c.index === index);
    return info && info.header !== '' ? t('import.map.column', { letter: columnLetter(index), header: info.header }) : t('import.map.columnNoHeader', { letter: columnLetter(index) });
  };

  const targetTitle = target ? (target.kind === 'name' ? t('import.map.name') : target.kind === 'group' ? t('import.map.group') : t(`nutrient.${target.code}`)) : '';
  const currentColumn = target ? (target.kind === 'name' ? sheetMapping.nameColumn : target.kind === 'group' ? sheetMapping.groupColumn : (sheetMapping.nutrients[target.code]?.column ?? null)) : null;
  const chosenNutrient = target?.kind === 'nutrient' ? sheetMapping.nutrients[target.code] : undefined;

  const choose = (value: string | null) => {
    if (!target || value === null) return;
    const index = value === 'none' ? null : Number(value);
    if (target.kind === 'name') patchSheet({ nameColumn: index ?? -1 });
    else if (target.kind === 'group') patchSheet({ groupColumn: index });
    else if (index === null) setNutrient(target.code, null);
    else setNutrient(target.code, { column: index, unit: chosenNutrient?.unit ?? NUTRIENT_UNITS[target.code], unitAssumed: chosenNutrient?.unitAssumed ?? true });
  };

  const basisNote =
    mapping.basis === 'other' ? t('import.map.basisOther2') : mapping.basis === 'ml100' ? t('import.map.basisMl') : mapping.basis === 'kg1' ? t('import.map.basisKg') : mapping.basisAssumed ? t('import.map.basisAssumed') : null;

  return (
    <View style={styles.body}>
      <AppText tone="muted">{t('import.map.intro')}</AppText>
      <AppText variant="bodySm" tone="muted" testID="file-info">
        {file.kind === 'csv' ? t('import.map.fileText', { file: file.fileName, encoding: file.encoding ?? '' }) : t('import.map.fileSheets', { file: file.fileName, count: file.sheets.length })}
      </AppText>
      {presetName ? (
        <View style={[styles.preset, { backgroundColor: colors.primarySoft }]} testID="preset-note">
          <Icon name="check" color={colors.primaryText} />
          <AppText variant="bodyMd" style={styles.flex}>
            {t('import.list.preset', { preset: presetName })}
          </AppText>
        </View>
      ) : null}

      {file.sheets.length > 1 && !mapping.presetId ? (
        <ChoiceChips<string>
          label={t('import.map.sheet')}
          title
          options={file.sheets.map((s, index) => ({ value: String(index), label: s.name }))}
          value={String(sheetIndex)}
          onChange={(value) => value !== null && onSheet(Number(value))}
        />
      ) : null}

      <TextField
        label={t('import.map.headerRow')}
        hint={t('import.map.headerRowHint')}
        value={headerText}
        onChangeText={(value) => {
          setHeaderText(value);
          const row = Number(value);
          if (Number.isInteger(row) && row >= 1 && row <= sheet.rows.length) onHeaderRow(row - 1);
        }}
        keyboardType="number-pad"
        maxLength={4}
        testID="header-row"
      />

      <View style={styles.group}>
        <ColumnRow label={t('import.map.name')} value={columnLabel(sheetMapping.nameColumn)} set={sheetMapping.nameColumn >= 0} onPress={() => setTarget({ kind: 'name' })} testID="map-name" />
        <ColumnRow label={t('import.map.group')} value={sheetMapping.groupFromSheetName ? sheet.name : columnLabel(sheetMapping.groupColumn)} set={sheetMapping.groupColumn !== null || sheetMapping.groupFromSheetName} onPress={() => setTarget({ kind: 'group' })} testID="map-group" />
      </View>

      <View style={styles.group}>
        <ChoiceChips<Basis>
          label={t('import.map.basis')}
          title
          options={[
            { value: 'g100', label: t('import.map.basisG100') },
            { value: 'ml100', label: t('import.map.basisMl100') },
            { value: 'kg1', label: t('import.map.basisKg1') },
            { value: 'other', label: t('import.map.basisOther') },
          ]}
          value={mapping.basis}
          onChange={(value) => value && onMapping({ ...mapping, basis: value, basisAssumed: false })}
          testID="basis"
        />
        {basisNote ? <FieldMessage message={basisNote} /> : null}
      </View>

      <View style={styles.group}>
        <ChoiceChips<'.' | ','>
          label={t('import.map.decimal')}
          title
          options={[
            { value: '.', label: t('import.map.decimalPoint') },
            { value: ',', label: t('import.map.decimalComma') },
          ]}
          value={mapping.decimal}
          onChange={(value) => value && onMapping({ ...mapping, decimal: value })}
          testID="decimal"
        />
        <AppText variant="bodySm" tone="muted">
          {t('import.map.decimalFound')}
        </AppText>
      </View>

      <View style={styles.group}>
        <AppText variant="heading" accessibilityRole="header">
          {t('import.map.nutrients')}
        </AppText>
        <AppText variant="bodySm" tone="muted">
          {t('import.map.nutrientsHint')}
        </AppText>
        {NUTRIENT_CODES.map((code) => {
          const entry = sheetMapping.nutrients[code];
          const refused = entry ? unitRule(entry.unit, code).kind === 'refused' : false;
          return (
            <ColumnRow
              key={code}
              label={t(`nutrient.${code}`)}
              value={entry ? `${columnLabel(entry.column)} · ${UNIT_LABEL[entry.unit]}${entry.unitAssumed ? ` (${t('import.map.unitAssumed', { unit: UNIT_LABEL[entry.unit] })})` : ''}` : t('import.map.notMapped')}
              set={entry !== undefined}
              warn={refused}
              onPress={() => setTarget({ kind: 'nutrient', code })}
              testID={`map-${code}`}
            />
          );
        })}
      </View>

      <View style={[styles.rules, { backgroundColor: colors.surface }]} testID="rules">
        <AppText variant="heading" accessibilityRole="header">
          {t('import.map.rulesTitle')}
        </AppText>
        <AppText variant="bodySm">{t('import.map.rulesExact')}</AppText>
        <AppText variant="bodySm">{t('import.map.rulesUnknown', { markers: MISSING_MARKERS.filter((m) => m.length <= 8).join('  ') })}</AppText>
        <AppText variant="bodySm">{t('import.map.rulesUnits')}</AppText>
      </View>

      {problems.map((problem) => (
        <FieldMessage
          key={problem.kind + (problem.kind === 'unit_refused' ? problem.nutrient : '')}
          message={t(`import.map.problem.${problem.kind}`, problem.kind === 'unit_refused' ? { nutrient: t(`nutrient.${problem.nutrient}`), unit: UNIT_LABEL[problem.unit] } : problem.kind === 'too_many_foods' ? { limit: problem.limit } : {})}
        />
      ))}

      <BottomSheet visible={target !== null} onClose={() => setTarget(null)} title={t('import.map.columnFor', { what: targetTitle })} closeLabel={t('common.close')}>
        <OptionList<string>
          label={targetTitle}
          options={[
            { value: 'none', label: t('import.map.notMapped') },
            ...columns.map((c) => ({
              value: String(c.index),
              label: c.header !== '' ? t('import.map.column', { letter: columnLetter(c.index), header: c.header }) : t('import.map.columnNoHeader', { letter: columnLetter(c.index) }),
              hint: c.example !== '' ? t('import.map.example', { value: c.example.length > 40 ? `${c.example.slice(0, 40)}…` : c.example }) : undefined,
            })),
          ]}
          value={currentColumn === null || currentColumn < 0 ? 'none' : String(currentColumn)}
          onChange={choose}
        />
        {target?.kind === 'nutrient' && chosenNutrient ? (
          <View style={styles.group}>
            <ChoiceChips<SourceUnit>
              label={t('import.map.unit')}
              title
              options={(target.code === 'kcal' ? ENERGY_UNITS : MASS_UNITS).map((unit) => ({ value: unit, label: UNIT_LABEL[unit] }))}
              value={chosenNutrient.unit}
              onChange={(unit) => unit && setNutrient(target.code, { ...chosenNutrient, unit, unitAssumed: false })}
            />
            {unitRule(chosenNutrient.unit, target.code).kind === 'refused' ? <FieldMessage message={t('import.map.unitRefused')} /> : null}
          </View>
        ) : null}
        <Button label={t('common.close')} onPress={() => setTarget(null)} testID="column-done" />
      </BottomSheet>
    </View>
  );
}

interface ColumnRowProps {
  label: string;
  value: string;
  set: boolean;
  warn?: boolean;
  onPress: () => void;
  testID?: string;
}

function ColumnRow({ label, value, set, warn = false, onPress, testID }: ColumnRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={t('import.map.choose')}
      onPress={onPress}
      scale={pressScale.row}
      pressedStyle={{ backgroundColor: colors.surfaceHigh }}
      testID={testID}
      style={[styles.row, { backgroundColor: colors.surface }, warn ? { borderWidth: 1.5, borderColor: colors.warning } : null]}>
      <View style={styles.flex}>
        <AppText variant="bodySm" tone="muted">
          {label}
        </AppText>
        <AppText variant="itemName" tone={set ? 'default' : 'muted'} numberOfLines={2}>
          {value}
        </AppText>
      </View>
      <Icon name="right" color={colors.textMuted} />
    </PressableScale>
  );
}


const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  group: { gap: spacing.s2 },
  flex: { flex: 1 },
  preset: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center', borderRadius: radius.lg, paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, minHeight: 64, borderRadius: radius.lg, paddingVertical: spacing.s2, paddingHorizontal: spacing.s4 },
  rules: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s2 },
});
