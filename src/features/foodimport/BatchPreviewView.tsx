import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { NUTRIENT_UNITS, type NutrientCode, type SourceUnit } from '@/core/nutrition';
import { formatInstantDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, CheckRow, ChoiceChips, Icon, TextField, layout, radius, spacing, useTheme } from '@/ui';
import type { ConfirmKind, ConfirmPoint } from './confidence';
import type { AnalysedFile, Choices, DuplicateChoice, Plan, PlanBlocker, Unit } from './batchService';
import type { Basis } from './mapping';
import { PreviewView } from './PreviewView';

const UNIT_SYMBOL: Record<SourceUnit, string> = { kcal: 'kcal', kj: 'kJ', g: 'g', mg: 'mg', ug: 'µg', iu: 'IU' };

interface BatchPreviewViewProps {
  files: readonly AnalysedFile[];
  plan: Plan;
  choices: Choices;
  locale: Locale;
  /** A table was given a blank name. */
  nameProblem: boolean;
  onToggle: (fileId: string, selected: boolean) => void;
  onConfirm: (fileId: string, kind: ConfirmKind, on: boolean) => void;
  onDuplicate: (unitKey: string, choice: DuplicateChoice) => void;
  onCombine: (presetId: string, combined: boolean) => void;
  onName: (unitKey: string, name: string) => void;
  onChangeColumns: (fileId: string) => void;
  /** Opens the details of one file (counts, rows left out, sample): used when there are several files. */
  onDetails: (fileId: string) => void;
}

export const basisWords = (t: TFunction, basis: Basis): string => t(`import.batch.${basis === 'ml100' ? 'basisMl100' : basis === 'kg1' ? 'basisKg1' : basis === 'g100' ? 'basisG100' : 'basisOther'}`);

/** The sentence that states one weak point, exactly (which columns, which units, how many rows). */
export function confirmText(t: TFunction, point: ConfirmPoint): { statement: string; check: string } {
  switch (point.kind) {
    case 'weak_columns':
      return { statement: t('import.batch.confirm.weak_columns', { nutrients: point.nutrients.map((code) => t(`nutrient.${code}`)).join(', ') }), check: t('import.batch.confirm.weak_columns_check') };
    case 'units_assumed':
      return {
        statement: t('import.batch.confirm.units_assumed', { units: point.units.map((u) => t('import.batch.confirm.unit', { nutrient: t(`nutrient.${u.nutrient as NutrientCode}`), unit: UNIT_SYMBOL[u.unit] ?? NUTRIENT_UNITS[u.nutrient] })).join(', ') }),
        check: t('import.batch.confirm.units_assumed_check'),
      };
    case 'name_guessed': {
      const column = columnLetterOf(point.column);
      return { statement: t('import.batch.confirm.name_guessed', { column }), check: t('import.batch.confirm.name_guessed_check', { column }) };
    }
    case 'energy_mismatch':
    case 'many_skipped':
      return { statement: t(`import.batch.confirm.${point.kind}`, { count: point.count, total: point.total }), check: t(`import.batch.confirm.${point.kind}_check`) };
    default:
      return { statement: t(`import.batch.confirm.${point.kind}`), check: t(`import.batch.confirm.${point.kind}_check`) };
  }
}

