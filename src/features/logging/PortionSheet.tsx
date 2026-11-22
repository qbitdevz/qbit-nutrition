import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { isRecipeRef } from '@/core/catalog';
import { computeItemNutrients } from '@/core/nutrition';
import { formatDecimal, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, BottomSheet, Button, PressableScale, Skeleton, TextField, radius, spacing, useTheme } from '@/ui';
import { parseNumber } from '../forms/numbers';
import { originLabel } from '../foodimport/originLabel';
import { useServices } from '../startup/AppProvider';
import type { DraftItem } from './draft';
import { loadFoodView, refKey, type FoodRow, type FoodView } from './foods';
import { GRAMS_RANGE, validateGrams } from './limits';
import { RecipeMethod, RecipeTag } from './RecipeMethod';

interface PortionSheetProps {
  /** The food to portion; null closes the sheet. */
  food: FoodRow | null;
  /** Grams the person used last time for this food, if any. */
  lastGrams?: number;
  /** An amount suggested for this meal (a food suggestion): the sheet starts from it instead of the last amount. */
  suggestedGrams?: number;
  onClose: () => void;
  onAdd: (item: Omit<DraftItem, 'key'>) => void;
}

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; view: FoodView };

/**
 * The portion sheet (flow D step 3): grams, or a household measure from the catalog, with the
 * calories and macros of that amount updating as the person types. "Add to meal" validates the
 * amount; a mistake is explained under the field and the sheet stays open with the text as typed.
 */
