import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { formatDecimal, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, EmptyState, ErrorState, Icon, PressableScale, ScreenFooter, ScreenFrame, TextField, TopBar, layout, pressScale, radius, spacing, useTheme } from '@/ui';
import { useServices } from '../startup/AppProvider';
import { useMealDraft } from './draft';
import { loadFoodView, loadUsage, refKey, rowFromView, searchFoods, type FoodRow, type UsageLists } from './foods';
import { PortionSheet } from './PortionSheet';

interface FoodSearchScreenProps {
  /** An item was added to the meal: the route moves on to the review screen. */
  onAdded: () => void;
  /** Opens the review screen with what is already collected. */
  onOpenReview: () => void;
  /** "Create custom food", with what was typed. */
  onCreateCustom: (name: string) => void;
  onBack?: () => void;
}

const NO_USAGE: UsageLists = { favorites: [], recents: [], lastGrams: new Map() };

type Results = { status: 'idle' } | { status: 'error' } | { status: 'ready'; query: string; rows: FoodRow[] };

/**
 * Food search (S8, FR-30, FR-31, flow D steps 2 and 3): local and instant, in the app language with
 * English as fallback, no network. With nothing typed it shows the person's favorites and recents;
 * with a query, favorites and recents come before other matches. A food opens the portion sheet.
 */
export function FoodSearchScreen({ onAdded, onOpenReview, onCreateCustom, onBack }: FoodSearchScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const services = useServices();
  const draft = useMealDraft();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>({ status: 'idle' });
  const [usage, setUsage] = useState<UsageLists>(NO_USAGE);
  const [selected, setSelected] = useState<FoodRow | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refreshUsage = useCallback(() => {
    loadUsage(services, locale).then(setUsage, () => setUsage(NO_USAGE));
  }, [services, locale]);
  useEffect(refreshUsage, [refreshUsage]);

  // Each keystroke searches again; an answer for text the person has already changed is dropped.
  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed === '') return;
    let active = true;
    searchFoods(services, trimmed, locale).then(
      (rows) => active && setResults({ status: 'ready', query: trimmed, rows }),
      () => active && setResults({ status: 'error' }),
    );
    return () => {
      active = false;
    };
  }, [services, trimmed, locale, attempt]);

  // A custom food was just created: portion it straight away.
  const { pending, setPending } = draft;
  useEffect(() => {
    if (!pending) return;
    let active = true;
    loadFoodView(services, pending, locale).then((view) => {
      if (!active) return;
      setPending(null);
      if (view) setSelected(rowFromView(view));
    });
    return () => {
      active = false;
    };
  }, [pending, services, locale, setPending]);

  const favoriteKeys = useMemo(() => new Set(usage.favorites.map((row) => refKey(row.ref))), [usage.favorites]);
  const recentKeys = useMemo(() => new Set(usage.recents.map((row) => refKey(row.ref))), [usage.recents]);

  const rows = useMemo(() => {
    if (results.status !== 'ready' || results.query !== trimmed) return null;
    const rank = (row: FoodRow) => (favoriteKeys.has(refKey(row.ref)) ? 0 : recentKeys.has(refKey(row.ref)) ? 1 : 2);
    return [...results.rows].sort((a, b) => rank(a) - rank(b));
  }, [results, trimmed, favoriteKeys, recentKeys]);

  const toggleFavorite = async (row: FoodRow) => {
    try {
      await services.repos.foodUsage.setFavorite(row.ref, !favoriteKeys.has(refKey(row.ref)));
    } finally {
      refreshUsage();
    }
  };

  const showUsage = trimmed === '';
  const hasUsage = usage.favorites.length > 0 || usage.recents.length > 0;

  return (
    <ScreenFrame
      header={<TopBar title={t('log.search.title')} onBack={onBack} backLabel={t('common.back')} />}
      footer={
        draft.items.length > 0 ? (
          <ScreenFooter>
            <Button label={t('log.search.review', { count: draft.items.length })} onPress={onOpenReview} />
          </ScreenFooter>
        ) : undefined
      }>
      <View style={styles.body}>
        <TextField
          label={t('log.search.label')}
          labelHidden
          value={query}
          onChangeText={setQuery}
          placeholder={t('log.search.label')}
          hint={t('log.search.hint')}
          returnKeyType="search"
          autoFocus
        />

        {showUsage && !hasUsage ? <EmptyState icon="search" title={t('log.search.emptyTitle')} body={t('log.search.empty')} /> : null}
        {showUsage && usage.favorites.length > 0 ? (
          <FoodSection title={t('log.search.favorites')} rows={usage.favorites} favoriteKeys={favoriteKeys} onOpen={setSelected} onFavorite={toggleFavorite} locale={locale} />
        ) : null}
        {showUsage && usage.recents.length > 0 ? (
          <FoodSection title={t('log.search.recents')} rows={usage.recents} favoriteKeys={favoriteKeys} onOpen={setSelected} onFavorite={toggleFavorite} locale={locale} />
        ) : null}

        {!showUsage && results.status === 'error' ? (
          <ErrorState title={t('log.search.title')} message={t('log.search.error')}>
            <Button label={t('common.retry')} icon="retake" onPress={() => setAttempt((n) => n + 1)} />
          </ErrorState>
        ) : null}
        {!showUsage && rows && rows.length === 0 ? (
          <EmptyState icon="search" title={t('log.search.noResults', { query: trimmed })} body={t('log.search.noResultsBody')}>
            <Button label={t('log.search.create')} icon="plus" onPress={() => onCreateCustom(trimmed)} />
          </EmptyState>
        ) : null}
        {!showUsage && rows && rows.length > 0 ? (
          <>
            <FoodSection title={t('log.search.results')} rows={rows} favoriteKeys={favoriteKeys} onOpen={setSelected} onFavorite={toggleFavorite} locale={locale} />
            <Button label={t('log.search.create')} variant="ghost" icon="plus" block={false} onPress={() => onCreateCustom(trimmed)} />
          </>
        ) : null}
      </View>

      <PortionSheet
        food={selected}
        lastGrams={selected ? usage.lastGrams.get(refKey(selected.ref)) : undefined}
        onClose={() => setSelected(null)}
        onAdd={(item) => {
          draft.addItem(item);
          onAdded();
        }}
      />
    </ScreenFrame>
  );
}

