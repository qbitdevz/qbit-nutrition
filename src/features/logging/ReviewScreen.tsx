import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Image, StyleSheet, View } from 'react-native';

import { isRecipeRef, type FoodRef } from '@/core/catalog';
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
  Icon,
  IconButton,
  PressableScale,
  ScreenFooter,
  ScreenFrame,
  TopBar,
  layout,
  radius,
  spacing,
  useSnackbar,
  useTheme,
} from '@/ui';
import { useScanPlatform } from '../scan/ScanPlatformContext';
import { useScanSession } from '../scan/ScanSession';
import { readKeepPhotos } from '../scan/photoSettings';
import { useSession } from '../session/AppSession';
import { originLabel } from '../foodimport/originLabel';
import { useImportedOrigins } from '../foodimport/useImportedOrigins';
import { useServices } from '../startup/AppProvider';
import { isEdited, itemState, useMealDraft, type DraftItem } from './draft';
import { gramsMessage } from './gramsMessage';
import { GRAM_STEP, GRAMS_RANGE, validateGrams } from './limits';
import { pickSlot, SLOT_ORDER } from './mealSlot';
import { RecipeMethodSheet, RecipeTag } from './RecipeMethod';
import { draftToSaveItems } from './saveDraft';

interface ReviewScreenProps {
  /** The clock; the meal is saved at this time and the slot preselected from it. */
  now?: () => Date;
  /** "Add another food": opens the search again, keeping the items. */
  onAddItem: () => void;
  /** The person tapped the name of a scanned item: the search opens prefilled with what the model detected, to replace the food. */
  onSwap?: (key: string, detectedName: string) => void;
  /** "Retake": back to the camera, after the scan's items were dropped. */
  onRetake?: () => void;
  /** The meal was saved: the route returns to Today. */
  onSaved: () => void;
  /** Leaves the review without saving (after the person confirmed discarding, or when it is empty). */
  onClose: () => void;
}

const systemNow = () => new Date();
const SNACKBAR_GAP = spacing.s3;

type Exit = 'back' | 'retake';

/**
 * The Review screen: the one screen for a manual meal (flow D step 4) and for a scan (flow B steps 4
 * and 5, S5 to S7). A scan adds the photo header, the state of each item in text, low-confidence marks
 * and weight flags, and a way to swap the food; everything else is shared. Items change locally and
 * never call a provider. Nothing is written until Save, which goes through `MealRepository` in one
 * transaction (S10).
 */