export function PortionSheet({ food, lastGrams, suggestedGrams, onClose, onAdd }: PortionSheetProps) {
  const { t } = useTranslation();
  // Keep the last food while the sheet slides out, so its content does not vanish mid-animation.
  const [shown, setShown] = useState<FoodRow | null>(food);
  if (food && food !== shown) setShown(food);
  const current = food ?? shown;

  return (
    <BottomSheet visible={food !== null} onClose={onClose} title={current?.name ?? ''} closeLabel={t('log.portion.close')}>
      {current ? <PortionBody key={refKey(current.ref)} food={current} lastGrams={lastGrams} suggestedGrams={suggestedGrams} onAdd={onAdd} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function PortionBody({ food, lastGrams, suggestedGrams, onAdd, onClose }: { food: FoodRow; lastGrams?: number; suggestedGrams?: number; onAdd: PortionSheetProps['onAdd']; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const services = useServices();
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    let active = true;
    loadFoodView(services, food.ref, locale).then(
      (view) => {
        if (!active) return;
        if (!view) return setState({ status: 'error' });
        setState({ status: 'ready', view });
        // A suggested amount, the last amount used, a custom food's usual portion, the first household measure, or 100 g.
        const start = suggestedGrams ?? lastGrams ?? view.defaultGrams ?? view.portions[0]?.grams ?? 100;
        setText(String(Math.round(start * 10) / 10));
      },
      () => active && setState({ status: 'error' }),
    );
    return () => {
      active = false;
    };
  }, [services, food.ref, locale, lastGrams, suggestedGrams, attempt]);

  if (state.status === 'loading') return <Skeleton height={120} radius={20} />;
  if (state.status === 'error') {
    return (
      <View style={styles.body}>
        <AppText tone="warning">{t('log.search.error')}</AppText>
        <Button label={t('common.retry')} icon="retake" onPress={() => {
            setState({ status: 'loading' });
            setAttempt((n) => n + 1);
          }} />
      </View>
    );
  }

  const { view } = state;
  const { error, grams } = validateGrams(text);
  const shownError = touched && error ? t(error.key, formatRange(locale, error.params)) : null;
  const live = grams !== null ? computeItemNutrients({ per100g: view.per100g }, grams) : null;

  const add = () => {
    setTouched(true);
    if (grams === null) return;
    onAdd({ displayName: view.name, ref: view.ref, per100g: view.per100g, grams });
    onClose();
  };

  return (
    <View style={styles.body}>
      {view.imported ? (
        <View style={styles.recipe} testID="imported-origin">
          <View style={[styles.origin, { backgroundColor: colors.surfaceRaised }]}>
            <AppText variant="caption">{originLabel(t, view.imported)}</AppText>
          </View>
          {view.imported.basis === 'ml' ? (
            <AppText variant="bodySm" tone="muted">
              {t('import.mlNote')}
            </AppText>
          ) : null}
          {(['kcal', 'protein', 'carbs', 'fat'] as const).some((code) => view.per100g[code] === undefined) ? (
            <AppText variant="bodySm" tone="muted">
              {t('import.unknownNote')}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {isRecipeRef(view.ref) ? (
        <View style={styles.recipe}>
          <RecipeTag />
          <Button label={t('recipe.how')} variant="ghost" icon="right" block={false} onPress={() => setShowMethod((v) => !v)} />
          {showMethod ? <RecipeMethod food={view.ref} /> : null}
        </View>
      ) : null}
      <TextField
        label={t('log.portion.amount')}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setTouched(true);
        }}
        onBlur={() => setTouched(true)}
        onSubmitEditing={add}
        error={shownError}
        keyboardType="decimal-pad"
        returnKeyType="done"
        maxLength={7}
        suffix="g"
        autoFocus
      />

      {view.portions.length > 0 ? (
        <View style={styles.measures}>
          <AppText variant="bodyMd" tone="muted">
            {t('log.portion.measures')}
          </AppText>
          <View style={styles.chips}>
            {view.portions.map((portion) => {
              const selected = parseNumber(text).kind === 'number' && grams === portion.grams;
              return (
                <PressableScale
                  key={`${portion.label}-${portion.grams}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('log.portion.measureLabel', { label: portion.label, grams: formatDecimal(locale, portion.grams, 1) })}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setText(String(portion.grams));
                    setTouched(true);
                  }}
                  style={[styles.chip, selected ? { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 2 } : { borderColor: colors.borderStrong, borderWidth: 1.5 }]}>
                  <AppText variant="bodySm" numberOfLines={3}>
                    {portion.label} · {formatDecimal(locale, portion.grams, 1)} g
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}

      <View accessibilityLiveRegion="polite" style={[styles.live, { backgroundColor: colors.surface }]}>
        {live ? (
          <AppText variant="bodyMd">
            {t('log.portion.live', {
              // A value the food does not have is a dash, never a zero.
              kcal: live.kcal === undefined ? '–' : formatNumber(locale, live.kcal),
              protein: live.protein === undefined ? '–' : formatDecimal(locale, live.protein, 1),
              carbs: live.carbs === undefined ? '–' : formatDecimal(locale, live.carbs, 1),
              fat: live.fat === undefined ? '–' : formatDecimal(locale, live.fat, 1),
            })}
          </AppText>
        ) : (
          <AppText variant="bodyMd" tone="muted">
            –
          </AppText>
        )}
      </View>

      <Button label={t('log.portion.add')} icon="plus" onPress={add} />
    </View>
  );
}

/** Range numbers in messages follow the app language ("5,000"). */
function formatRange(locale: Locale, params?: Record<string, string | number>): Record<string, string | number> {
  const range = params ?? { min: GRAMS_RANGE.min, max: GRAMS_RANGE.max };
  return Object.fromEntries(Object.entries(range).map(([key, value]) => [key, typeof value === 'number' ? formatNumber(locale, value) : value]));
}

const styles = StyleSheet.create({
  body: { gap: spacing.s3 },
  recipe: { gap: spacing.s2, alignItems: 'flex-start' },
  origin: { paddingHorizontal: spacing.s2, paddingVertical: 2, borderRadius: radius.pill },
  measures: { gap: spacing.s2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  chip: { minHeight: 48, paddingHorizontal: spacing.s4, paddingVertical: spacing.s2, borderRadius: radius.lg, justifyContent: 'center', maxWidth: '100%' },
  live: { minHeight: 52, borderRadius: radius.lg, justifyContent: 'center', paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 },
});
