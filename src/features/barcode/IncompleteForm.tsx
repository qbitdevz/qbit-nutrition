import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MAX_GRAMS_100G, MAX_KCAL_100G, type ProductField } from '@/core/barcode';
import type { BarcodeProductRecord } from '@/data';
import { formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, FieldMessage, Icon, TextField, radius, spacing, useTheme } from '@/ui';
import { parseNumber } from '../forms/numbers';
import type { ProductCorrections } from './barcodeService';

interface IncompleteFormProps {
  product: BarcodeProductRecord;
  locale: Locale;
  /** Stores the corrections as the person's own; rejects when they could not be saved. */
  onSave: (values: ProductCorrections) => Promise<void>;
}

type Field = 'name' | 'kcal' | 'protein' | 'carbs' | 'fat';
const NUMERIC = ['kcal', 'protein', 'carbs', 'fat'] as const;
const LABEL: Record<Field, string> = {
  name: 'log.custom.name',
  kcal: 'log.custom.kcal',
  protein: 'log.custom.protein',
  carbs: 'log.custom.carbs',
  fat: 'log.custom.fat',
};
const MAX: Record<(typeof NUMERIC)[number], number> = { kcal: MAX_KCAL_100G, protein: MAX_GRAMS_100G, carbs: MAX_GRAMS_100G, fat: MAX_GRAMS_100G };

/** The reported value as text to start from; a value the service did not have starts empty (nothing is invented). */
const start = (value: number | undefined): string => (value === undefined ? '' : String(Math.round(value * 10) / 10));

/**
 * A product Open Food Facts only partly knows, or whose numbers do not add up: the four per-100 g values (and the name,
 * when it has none) are editable before the product can be logged. What the service reported is filled in; what it did
 * not report is empty and marked "Missing". Every mistake is explained under its field and everything typed stays.
 */
export function IncompleteForm({ product, locale, onSave }: IncompleteFormProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const missing = new Set<ProductField>(product.missing);
  const [values, setValues] = useState<Record<Field, string>>({
    name: product.name,
    kcal: start(product.per100g.kcal),
    protein: start(product.per100g.protein),
    carbs: start(product.per100g.carbs),
    fat: start(product.per100g.fat),
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [problem, setProblem] = useState<'fix' | 'save' | null>(null);
  const [busy, setBusy] = useState(false);

  const check = (field: Field, text: string): { error: string | null; value: number | null } => {
    if (field === 'name') return { error: text.trim() === '' ? t('log.custom.nameRequired') : null, value: null };
    const parsed = parseNumber(text);
    if (parsed.kind !== 'number') return { error: t('log.custom.number'), value: null };
    if (parsed.value < 0 || parsed.value > MAX[field]) return { error: t('log.custom.range', { min: formatNumber(locale, 0), max: formatNumber(locale, MAX[field]) }), value: null };
    return { error: null, value: parsed.value };
  };

  const set = (field: Field, text: string) => setValues((current) => ({ ...current, [field]: text }));
  const blur = (field: Field) => setErrors((current) => ({ ...current, [field]: check(field, values[field]).error ?? undefined }));

  const save = async () => {
    const found: Partial<Record<Field, string>> = {};
    const numbers: Partial<Record<Field, number>> = {};
    for (const field of ['name', ...NUMERIC] as Field[]) {
      const { error, value } = check(field, values[field]);
      if (error) found[field] = error;
      else if (value !== null) numbers[field] = value;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return setProblem('fix');
    setBusy(true);
    setProblem(null);
    try {
      await onSave({ name: values.name, kcal: numbers.kcal!, protein: numbers.protein!, carbs: numbers.carbs!, fat: numbers.fat! });
    } catch {
      setProblem('save');
      setBusy(false);
    }
  };

  const field = (name: Field, suffix?: string) => (
    <View key={name} style={styles.field}>
      <TextField
        label={t(LABEL[name])}
        value={values[name]}
        onChangeText={(text) => set(name, text)}
        onBlur={() => blur(name)}
        error={errors[name] ?? null}
        hint={missing.has(name) ? t('barcode.incomplete.missing') : undefined}
        keyboardType={name === 'name' ? 'default' : 'decimal-pad'}
        returnKeyType="next"
        suffix={suffix}
        maxLength={name === 'name' ? 120 : 7}
        testID={`barcode-edit-${name}`}
      />
    </View>
  );

  return (
    <View style={styles.root} testID="barcode-incomplete">
      <View style={[styles.notice, { backgroundColor: colors.warningSoft }]} accessibilityRole="alert">
        <Icon name="alert" color={colors.warning} />
        <View style={styles.noticeText}>
          <AppText variant="itemName">{t('barcode.incomplete.title')}</AppText>
          <AppText variant="bodyMd">{t('barcode.incomplete.body')}</AppText>
          {product.inconsistent ? (
            <AppText variant="bodyMd" testID="barcode-inconsistent">
              {t('barcode.incomplete.inconsistent')}
            </AppText>
          ) : null}
        </View>
      </View>

      <AppText variant="heading" accessibilityRole="header">
        {product.name || product.barcode}
      </AppText>
      {product.name === '' ? field('name') : null}
      {field('kcal', 'kcal')}
      {field('protein', 'g')}
      {field('carbs', 'g')}
      {field('fat', 'g')}

      {problem === 'save' ? <FieldMessage message={t('barcode.incomplete.saveError')} /> : null}
      {problem === 'fix' ? (
        <AppText variant="bodySm" tone="warning">
          {t('barcode.incomplete.fixErrors')}
        </AppText>
      ) : null}
      <Button label={t('barcode.incomplete.save')} icon="check" onPress={() => void save()} disabled={busy} testID="barcode-save-values" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.s3 },
  notice: { flexDirection: 'row', gap: spacing.s3, padding: spacing.s4, borderRadius: radius.lg, alignItems: 'flex-start' },
  noticeText: { flex: 1, gap: spacing.s1 },
  field: { gap: spacing.s1 },
});