export function ReviewScreen({ now = systemNow, onAddItem, onSwap, onRetake, onSaved, onClose }: ReviewScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const { repos, catalog } = useServices();
  const platform = useScanPlatform();
  const scanSession = useScanSession();
  const draft = useMealDraft();
  const snackbar = useSnackbar();
  const { notifyChange } = useSession();
  const review = scanSession.review;
  // Which items come from a table the person imported (S5): they carry the table's name.
  const origins = useImportedOrigins(draft.items.flatMap((item) => (item.ref?.source === 'custom' ? [item.ref.id] : [])));

  // What is typed in each grams field, by item. It follows the draft, except while the text is not yet a valid amount.
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [footerHeight, setFooterHeight] = useState(240);
  const [confirmExit, setConfirmExit] = useState<Exit | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [method, setMethod] = useState<{ ref: FoodRef; name: string } | null>(null);

  const slot: MealSlot = draft.slot ?? pickSlot(now());
  const textOf = (item: DraftItem) => texts[item.key] ?? String(item.grams);
  const problems = draft.items.map((item) => validateGrams(textOf(item)).error);
  const anyInvalid = problems.some((problem) => problem !== null);
  const needsMatch = draft.items.some((item) => item.per100g === null);

  const totals = useMemo(
    () => sumNutrients(draft.items.map((item) => (item.per100g ? computeItemNutrients({ per100g: item.per100g }, item.grams) : {}))),
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
    if (draft.items.length === 0 || anyInvalid || needsMatch || saving) return;
    setSaving(true);
    setSaveFailed(false);

    // A compressed copy of the scanned photo is kept only when the person left that on (S9).
    let photoPath: string | null = null;
    let photoLost = false;
    if (review) {
      const keep = await readKeepPhotos(repos.settings).catch(() => true);
      if (keep) {
        try {
          photoPath = await platform.files.keep(review.preparedUri);
        } catch {
          photoLost = true;
        }
      }
    }

    try {
      await repos.meals.save({
        eatenAt: now(),
        slot,
        source: review ? 'scan' : 'manual',
        scanId: review?.scanId ?? null,
        photoPath,
        name: review?.dishName || null,
        items: draftToSaveItems(draft.items),
      });
    } catch {
      // The items stay exactly as they are; the person can try again. A photo copied for this save is not left behind.
      if (photoPath) await platform.files.remove(photoPath).catch(() => undefined);
      setSaveFailed(true);
      setSaving(false);
      return;
    }

    // A swap is learned once the meal is saved: the next scan of the same detected name starts from it.
    await Promise.all(
      draft.items.flatMap((item) => (item.scan?.swapped && item.ref ? [catalog.rememberCorrection(item.scan.detectedName, item.ref).catch(() => undefined)] : [])),
    );
    draft.clear();
    await scanSession.release();
    notifyChange();
    snackbar.show({ message: t('log.review.saved', { slot: t(`today.slot.${slot}`), kcal: formatNumber(locale, kcal) }) });
    if (photoLost) snackbar.show({ message: t('log.review.photoKept') });
    setSaving(false);
    onSaved();
  };

  const leave = async (exit: Exit) => {
    draft.clear();
    await scanSession.release();
    if (exit === 'retake') onRetake?.();
    else onClose();
  };

  const back = () => (draft.items.length > 0 ? setConfirmExit('back') : void leave('back'));
  const retake = () => (draft.dirty ? setConfirmExit('retake') : void leave('retake'));

  // The system back gesture asks the same question as the back button.
  const itemCount = draft.items.length;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (itemCount === 0) return false;
      setConfirmExit('back');
      return true;
    });
    return () => subscription.remove();
  }, [itemCount]);

  const disabledReason = draft.items.length === 0 ? t('log.review.needItem') : needsMatch ? t('log.review.needMatch') : anyInvalid ? t('profile.fixErrors') : null;
  const showMealWarning = review?.mealWarnings.includes('meal_weight_extreme') && !draft.dirty;

  return (
    <ScreenFrame
      header={
        <TopBar
          title={t('log.review.title')}
          onBack={back}
          backLabel={t('log.review.back')}
          right={
            review && onRetake ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t('log.review.retake')}
                onPress={retake}
                testID="review-retake"
                style={[styles.retake, { borderColor: colors.borderStrong }]}>
                <Icon name="retake" size={18} color={colors.text} />
                <AppText variant="bodyMd">{t('log.review.retake')}</AppText>
              </PressableScale>
            ) : undefined
          }
        />
      }
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
            disabled={draft.items.length === 0 || anyInvalid || needsMatch || saving}
          />
        </ScreenFooter>
      }>
      <View style={styles.body}>
        {review ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: review.photoUri }} style={[styles.photo, { backgroundColor: colors.surface }]} resizeMode="cover" accessibilityLabel={t('log.review.photoLabel')} testID="scan-photo" />
            <View style={[styles.photoChip, { backgroundColor: colors.aiSoft }]}>
              <Icon name="sparkle" size={16} color={colors.ai} />
              <AppText variant="bodySm" tone="ai">
                {t('log.review.aiFound', { count: draft.items.length })}
              </AppText>
            </View>
          </View>
        ) : null}

        <AppText tone="muted" style={styles.subtitle}>
          {t('log.review.subtitle')}
        </AppText>

        {showMealWarning ? (
          <View style={[styles.warning, { backgroundColor: colors.warningSoft }]} accessibilityRole="alert">
            <Icon name="alert" size={20} color={colors.warning} />
            <AppText variant="bodySm" style={styles.warningText}>
              {t('log.review.mealWeightHigh')}
            </AppText>
          </View>
        ) : null}

        {draft.items.length === 0 ? (
          <EmptyState icon="plate" title={t('log.review.emptyTitle')} body={t('log.review.empty')} />
        ) : (
          <View style={styles.items}>
            {draft.items.map((item, index) => {
              const problem = problems[index];
              const nutrients = item.per100g ? computeItemNutrients({ per100g: item.per100g }, item.grams) : null;
              const state = itemState(item);
              const recipe = item.ref !== null && isRecipeRef(item.ref);
              const scan = item.scan;
              const unedited = !isEdited(item);
              const warnings = scan && unedited ? scan.warnings : [];
              const origin = item.ref?.source === 'custom' ? origins.get(item.ref.id) : undefined;
              return (
                <View key={item.key} style={[styles.item, { backgroundColor: colors.surface }]} testID={`review-item-${item.displayName}`}>
                  <View style={styles.itemHead}>
                    <View style={styles.itemName}>
                      {scan && onSwap ? (
                        <PressableScale
                          accessibilityRole="button"
                          accessibilityLabel={t('log.review.swap', { name: item.displayName })}
                          onPress={() => onSwap(item.key, scan.detectedName)}
                          style={styles.nameButton}>
                          <AppText variant="itemName">{item.displayName}</AppText>
                          <Icon name="swap" size={16} color={colors.primaryText} />
                        </PressableScale>
                      ) : (
                        <AppText variant="itemName">{item.displayName}</AppText>
                      )}
                      <View style={styles.tags}>
                        {state && !(state === 'matched' && recipe) ? (
                          <StateTag state={state} label={t(`log.review.state.${state === 'needs_match' ? 'needsMatch' : state}`)} />
                        ) : state ? null : recipe ? null : (
                          <Tag label={origin ? originLabel(t, origin) : item.ref?.source === 'custom' ? t('log.search.custom') : item.ref?.source === 'barcode' ? t('log.review.barcode') : t('log.review.catalog')} />
                        )}
                        {origin && state ? <Tag label={originLabel(t, origin)} /> : null}
                        {recipe && item.ref ? <RecipeTag onPress={() => setMethod({ ref: item.ref as FoodRef, name: item.displayName })} /> : null}
                        {scan?.confidenceFood === 'low' ? <Mark label={t('log.review.checkFood')} /> : null}
                        {scan?.confidencePortion === 'low' ? <Mark label={t('log.review.checkPortion')} /> : null}
                      </View>
                      {state === 'matched' || state === 'confirmed' ? (
                        scan?.matchedName && scan.matchedName !== item.displayName ? (
                          <AppText variant="caption" tone="muted">
                            {t('log.review.matchedAs', { name: scan.matchedName })}
                          </AppText>
                        ) : null
                      ) : state === 'estimate' ? (
                        <AppText variant="caption" tone="muted">
                          {t('log.review.estimateNote')}
                        </AppText>
                      ) : state === 'needs_match' ? (
                        <AppText variant="caption" tone="warning">
                          {t('log.review.needsMatchNote')}
                        </AppText>
                      ) : null}
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
                      announceValue={(value) => t('log.review.gramsAnnounce', { value })}
                      decreaseDisabled={item.grams <= GRAMS_RANGE.min}
                      invalid={problem !== null}
                    />
                    {nutrients ? (
                      <AppText variant="bodySm" tone="muted" style={styles.itemKcal}>
                        <AppText variant="numeral">{formatNumber(locale, nutrients.kcal ?? 0)}</AppText> kcal
                      </AppText>
                    ) : (
                      <AppText variant="bodySm" tone="muted" style={styles.itemKcal}>
                        {t('log.review.noNumbers')}
                      </AppText>
                    )}
                  </View>
                  {warnings.includes('item_weight_extreme') ? <Flag label={t('log.review.weightHigh')} /> : null}
                  {warnings.includes('item_weight_tiny') ? <Flag label={t('log.review.weightLow')} /> : null}
                  {problem && touched[item.key] ? <FieldMessage message={gramsMessage(t, locale, problem)} /> : null}
                </View>
              );
            })}
          </View>
        )}

        <Button label={t('log.review.addMore')} variant="secondary" icon="plus" onPress={onAddItem} />
      </View>

      <RecipeMethodSheet food={method} onClose={() => setMethod(null)} />
      <ConfirmSheet
        visible={confirmExit !== null}
        title={t('log.review.discardTitle')}
        body={t('log.review.discardBody')}
        confirmLabel={t('log.review.discard')}
        cancelLabel={t('log.review.keep')}
        closeLabel={t('common.close')}
        onCancel={() => setConfirmExit(null)}
        onConfirm={() => {
          const exit = confirmExit ?? 'back';
          setConfirmExit(null);
          void leave(exit);
        }}
      />
    </ScreenFrame>
  );
}

