import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { isRecipeRef, type FoodRef } from '@/core/catalog';
import type { MealSlot } from '@/core/nutrition';
import type { MealItem, MealWithItems } from '@/data';
import { formatClock, formatDecimal, formatLongDate, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import {
  AppText,
  Button,
  ChoiceChips,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  FieldMessage,
  GramStepper,
  IconButton,
  ScreenFrame,
  Skeleton,
  TopBar,
  layout,
  radius,
  spacing,
  useSnackbar,
  useTheme,
} from '@/ui';
import { GRAM_STEP, GRAMS_RANGE, validateGrams } from '../logging/limits';
import { gramsMessage } from '../logging/gramsMessage';
import { SLOT_ORDER } from '../logging/mealSlot';
import { RecipeMethodSheet, RecipeTag } from '../logging/RecipeMethod';
import { useScanPlatform } from '../scan/ScanPlatformContext';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { mealToSaveInput, nutrientLines, NUTRIENT_UNITS } from './mealData';

type State = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; meal: MealWithItems };

interface MealDetailScreenProps {
  mealId: string;
  now?: () => Date;
  /** Leaves the screen: back, or after the meal was deleted. */
  onClose: () => void;
  /** The meal was copied to today. */
  onCopied: () => void;
}

const systemNow = () => new Date();

/**
 * Meal detail (S7, FR-41, FR-42): a saved meal on any day with its items and the nutrient detail,
 * where the person can change grams, delete an item (after a confirmation) or the whole meal (after
 * a confirmation, with undo), change the meal type, and copy the meal to today (FR-33).
 */