const columnLetterOf = (index: number): string => {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

/** What stops the import from going ahead yet, as one line each. */
export function blockerText(t: TFunction, blockers: readonly PlanBlocker[], nothingSelected: boolean): string[] {
  const lines = new Set<string>();
  for (const blocker of blockers) {
    if (blocker.kind === 'unconfirmed') lines.add(t('import.batch.blocked.unconfirmed'));
    else if (blocker.kind === 'duplicate_undecided') lines.add(t('import.batch.blocked.duplicate'));
    else if (blocker.kind === 'too_many_tables') lines.add(t('import.batch.blocked.tooManyTables', { limit: blocker.limit, existing: blocker.existing, adding: blocker.adding }));
    else lines.add(t('import.batch.blocked.tooManyFoods', { limit: blocker.limit, count: blocker.count }));
  }
  if (lines.size === 0 && nothingSelected) lines.add(t('import.batch.blocked.nothing'));
  return [...lines];
}

/**
 * The one preview of everything that was chosen (B1-B4): per file what was recognised (or exactly what to confirm), which files are already
 * here and what to do about it, which files are parts of one table, and which hold nothing the app can use. A single file shows the full
 * preview inline; several files show one compact card each, with the details a tap away.
 */
export function BatchPreviewView({ files, plan, choices, locale, nameProblem, onToggle, onConfirm, onDuplicate, onCombine, onName, onChangeColumns, onDetails }: BatchPreviewViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const single = files.length === 1;
  const unitOf = (file: AnalysedFile): Unit | undefined => plan.units.find((u) => u.files.includes(file));
  const counts = {
    ready: plan.units.reduce((sum, u) => sum + u.files.length, 0),
    already: files.filter((f) => f.matches.length > 0).length,
    unusable: files.filter((f) => f.outcome.kind === 'nothing_usable').length,
    problem: files.filter((f) => f.outcome.kind === 'needs_mapping' || f.outcome.kind === 'refused').length,
  };
  const oneUnitWithName = plan.units.length === 1 && plan.units[0]!.choice !== 'skip';

  return (
    <View style={styles.body}>
      {!single ? (
        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="batch-summary">
          <AppText variant="heading" accessibilityRole="header">
            {t('import.batch.summaryFiles', { count: files.length })}
          </AppText>
          <AppText variant="bodyMd">{t('import.batch.ready', { count: counts.ready })}</AppText>
          {counts.already > 0 ? <AppText variant="bodyMd">{t('import.batch.already', { count: counts.already })}</AppText> : null}
          {counts.unusable > 0 ? <AppText variant="bodyMd">{t('import.batch.unusable', { count: counts.unusable })}</AppText> : null}
          {counts.problem > 0 ? <AppText variant="bodyMd">{t('import.batch.problem', { count: counts.problem })}</AppText> : null}
        </View>
      ) : null}

      {plan.groups.map((group) => (
        <View key={group.presetId} style={[styles.card, { backgroundColor: colors.surface }]} testID={`group-${group.presetId}`}>
          <AppText variant="heading" accessibilityRole="header">
            {t('import.batch.combine.title', { count: group.files.length, preset: group.presetName })}
          </AppText>
          <ChoiceChips<'one' | 'many'>
            label={t('import.batch.combine.label')}
            title
            options={[
              { value: 'one', label: t('import.batch.combine.one') },
              { value: 'many', label: t('import.batch.combine.many') },
            ]}
            value={group.combined ? 'one' : 'many'}
            onChange={(value) => value && onCombine(group.presetId, value === 'one')}
          />
          {group.combined ? (
            <AppText variant="bodySm" tone="muted">
              {t('import.batch.combine.oneHint')}
            </AppText>
          ) : null}
        </View>
      ))}

      {files.map((file, index) => {
        const unit = unitOf(file);
        const active = file.outcome.kind === 'ready' && choices.selected[file.id] !== false;
        const first = unit?.files[0] === file;
        return (
          <View key={file.id} style={[styles.card, { backgroundColor: colors.surface }]} testID={`file-${index}`}>
            <AppText variant="heading" accessibilityRole="header">
              {file.fileName}
            </AppText>
            <FileStatus file={file} t={t} />
            {file.outcome.kind === 'ready' ? (
              <>
                {file.assessment && file.assessment.confident ? (
                  <View style={styles.line} testID={`recognised-${index}`}>
                    <Icon name="check" color={colors.primaryText} />
                    <AppText variant="bodyMd" style={styles.flex}>
                      {recognisedLine(t, file)}
                    </AppText>
                  </View>
                ) : null}
                {!single ? <CheckRow label={t('import.batch.include')} checked={active} onChange={(on) => onToggle(file.id, on)} testID={`include-${index}`} /> : null}
                {active && file.assessment && !file.assessment.confident ? (
                  <View style={[styles.check, { backgroundColor: colors.warningSoft }]} testID={`confirm-${index}`}>
                    <View style={styles.line}>
                      <Icon name="alert" color={colors.warning} />
                      <AppText variant="itemName" style={styles.flex}>
                        {t('import.batch.checkTitle')}
                      </AppText>
                    </View>
                    <AppText variant="bodySm">{recognisedLine(t, file)}</AppText>
                    {file.assessment.confirm.map((point) => {
                      const text = confirmText(t, point);
                      const on = (choices.confirmed[file.id] ?? []).includes(point.kind);
                      return (
                        <View key={point.kind} style={styles.point}>
                          <AppText variant="bodyMd">{text.statement}</AppText>
                          <CheckRow label={text.check} checked={on} onChange={(value) => onConfirm(file.id, point.kind, value)} testID={`confirm-${index}-${point.kind}`} />
                        </View>
                      );
                    })}
                    <AppText variant="bodySm" tone="muted">
                      {t('import.batch.checkIntro')}
                    </AppText>
                  </View>
                ) : null}
                {active && unit && first && unit.matches.length > 0 ? <DuplicateChoiceView unit={unit} locale={locale} onChoose={(choice) => onDuplicate(unit.key, choice)} index={index} /> : null}
              </>
            ) : null}
            <View style={styles.actions}>
              {file.file ? <Button label={t('import.batch.changeColumns')} variant="secondary" icon="pencil" block={false} onPress={() => onChangeColumns(file.id)} testID={`change-columns-${index}`} /> : null}
              {file.preview && !single && file.outcome.kind === 'ready' ? <Button label={t('import.batch.details')} variant="secondary" block={false} onPress={() => onDetails(file.id)} testID={`details-${index}`} /> : null}
            </View>
          </View>
        );
      })}

      {single && files[0]!.outcome.kind === 'ready' && files[0]!.preview ? <FileDetails file={files[0]!} locale={locale} /> : null}

      {oneUnitWithName ? (
        <TextField
          label={plan.groups.some((g) => g.combined) ? t('import.batch.combine.name') : t('import.preview.name')}
          hint={t('import.preview.nameHint')}
          value={plan.units[0]!.name}
          onChangeText={(value) => onName(plan.units[0]!.key, value)}
          error={nameProblem && plan.units[0]!.name.trim() === '' ? t('import.preview.nameBlank') : null}
          maxLength={200}
          returnKeyType="done"
          testID="table-name"
        />
      ) : null}
    </View>
  );
}

/** The inline preview of a single file: counts, rows left out, warnings, a sample (the same one the details sheet shows). */
export function FileDetails({ file, locale }: { file: AnalysedFile; locale: Locale }) {
  return file.preview ? <PreviewView preview={file.preview} locale={locale} embedded /> : null;
}

function recognisedLine(t: TFunction, file: AnalysedFile): string {
  const a = file.assessment!;
  const basis = basisWords(t, a.basis);
  return a.recognition === 'preset' ? t('import.batch.recognisedPreset', { preset: a.presetName, count: a.nutrients, basis }) : t('import.batch.recognisedHeaders', { count: a.nutrients, basis });
}

function FileStatus({ file, t }: { file: AnalysedFile; t: TFunction }) {
  const { colors } = useTheme();
  const { outcome } = file;
  if (outcome.kind === 'ready' && file.preview) {
    const left = Object.values(file.preview.counts.skipped).reduce((a, b) => a + b, 0);
    return (
      <AppText variant="bodyMd" tone="muted" testID="file-status">
        {[t('import.batch.fileSummary', { count: file.preview.counts.foods, nutrients: file.preview.counts.nutrientsMapped }), left > 0 ? t('import.batch.rowsLeftOut', { count: left }) : null].filter((part): part is string => part !== null).join(' · ')}
      </AppText>
    );
  }
  if (outcome.kind === 'nothing_usable') {
    return (
      <View style={styles.line} testID="file-status">
        <Icon name="info" color={colors.textMuted} />
        <AppText variant="bodyMd" tone="muted" style={styles.flex}>
          {t('import.batch.nothingUsable')}
        </AppText>
      </View>
    );
  }
  if (outcome.kind === 'needs_mapping') {
    return (
      <View style={styles.line} testID="file-status">
        <Icon name="alert" color={colors.warning} />
        <AppText variant="bodyMd" style={styles.flex}>
          {t('import.batch.needsMapping')}
        </AppText>
      </View>
    );
  }
  return (
    <View style={styles.line} testID="file-status">
      <Icon name="alert" color={colors.warning} />
      <AppText variant="bodyMd" style={styles.flex}>
        {t(`import.add.refused.${outcome.kind === 'refused' ? outcome.code : 'damaged'}`, { limit: outcome.kind === 'refused' && outcome.limit !== undefined ? (outcome.code === 'too_large' || outcome.code === 'unpacked_too_large' ? outcome.limit / (1024 * 1024) : outcome.limit) : '' })}
      </AppText>
    </View>
  );
}

function DuplicateChoiceView({ unit, locale, onChoose, index }: { unit: Unit; locale: Locale; onChoose: (choice: DuplicateChoice) => void; index: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const match = unit.matches[0]!;
  return (
    <View style={[styles.check, { backgroundColor: colors.warningSoft }]} testID={`duplicate-${index}`}>
      <View style={styles.line}>
        <Icon name="alert" color={colors.warning} />
        <AppText variant="itemName" style={styles.flex}>
          {t('import.batch.duplicate.title')}
        </AppText>
      </View>
      <AppText variant="bodyMd">{t('import.batch.duplicate.body', { name: match.name, foods: match.foodCount, date: formatInstantDate(locale, new Date(match.importedAt)) })}</AppText>
      {unit.matches.length > 1 ? <AppText variant="bodySm">{t('import.batch.duplicate.more', { count: unit.matches.length - 1 })}</AppText> : null}
      <ChoiceChips<DuplicateChoice>
        label={t('import.batch.duplicate.choose')}
        title
        options={[
          { value: 'replace', label: t('import.batch.duplicate.replace') },
          { value: 'keep', label: t('import.batch.duplicate.keep') },
          { value: 'skip', label: t('import.batch.duplicate.skip') },
        ]}
        value={unit.choice}
        onChange={(value) => value && onChoose(value)}
        testID={`duplicate-choice-${index}`}
      />
      {unit.choice ? (
        <AppText variant="bodySm" tone="muted">
          {t(`import.batch.duplicate.${unit.choice}Hint`)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s2 },
  check: { borderRadius: radius.md, padding: spacing.s4, gap: spacing.s2 },
  point: { gap: spacing.s1 },
  line: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center' },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s1 },
});
