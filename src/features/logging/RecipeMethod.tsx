import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { FoodRef, RecipeDetail } from '@/core/catalog';
import { formatDecimal } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, BottomSheet, Icon, PressableScale, Skeleton, radius, spacing, useTheme } from '@/ui';
import { useServices } from '../startup/AppProvider';

/**
 * The mark of a food calculated from a recipe (odd/tasks/catalog-expansion.md T4, S8): an icon and words, in a colour of its
 * own, so it is not mistaken for laboratory data ("Catalog", plain) or for an AI estimate (sparkle, teal). With `onPress` it is
 * a button that opens the method.
 */
export function RecipeTag({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const content = (
    <View style={[styles.tag, { backgroundColor: colors.primarySoft }]}>
      <Icon name="plate" size={12} color={colors.primaryText} />
      <AppText variant="caption" tone="primary">
        {t('recipe.tag')}
      </AppText>
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={t('recipe.open')} onPress={onPress}>
      {content}
    </PressableScale>
  );
}

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; recipe: RecipeDetail | null };

/** What a person reads under "How it was calculated": ingredients, factors, assumptions and what is not reported. */
export function RecipeMethod({ food }: { food: FoodRef }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { catalog } = useServices();
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  const { source, id } = food;

  useEffect(() => {
    let active = true;
    catalog.getRecipe({ source, id } as FoodRef, locale).then(
      (recipe) => active && setState({ status: 'ready', recipe }),
      () => active && setState({ status: 'error' }),
    );
    return () => {
      active = false;
    };
  }, [catalog, source, id, locale]);

  if (state.status === 'loading') return <Skeleton height={120} radius={20} />;
  if (state.status === 'error') return <AppText tone="warning">{t('recipe.error')}</AppText>;
  const recipe = state.recipe;
  if (!recipe) return null;

  const grams = (n: number) => formatDecimal(locale, n, 1);
  const unknown = recipe.unknownNutrients.map((code) => t(`nutrient.${code}`)).join(', ');
  return (
    <View style={styles.method} testID="recipe-method">
      <AppText variant="bodySm" tone="muted">
        {t('recipe.lead')}
      </AppText>

      <AppText variant="bodyMd" accessibilityRole="header">
        {t('recipe.ingredients')}
      </AppText>
      {recipe.ingredients.map((ing, i) => (
        <AppText key={`${i}-${ing.name}`} variant="bodySm">
          {ing.absorbed
            ? t('recipe.ingredientAbsorbed', { name: ing.name, grams: grams(ing.grams) })
            : ing.yieldPercent !== null
              ? t('recipe.ingredientYield', { name: ing.name, grams: grams(ing.grams), percent: grams(ing.yieldPercent) })
              : t('recipe.ingredientLine', { name: ing.name, grams: grams(ing.grams) })}
        </AppText>
      ))}
      <AppText variant="bodySm" tone="muted">
        {t('recipe.weights', { raw: grams(recipe.rawGrams), final: grams(recipe.finalGrams) })}
      </AppText>

      <AppText variant="bodyMd" accessibilityRole="header">
        {t('recipe.preparation')}
      </AppText>
      <AppText variant="bodySm">{recipe.preparation}</AppText>

      <AppText variant="bodyMd" accessibilityRole="header">
        {t('recipe.basis')}
      </AppText>
      <AppText variant="bodySm">{recipe.basis}</AppText>

      <AppText variant="bodyMd" accessibilityRole="header">
        {t('recipe.sources')}
      </AppText>
      {recipe.factorSources.length > 0 ? (
        recipe.factorSources.map((source) => (
          <AppText key={source} variant="bodySm">
            {source}
          </AppText>
        ))
      ) : (
        <AppText variant="bodySm">{t('recipe.noSources')}</AppText>
      )}

      {unknown !== '' ? (
        <AppText variant="bodySm" tone="muted">
          {t('recipe.unknown', { list: unknown })}
        </AppText>
      ) : null}
      <AppText variant="caption" tone="muted">
        {t('recipe.limits')}
      </AppText>
      <AppText variant="caption" tone="muted">
        {t('recipe.version', { version: recipe.version })}
      </AppText>
    </View>
  );
}

interface RecipeMethodSheetProps {
  /** The recipe-calculated food to explain; null closes the sheet. */
  food: { ref: FoodRef; name: string } | null;
  onClose: () => void;
}

/** The method in a sheet: for the review row and the meal detail. */
export function RecipeMethodSheet({ food, onClose }: RecipeMethodSheetProps) {
  const { t } = useTranslation();
  // Keep the last food while the sheet slides out, so its content does not vanish mid-animation.
  const [shown, setShown] = useState(food);
  if (food && food !== shown) setShown(food);
  const current = food ?? shown;
  return (
    <BottomSheet visible={food !== null} onClose={onClose} title={current?.name ?? ''} closeLabel={t('recipe.close')}>
      {current ? <RecipeMethod key={`${current.ref.source}:${current.ref.id}`} food={current.ref} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: spacing.s1, paddingHorizontal: spacing.s2, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'flex-start' },
  method: { gap: spacing.s2 },
});
