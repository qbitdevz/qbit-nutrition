import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { computeItemNutrients, sumNutrients, type MealSlot } from '@/core/nutrition';
import { formatDecimal, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import {
  AppText,
  Button,
  ChoiceChips,
  ConfirmSheet,
  EmptyState,
  FieldMessage,
  GramStepper,
  IconButton,
  ScreenFooter,
  ScreenFrame,
  TopBar,
  layout,
  radius,
  spacing,
  useSnackbar,
  useTheme,
} from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { useMealDraft, type DraftItem } from './draft';
import { gramsMessage } from './gramsMessage';
import { GRAM_STEP, GRAMS_RANGE, validateGrams } from './limits';
import { pickSlot, SLOT_ORDER } from './mealSlot';

interface ReviewScreenProps {
  /** The clock; the meal is saved at this time and the slot preselected from it. */
  now?: () => Date;
  /** "Add another food": opens the search again, keeping the items. */
  onAddItem: () => void;
  /** The meal was saved: the route returns to Today. */
  onSaved: () => void;
  /** Leaves the review without saving (after the person confirmed discarding, or when it is empty). */
  onClose: () => void;
}

const systemNow = () => new Date();
const SNACKBAR_GAP = spacing.s3;

/**
 * The Review screen for manual meals (flow D step 4, and the same screen flow B reuses): the items
 * collected so far, each with grams to change by stepper or typing, removable with an undo; the
 * totals and the meal slot pinned above "Save meal". Nothing is written until Save, and Save goes
 * through `MealRepository` (S10).
 */
export function ReviewScreen({ now = systemNow, onAddItem, onSaved, onClose }: ReviewScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const { repos } = useServices();
  const draft = useMealDraft();
  const snackbar = useSnackbar();
  const { notifyChange } = useSession();

  // What is typed in each grams field, by item. It follows the draft, except while the text is not yet a valid amount.
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [footerHeight, setFooterHeight] = useState(240);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const slot: MealSlot = draft.slot ?? pickSlot(now());
  const textOf = (item: DraftItem) => texts[item.key] ?? String(item.grams);
  const problems = draft.items.map((item) => validateGrams(textOf(item)).error);
  const anyInvalid = problems.some((problem) => problem !== null);

  const totals = useMemo(
    () => sumNutrients(draft.items.map((item) => computeItemNutrients({ per100g: item.per100g }, item.grams))),
    [draft.items],
  );
  const kcal = totals.kcal ?? 0;

  const type = (item: DraftItem, text: string) => {
    setTexts((current) => ({ ...current, [item.key]: text }));
    const { grams } = validateGrams(text);
    if (grams !== null) draft.setGrams(item.key, grams);
  };

  const step = (item: DraftItem, direction: 1 | -1) => {
    const typed = validateGrams(textOf(item)).grams ?? item.grams;
    const next = Math.min(GRAMS_RANGE.max, Math.max(GRAMS_RANGE.min, Math.round(typed + direction * GRAM_STEP)));
    setTexts((current) => ({ ...current, [item.key]: String(next) }));
    draft.setGrams(item.key, next);
  };

  const remove = (item: DraftItem) => {
    const removed = draft.removeItem(item.key);
    if (!removed) return;
    snackbar.show({
      message: t('log.review.removed', { name: item.displayName }),
      actionLabel: t('common.undo'),
      onAction: () => draft.restoreItem(removed.item, removed.index),
      bottomOffset: footerHeight + SNACKBAR_GAP,
    });
  };

  const save = async () => {
    if (draft.items.length === 0 || anyInvalid || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await repos.meals.save({
        eatenAt: now(),
        slot,
        source: 'manual',
        items: draft.items.map((item) => ({
          displayName: item.displayName,
          grams: item.grams,
          foodSource: item.ref.source,
          foodRef: item.ref.id,
          origin: 'manual',
          nutrients: computeItemNutrients({ per100g: item.per100g }, item.grams),
        })),
      });
    } catch {
      // The items stay exactly as they are; the person can try again.
      setSaveFailed(true);
      setSaving(false);
      return;
    }
    draft.clear();
    notifyChange();
    snackbar.show({ message: t('log.review.saved', { slot: t(`today.slot.${slot}`), kcal: formatNumber(locale, kcal) }) });
    setSaving(false);
    onSaved();
  };

  const back = () => (draft.items.length > 0 ? setConfirmDiscard(true) : onClose());
  const disabledReason = draft.items.length === 0 ? t('log.review.needItem') : anyInvalid ? t('profile.fixErrors') : null;

  return (
    <ScreenFrame
      header={<TopBar title={t('log.review.title')} onBack={back} backLabel={t('log.review.back')} />}
      footer={
        <ScreenFooter onLayout={setFooterHeight}>
          <View
            accessible
            accessibilityLabel={t('log.review.totalLabel', {
              kcal: formatNumber(locale, kcal),
              protein: formatDecimal(locale, totals.protein ?? 0, 1),
              carbs: formatDecimal(locale, totals.carbs ?? 0, 1),
              fat: formatDecimal(locale, totals.fat ?? 0, 1),
            })}
            style={styles.totals}
            testID="review-totals">
            <AppText variant="numeralMd" aria-hidden>
              {formatNumber(locale, kcal)} <AppText variant="bodyMd" tone="muted">kcal</AppText>
            </AppText>
            <AppText variant="bodySm" tone="muted" aria-hidden>
              {t('log.review.macros', {
                protein: formatDecimal(locale, totals.protein ?? 0, 1),
                carbs: formatDecimal(locale, totals.carbs ?? 0, 1),
                fat: formatDecimal(locale, totals.fat ?? 0, 1),
              })}
            </AppText>
          </View>
          <ChoiceChips<MealSlot>
            label={t('log.review.slot')}
            fill
            options={SLOT_ORDER.map((value) => ({ value, label: t(`today.slot.${value}`) }))}
            value={slot}
            onChange={(value) => value && draft.setSlot(value)}
          />
          {saveFailed ? <FieldMessage message={t('log.review.saveError')} /> : null}
          {disabledReason ? (
            <AppText variant="bodySm" tone="muted" style={styles.center}>
              {disabledReason}
            </AppText>
          ) : null}
          <Button
            label={t('log.review.save')}
            icon="check"
            onPress={() => void save()}
            disabled={draft.items.length === 0 || anyInvalid || saving}
          />
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <AppText tone="muted" style={styles.subtitle}>
          {t('log.review.subtitle')}
        </AppText>

        {draft.items.length === 0 ? (
          <EmptyState icon="plate" title={t('log.review.emptyTitle')} body={t('log.review.empty')} />
        ) : (
          <View style={styles.items}>
            {draft.items.map((item, index) => {
              const problem = problems[index];
              const nutrients = computeItemNutrients({ per100g: item.per100g }, item.grams);
              return (
                <View key={item.key} style={[styles.item, { backgroundColor: colors.surface }]}>
                  <View style={styles.itemHead}>
                    <View style={styles.itemName}>
                      <AppText variant="itemName">{item.displayName}</AppText>
                      <AppText variant="caption" tone="muted">
                        {item.ref.source === 'custom' ? t('log.search.custom') : t('log.review.catalog')}
                      </AppText>
                    </View>
                    <IconButton icon="x" label={t('log.review.remove', { name: item.displayName })} onPress={() => remove(item)} />
                  </View>
                  <View style={styles.itemControls}>
                    <GramStepper
                      value={textOf(item)}
                      onChangeText={(text) => type(item, text)}
                      onCommit={() => setTouched((current) => ({ ...current, [item.key]: true }))}
                      onStep={(direction) => step(item, direction)}
                      inputLabel={t('log.review.gramsOf', { name: item.displayName })}
                      decreaseLabel={t('log.review.decrease', { name: item.displayName })}
                      increaseLabel={t('log.review.increase', { name: item.displayName })}
                      unit="g"
                      decreaseDisabled={item.grams <= GRAMS_RANGE.min}
                      invalid={problem !== null}
                    />
                    <AppText variant="bodySm" tone="muted" style={styles.itemKcal}>
                      <AppText variant="numeral">{formatNumber(locale, nutrients.kcal ?? 0)}</AppText> kcal
                    </AppText>
                  </View>
                  {problem && touched[item.key] ? <FieldMessage message={gramsMessage(t, locale, problem)} /> : null}
                </View>
              );
            })}
          </View>
        )}

        <Button label={t('log.review.addMore')} variant="secondary" icon="plus" onPress={onAddItem} />
      </View>

      <ConfirmSheet
        visible={confirmDiscard}
        title={t('log.review.discardTitle')}
        body={t('log.review.discardBody')}
        confirmLabel={t('log.review.discard')}
        cancelLabel={t('log.review.keep')}
        closeLabel={t('common.close')}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          draft.clear();
          onClose();
        }}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s1, paddingBottom: spacing.s6, gap: spacing.s4 },
  subtitle: { paddingHorizontal: spacing.s2 },
  items: { gap: spacing.s2 },
  item: { borderRadius: radius.lg, padding: spacing.s3, paddingLeft: spacing.s4, gap: spacing.s2 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.s2 },
  itemName: { flex: 1, paddingTop: spacing.s2 },
  itemControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s2 },
  itemKcal: { textAlign: 'right' },
  totals: { gap: 2 },
  center: { textAlign: 'center' },
});