/** A tag that names the item's state in words: the colour only helps. */
function StateTag({ state, label }: { state: 'matched' | 'estimate' | 'confirmed' | 'needs_match'; label: string }) {
  const { colors } = useTheme();
  const tone = state === 'estimate' ? { bg: colors.aiSoft, fg: 'ai' as const } : state === 'confirmed' ? { bg: colors.surfaceRaised, fg: 'green' as const } : state === 'needs_match' ? { bg: colors.warningSoft, fg: 'warning' as const } : { bg: colors.surfaceRaised, fg: 'default' as const };
  return (
    <View style={[styles.tag, { backgroundColor: tone.bg }]}>
      {state === 'estimate' ? <Icon name="sparkle" size={12} color={colors.ai} /> : null}
      {state === 'confirmed' ? <Icon name="check" size={12} color={colors.green} /> : null}
      {state === 'needs_match' ? <Icon name="alert" size={12} color={colors.warning} /> : null}
      <AppText variant="caption" tone={tone.fg}>
        {label}
      </AppText>
    </View>
  );
}

function Tag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: colors.surfaceRaised }]}>
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

/** "Check portion" / "Check food": the model was not sure. Amber with an icon and text. */
function Mark({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: colors.warningSoft }]}>
      <Icon name="alert" size={12} color={colors.warning} />
      <AppText variant="caption" tone="warning">
        {label}
      </AppText>
    </View>
  );
}