interface FoodSectionProps {
  title: string;
  rows: FoodRow[];
  favoriteKeys: ReadonlySet<string>;
  locale: Locale;
  onOpen: (row: FoodRow) => void;
  onFavorite: (row: FoodRow) => void;
}

function FoodSection({ title, rows, favoriteKeys, locale, onOpen, onFavorite }: FoodSectionProps) {
  return (
    <View style={styles.section}>
      <AppText variant="heading" accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </AppText>
      <View style={styles.list}>
        {rows.map((row) => (
          <FoodResultRow key={refKey(row.ref)} row={row} favorite={favoriteKeys.has(refKey(row.ref))} locale={locale} onOpen={() => onOpen(row)} onFavorite={() => onFavorite(row)} />
        ))}
      </View>
    </View>
  );
}

interface FoodResultRowProps {
  row: FoodRow;
  favorite: boolean;
  locale: Locale;
  onOpen: () => void;
  onFavorite: () => void;
}

function FoodResultRow({ row, favorite, locale, onOpen, onFavorite }: FoodResultRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('log.search.resultLabel', { name: row.name, kcal: formatNumber(locale, row.kcal100g) })}
        onPress={onOpen}
        scale={pressScale.row}
        pressedStyle={{ backgroundColor: colors.surfaceHigh }}
        style={styles.main}>
        <View style={styles.text}>
          <AppText variant="itemName" numberOfLines={3}>
            {row.name}
          </AppText>
          <AppText variant="bodySm" tone="muted">
            {t('log.search.per100', {
              kcal: formatNumber(locale, row.kcal100g),
              protein: formatDecimal(locale, row.protein100g, 1),
              carbs: formatDecimal(locale, row.carbs100g, 1),
              fat: formatDecimal(locale, row.fat100g, 1),
            })}
          </AppText>
          {row.custom ? (
            <View style={[styles.tag, { backgroundColor: colors.surfaceRaised }]}>
              <AppText variant="caption">{t('log.search.custom')}</AppText>
            </View>
          ) : null}
        </View>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={favorite ? t('log.search.favoriteRemove', { name: row.name }) : t('log.search.favoriteAdd', { name: row.name })}
        accessibilityState={{ selected: favorite }}
        onPress={onFavorite}
        scale={pressScale.icon}
        style={styles.star}>
        <Icon name="star" filled={favorite} color={favorite ? colors.carbs : colors.textMuted} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s8, gap: spacing.s4 },
  section: { gap: spacing.s2 },
  sectionTitle: { paddingHorizontal: spacing.s2 },
  list: { gap: spacing.s2 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, minHeight: 72 },
  main: { flex: 1, minHeight: 72, justifyContent: 'center', paddingVertical: spacing.s3, paddingLeft: spacing.s4, paddingRight: spacing.s2, borderRadius: radius.lg },
  text: { gap: 2, alignItems: 'flex-start' },
  tag: { marginTop: spacing.s1, paddingHorizontal: spacing.s2, paddingVertical: 2, borderRadius: radius.pill },
  star: { width: layout.touchTarget, height: layout.touchTarget, marginRight: spacing.s1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
});
