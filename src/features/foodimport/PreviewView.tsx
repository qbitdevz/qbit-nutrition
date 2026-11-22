import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { NUTRIENT_CODES, NUTRIENT_UNITS, type NutrientCode } from '@/core/nutrition';
import { formatDecimal, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, FieldMessage, Icon, TextField, layout, radius, spacing, useTheme } from '@/ui';
import type { ImportPreview, SkipReason } from './mapping';

const SKIP_ORDER: SkipReason[] = ['no_name', 'no_values', 'out_of_range', 'name_too_long'];
const UNIT_SYMBOL = { kcal: 'kcal', g: 'g', mg: 'mg', ug: 'µg' } as const;

interface PreviewViewProps {
  preview: ImportPreview;
  locale: Locale;
  /** The name of the table: asked here only when `onName` is given (a single table); the batch view asks it itself. */
  name?: string;
  onName?: (name: string) => void;
  nameProblem?: boolean;
  /** Inside another screen's content: no margins of its own. */
  embedded?: boolean;
}

/**
 * The preview (S4): what will be stored and what will not, before anything is written. Counts, why each kind of row is left out, the
 * cells stored as unknown, warnings that change nothing, and a sample of foods exactly as they will be stored.
 */
export function PreviewView({ preview, locale, name = '', onName, nameProblem = false, embedded = false }: PreviewViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { counts } = preview;
  const skippedTotal = SKIP_ORDER.reduce((sum, reason) => sum + counts.skipped[reason], 0);

  const value = (code: NutrientCode, amount: number) => `${t(`nutrient.${code}`)} ${formatDecimal(locale, amount, 3)} ${UNIT_SYMBOL[NUTRIENT_UNITS[code]]}`;

  return (
    <View style={embedded ? styles.embedded : styles.body}>
      <View style={[styles.card, { backgroundColor: colors.surface }]} testID="preview-counts">
        <AppText variant="heading" accessibilityRole="header">
          {t('import.preview.foods', { count: counts.foods })}
        </AppText>
        <AppText variant="bodyMd">{t('import.preview.nutrients', { count: counts.nutrientsMapped })}</AppText>
        <AppText variant="bodySm" tone="muted">
          {t('import.preview.rows', { count: counts.rowsRead, blank: counts.blankRows })}
        </AppText>
        {preview.basis === 'ml100' ? <FieldMessage message={t('import.preview.ml')} /> : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface }]} testID="preview-skipped">
        <AppText variant="heading" accessibilityRole="header">
          {t('import.preview.skippedTitle')}
        </AppText>
        {skippedTotal === 0 ? <AppText tone="muted">{t('import.preview.skippedNone')}</AppText> : null}
        {SKIP_ORDER.filter((reason) => counts.skipped[reason] > 0).map((reason) => (
          <AppText key={reason} variant="bodyMd">
            {t(`import.preview.skipped.${reason}`, { count: counts.skipped[reason] })}
          </AppText>
        ))}
        {preview.skippedExamples.slice(0, 5).map((example) => (
          <AppText key={`${example.sheet}-${example.row}-${example.reason}`} variant="bodySm" tone="muted">
            {example.reason === 'out_of_range' && example.nutrient
              ? t('import.preview.exampleOutOfRange', { row: example.row + 1, name: example.name ?? '', nutrient: t(`nutrient.${example.nutrient}`) })
              : t('import.preview.example', { row: example.row + 1, name: example.name ?? '–' })}
          </AppText>
        ))}
        {counts.unknownCells > 0 ? <AppText variant="bodySm">{t('import.preview.unknown', { count: counts.unknownCells })}</AppText> : null}
        {counts.unreadableCells > 0 ? <AppText variant="bodySm">{t('import.preview.unreadable', { count: counts.unreadableCells })}</AppText> : null}
      </View>

      {preview.warnings.energyMismatch.count > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.warningSoft }]} testID="preview-warnings">
          <View style={styles.titleRow}>
            <Icon name="alert" color={colors.warning} />
            <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
              {t('import.preview.warnTitle')}
            </AppText>
          </View>
          <AppText variant="bodyMd">{t('import.preview.energy', { count: preview.warnings.energyMismatch.count })}</AppText>
          {preview.warnings.energyMismatch.examples.slice(0, 3).map((example) => (
            <AppText key={example.name} variant="bodySm" tone="muted">
              {t('import.preview.energyExample', { name: example.name, kcal: formatNumber(locale, example.kcal), estimated: formatNumber(locale, example.estimated) })}
            </AppText>
          ))}
        </View>
      ) : null}

      <View style={styles.group} testID="preview-sample">
        <AppText variant="heading" accessibilityRole="header">
          {t('import.preview.sampleTitle')}
        </AppText>
        {preview.sample.map((food) => (
          <View key={`${food.sheet}-${food.row}`} style={[styles.sample, { backgroundColor: colors.surface }]}>
            <AppText variant="itemName">{food.name}</AppText>
            {food.group ? (
              <AppText variant="caption" tone="muted">
                {food.group}
              </AppText>
            ) : null}
            <AppText variant="bodySm" tone="muted">
              {NUTRIENT_CODES.flatMap((code) => (food.per100g[code] === undefined ? [] : [value(code, food.per100g[code]!)])).join(' · ')}
            </AppText>
          </View>
        ))}
      </View>

      {onName ? (
        <TextField
          label={t('import.preview.name')}
          hint={t('import.preview.nameHint')}
          value={name}
          onChangeText={onName}
          error={nameProblem && name.trim() === '' ? t('import.preview.nameBlank') : null}
          maxLength={200}
          returnKeyType="done"
          testID="table-name"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  embedded: { gap: spacing.s4 },
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s2 },
  group: { gap: spacing.s2 },
  titleRow: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center' },
  flex: { flex: 1 },
  sample: { borderRadius: radius.lg, padding: spacing.s4, gap: 2 },
});