function Flag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.flag}>
      <Icon name="alert" size={16} color={colors.warning} />
      <AppText variant="bodySm" tone="warning" style={styles.flagText}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s1, paddingBottom: spacing.s6, gap: spacing.s4 },
  subtitle: { paddingHorizontal: spacing.s2 },
  retake: { minHeight: layout.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.s2, paddingHorizontal: spacing.s4, borderRadius: radius.pill, borderWidth: 1.5 },
  photoWrap: { borderRadius: radius.lg, overflow: 'hidden' },
  photo: { width: '100%', height: 168 },
  photoChip: { position: 'absolute', left: spacing.s3, bottom: spacing.s3, flexDirection: 'row', alignItems: 'center', gap: spacing.s2, paddingHorizontal: spacing.s3, paddingVertical: spacing.s1, borderRadius: radius.pill },
  warning: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, padding: spacing.s3, borderRadius: radius.md },
  warningText: { flex: 1 },
  items: { gap: spacing.s2 },
  item: { borderRadius: radius.lg, padding: spacing.s3, paddingLeft: spacing.s4, gap: spacing.s2 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.s2 },
  itemName: { flex: 1, paddingTop: spacing.s2, gap: spacing.s1 },
  nameButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, minHeight: 32, alignSelf: 'flex-start' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s1 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: spacing.s1, paddingHorizontal: spacing.s2, paddingVertical: 2, borderRadius: radius.pill },
  itemControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s2 },
  itemKcal: { textAlign: 'right', flexShrink: 1 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  flagText: { flex: 1 },
  totals: { gap: 2 },
  center: { textAlign: 'center' },
});
