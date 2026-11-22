import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { FoodRef } from '@/core/catalog';
import { formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, FieldMessage, ScreenFooter, ScreenFrame, TextField, TopBar, layout, spacing } from '@/ui';
import { parseNumber } from '../forms/numbers';
import { useServices } from '../startup/AppProvider';
import { useMealDraft } from './draft';
import { CUSTOM_FOOD_RANGES } from './limits';

interface CustomFoodScreenProps {
  /** What was searched for: the starting name. */
  initialName?: string;
  /** The food exists; the route goes back to the search, which opens its portion sheet. */
  onCreated: (ref: FoodRef) => void;
  onBack?: () => void;
}

type Field = 'name' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'portion';

/** Per 100 g, as on a label. A guard against typos: kcal up to 1,000 (pure fat is 900), grams up to 100. */
const RANGES = CUSTOM_FOOD_RANGES;

/**
 * Create a custom food (FR-32, flow D "no results"): a name and the four headline values per 100 g,
 * and optionally a usual portion. Mistakes are explained per field on submit and when a field is left;
 * everything typed stays. Saving goes through `CustomFoodRepository`.
 */
export function CustomFoodScreen({ initialName = '', onCreated, onBack }: CustomFoodScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { repos } = useServices();
  const draft = useMealDraft();
  const [values, setValues] = useState<Record<Field, string>>({ name: initialName, kcal: '', protein: '', carbs: '', fat: '', portion: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'fix' | 'save' | null>(null);

  const check = (field: Field, text: string): { error: string | null; value: number | null } => {
    if (field === 'name') return { error: text.trim() === '' ? t('log.custom.nameRequired') : null, value: null };
    const parsed = parseNumber(text);
    if (field === 'portion' && parsed.kind === 'empty') return { error: null, value: null };
    if (parsed.kind !== 'number') return { error: t('log.custom.number'), value: null };
    const { min, max } = RANGES[field];
    if (parsed.value < min || parsed.value > max) {
      return { error: t('log.custom.range', { min: formatNumber(locale, min), max: formatNumber(locale, max) }), value: null };
    }
    return { error: null, value: parsed.value };
  };

  const set = (field: Field, text: string) => setValues((current) => ({ ...current, [field]: text }));
  const blur = (field: Field) => setErrors((current) => ({ ...current, [field]: check(field, values[field]).error ?? undefined }));

  const save = async () => {
    const found: Partial<Record<Field, string>> = {};
    const numbers: Partial<Record<Field, number | null>> = {};
    for (const field of Object.keys(values) as Field[]) {
      const { error, value } = check(field, values[field]);
      if (error) found[field] = error;
      numbers[field] = value;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setProblem('fix');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const food = await repos.customFoods.create({
        name: values.name,
        kcal100g: numbers.kcal!,
        protein100g: numbers.protein!,
        carbs100g: numbers.carbs!,
        fat100g: numbers.fat!,
        defaultPortionG: numbers.portion ?? null,
      });
      const ref: FoodRef = { source: 'custom', id: food.id };
      draft.setPending(ref);
      onCreated(ref);
    } catch {
      setProblem('save');
    } finally {
      setBusy(false);
    }
  };

  const field = (name: Field, label: string, unit?: string) => (
    <TextField
      label={label}
      value={values[name]}
      onChangeText={(text) => set(name, text)}
      onBlur={() => blur(name)}
      error={errors[name] ?? null}
      keyboardType={name === 'name' ? 'default' : 'decimal-pad'}
      returnKeyType="next"
      suffix={unit}
      maxLength={name === 'name' ? 80 : 7}
    />
  );

  return (
    <ScreenFrame
      header={<TopBar title={t('log.custom.title')} onBack={onBack} backLabel={t('common.back')} />}
      footer={
        <ScreenFooter>
          {problem === 'save' ? <FieldMessage message={t('log.custom.saveError')} /> : null}
          {problem === 'fix' ? (
            <AppText variant="bodySm" tone="warning" style={styles.center}>
              {t('log.custom.fixErrors')}
            </AppText>
          ) : null}
          <Button label={t('log.custom.save')} icon="check" onPress={() => void save()} disabled={busy} />
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <AppText tone="muted">{t('log.custom.intro')}</AppText>
        {field('name', t('log.custom.name'))}
        {field('kcal', t('log.custom.kcal'), 'kcal')}
        {field('protein', t('log.custom.protein'), 'g')}
        {field('carbs', t('log.custom.carbs'), 'g')}
        {field('fat', t('log.custom.fat'), 'g')}
        {field('portion', t('log.custom.portion'), 'g')}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s2, paddingBottom: spacing.s6, gap: spacing.s4 },
  center: { textAlign: 'center' },
});