export function MealDetailScreen({ mealId, now = systemNow, onClose, onCopied }: MealDetailScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { repos } = useServices();
  const platform = useScanPlatform();
  const { colors } = useTheme();
  const snackbar = useSnackbar();
  const { notifyChange } = useSession();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [deleteItem, setDeleteItem] = useState<MealItem | null>(null);
  const [deleteMeal, setDeleteMeal] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [method, setMethod] = useState<{ ref: FoodRef; name: string } | null>(null);

  const read = useCallback(() => {
    repos.meals.getMeal(mealId).then(
      (meal) => setState(meal ? { status: 'ready', meal } : { status: 'missing' }),
      () => setState({ status: 'error' }),
    );
  }, [repos, mealId]);
  useEffect(read, [read]);
  /** Reads the meal again;  keeps what is on screen meanwhile. */
  const load = (quiet = false) => {
    if (!quiet) setState({ status: 'loading' });
    read();
  };

  /** Runs a change, then reads the meal again; a failure keeps the screen as it was and says so. */
  const change = async (action: () => Promise<void>) => {
    setActionFailed(false);
    try {
      await action();
      notifyChange();
      load(true);
    } catch {
      setActionFailed(true);
      load(true);
    }
  };

  const removeMeal = async (meal: MealWithItems) => {
    setDeleteItem(null);
    setDeleteMeal(false);
    try {
      await repos.meals.deleteMeal(meal.id);
    } catch {
      setActionFailed(true);
      return;
    }
    // Deleting a meal deletes its photo (S9). Undo brings the meal back without it: the file is gone.
    if (meal.photoPath) await platform.files.remove(meal.photoPath).catch(() => undefined);
    notifyChange();
    setState({ status: 'missing' });
    snackbar.show({
      message: t('meal.deleted'),
      actionLabel: t('common.undo'),
      onAction: () => {
        void repos.meals.save(mealToSaveInput(meal)).then(() => {
          notifyChange();
          snackbar.show({ message: t('meal.restored') });
        });
      },
    });
    onClose();
  };

  const copyToToday = async (meal: MealWithItems) => {
    setActionFailed(false);
    try {
      const copy = await repos.meals.save(mealToSaveInput(meal, { eatenAt: now(), source: 'copy' }));
      notifyChange();
      const kcal = copy.items.reduce((sum, item) => sum + item.kcal, 0);
      snackbar.show({
        message: t('meal.copied', { kcal: formatNumber(locale, kcal) }),
        actionLabel: t('common.undo'),
        onAction: () => {
          void repos.meals.deleteMeal(copy.id).then(notifyChange, () => undefined);
        },
      });
      onCopied();
    } catch {
      setActionFailed(true);
    }
  };

  const header = <TopBar title={t('meal.title')} onBack={onClose} backLabel={t('common.back')} />;

  if (state.status === 'loading') {
    return (
      <ScreenFrame header={header}>
        <View style={styles.body} accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}>
          <Skeleton height={56} radius={16} />
          <Skeleton height={120} radius={24} />
          <Skeleton height={240} radius={24} />
        </View>
      </ScreenFrame>
    );
  }
  if (state.status === 'error') {
    return (
      <ScreenFrame header={header} ambient="warm">
        <View style={styles.body}>
          <ErrorState title={t('meal.title')} message={t('meal.loadError')}>
            <Button label={t('common.retry')} icon="retake" onPress={() => load()} />
          </ErrorState>
        </View>
      </ScreenFrame>
    );
  }
  if (state.status === 'missing') {
    return (
      <ScreenFrame header={header}>
        <View style={styles.body}>
          <EmptyState icon="plate" title={t('meal.title')} body={t('meal.notFound')} />
        </View>
      </ScreenFrame>
    );
  }

  const { meal } = state;
  return (
    <ScreenFrame header={header}>
      <View style={styles.body}>
        <View style={styles.head}>
          <AppText variant="titleSm">{meal.name?.trim() || meal.items.map((item) => item.displayName).join(', ')}</AppText>
          <AppText variant="bodyMd" tone="muted">
            {t(`today.slot.${meal.slot}`)} · {formatClock(locale, new Date(meal.eatenAt))}
          </AppText>
          <AppText variant="bodySm" tone="muted">
            {formatLongDate(locale, meal.localDate)}
          </AppText>
        </View>

        {meal.photoPath ? (
          <Image
            source={{ uri: platform.files.uriOf(meal.photoPath) }}
            style={[styles.photo, { backgroundColor: colors.surface }]}
            resizeMode="cover"
            accessibilityLabel={t('meal.photoLabel')}
            testID="meal-photo"
          />
        ) : null}

        {actionFailed ? <FieldMessage message={t('meal.actionError')} /> : null}

        <ChoiceChips<MealSlot>
          label={t('meal.slot')}
          title
          fill
          options={SLOT_ORDER.map((value) => ({ value, label: t(`today.slot.${value}`) }))}
          value={meal.slot}
          onChange={(value) => value && value !== meal.slot && void change(async () => void (await repos.meals.updateMeal(meal.id, { slot: value })))}
        />

        <View style={styles.section}>
          <AppText variant="heading" accessibilityRole="header">
            {t('meal.items')}
          </AppText>
          {meal.items.map((item) => (
            <ItemRow
              key={`${item.id}-${item.grams}`}
              item={item}
              locale={locale}
              onGrams={(grams) => change(async () => void (await repos.meals.updateItemGrams(item.id, grams)))}
              onDelete={() => setDeleteItem(item)}
              onMethod={(ref) => setMethod({ ref, name: item.displayName })}
            />
          ))}
        </View>

        <NutrientDetail meal={meal} locale={locale} />

        <Button label={t('meal.copy')} icon="copy" onPress={() => void copyToToday(meal)} />
        <Button label={t('meal.deleteMeal')} variant="secondary" icon="trash" onPress={() => setDeleteMeal(true)} />
      </View>

      <RecipeMethodSheet food={method} onClose={() => setMethod(null)} />
      <ConfirmSheet
        visible={deleteItem !== null}
        title={t('meal.deleteItemTitle')}
        body={deleteItem ? t('meal.deleteItemBody', { name: deleteItem.displayName }) : ''}
        note={meal.items.length === 1 ? t('meal.deleteItemLast') : undefined}
        confirmLabel={t('meal.deleteItemConfirm')}
        cancelLabel={t('meal.keep')}
        closeLabel={t('common.close')}
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => {
          const item = deleteItem;
          if (!item) return;
          if (meal.items.length === 1) return void removeMeal(meal);
          setDeleteItem(null);
          void change(async () => {
            await repos.meals.deleteItem(item.id);
            snackbar.show({ message: t('meal.itemDeleted', { name: item.displayName }) });
          });
        }}
      />
      <ConfirmSheet
        visible={deleteMeal}
        title={t('meal.deleteMealTitle')}
        body={t('meal.deleteMealBody')}
        confirmLabel={t('meal.deleteMealConfirm')}
        cancelLabel={t('meal.keep')}
        closeLabel={t('common.close')}
        onCancel={() => setDeleteMeal(false)}
        onConfirm={() => void removeMeal(meal)}
      />
    </ScreenFrame>
  );
}

interface ItemRowProps {
  item: MealItem;
  locale: Locale;
  onGrams: (grams: number) => Promise<void>;
  onDelete: () => void;
  /** Opens how a recipe-calculated item was made. */
  onMethod: (ref: FoodRef) => void;
}

function ItemRow({ item, locale, onGrams, onDelete, onMethod }: ItemRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [text, setText] = useState(String(Math.round(item.grams * 10) / 10));
  const [touched, setTouched] = useState(false);
  const problem = validateGrams(text).error;
  // A snapshot keeps only the source and the id: a recipe-calculated dish is told apart by its id (core/catalog/recipes.ts).
  const catalogRef: FoodRef | null = item.foodSource === 'catalog' && item.foodRef !== null ? { source: 'catalog', id: item.foodRef } : null;
  const recipeRef = catalogRef !== null && isRecipeRef(catalogRef) ? catalogRef : null;

  const commit = (value = text) => {
    setTouched(true);
    const { grams } = validateGrams(value);
    if (grams === null || grams === item.grams) return;
    void onGrams(grams);
  };
  const step = (direction: 1 | -1) => {
    const typed = validateGrams(text).grams ?? item.grams;
    const next = Math.min(GRAMS_RANGE.max, Math.max(GRAMS_RANGE.min, Math.round(typed + direction * GRAM_STEP)));
    setText(String(next));
    commit(String(next));
  };

  return (
    <View style={[styles.item, { backgroundColor: colors.surface }]}>
      <View style={styles.itemHead}>
        <View style={styles.itemName}>
          <AppText variant="itemName">{item.displayName}</AppText>
          {recipeRef ? <RecipeTag onPress={() => onMethod(recipeRef)} /> : null}
          {item.foodSource === 'ai_estimate' ? (
            <View style={[styles.estimate, { backgroundColor: colors.aiSoft }]}>
              <AppText variant="caption" tone="ai">
                {t('meal.aiEstimate')}
              </AppText>
            </View>
          ) : null}
        </View>
        <IconButton icon="trash" label={t('meal.deleteItem', { name: item.displayName })} onPress={onDelete} />
      </View>
      <View style={styles.itemControls}>
        <GramStepper
          value={text}
          onChangeText={setText}
          onCommit={() => commit()}
          onStep={step}
          inputLabel={t('meal.gramsOf', { name: item.displayName })}
          decreaseLabel={t('meal.decrease', { name: item.displayName })}
          increaseLabel={t('meal.increase', { name: item.displayName })}
          unit="g"
          announceValue={(value) => t('meal.gramsAnnounce', { value })}
          decreaseDisabled={item.grams <= GRAMS_RANGE.min}
          invalid={touched && problem !== null}
        />
        <AppText variant="bodySm" tone="muted">
          <AppText variant="numeral">{formatNumber(locale, item.kcal)}</AppText> kcal
        </AppText>
      </View>
      {touched && problem ? <FieldMessage message={gramsMessage(t, locale, problem)} /> : null}
    </View>
  );
}

function NutrientDetail({ meal, locale }: { meal: MealWithItems; locale: Locale }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {t('meal.nutrients')}
      </AppText>
      <AppText variant="bodySm" tone="muted">
        {t('meal.nutrientsNote')}
      </AppText>
      <View style={[styles.table, { backgroundColor: colors.surface }]}>
        {nutrientLines(meal).map((line) => {
          const name = t(`nutrient.${line.code}`);
          const unit = t(`nutrient.unit.${NUTRIENT_UNITS[line.code]}`);
          const value = line.total === null ? null : line.code === 'kcal' ? formatNumber(locale, line.total) : formatDecimal(locale, line.total, 1);
          const spoken = [name, value === null ? t('meal.notReported') : `${value} ${unit}`, line.partial ? t('meal.partial') : null].filter(Boolean).join(', ');
          return (
            <View key={line.code} accessible accessibilityLabel={spoken} style={styles.line} testID={`nutrient-${line.code}`}>
              <View style={styles.lineName}>
                <AppText variant="bodyMd" aria-hidden>
                  {name}
                </AppText>
                {line.partial ? (
                  <AppText variant="caption" tone="muted" aria-hidden>
                    {t('meal.partial')}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="bodyMd" tone={value === null ? 'muted' : 'default'} aria-hidden>
                {value === null ? t('meal.notReported') : `${value} ${unit}`}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s1, paddingBottom: spacing.s10, gap: spacing.s4 },
  head: { gap: 2, paddingHorizontal: spacing.s2 },
  photo: { width: '100%', height: 176, borderRadius: radius.lg },
  estimate: { alignSelf: 'flex-start', marginTop: spacing.s1, paddingHorizontal: spacing.s2, paddingVertical: 2, borderRadius: radius.pill },
  section: { gap: spacing.s2 },
  item: { borderRadius: radius.lg, padding: spacing.s3, paddingLeft: spacing.s4, gap: spacing.s2 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.s2 },
  itemName: { flex: 1, paddingTop: spacing.s2, alignItems: 'flex-start' },
  itemControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s2 },
  table: { borderRadius: radius.lg, paddingVertical: spacing.s2, paddingHorizontal: spacing.s4 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, gap: spacing.s3 },
  lineName: { flex: 1 },
});
