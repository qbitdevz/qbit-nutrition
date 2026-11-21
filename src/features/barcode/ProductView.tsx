import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { BarcodeProductRecord } from '@/data';
import { formatDecimal, formatInstantDate, formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, Icon, radius, spacing, useTheme } from '@/ui';

interface ProductViewProps {
  product: BarcodeProductRecord;
  /** The saved product is older than the refresh age and could not be refreshed. */
  stale: boolean;
  locale: Locale;
  onChoose: () => void;
  onScanAnother: () => void;
}

/** A complete product: what Open Food Facts says about it per 100 g, where that comes from, and the way on to choosing an amount. */
export function ProductView({ product, stale, locale, onChoose, onScanAnother }: ProductViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const per100g = product.per100g;
  return (
    <View style={styles.root} testID="barcode-product">
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.head}>
          <Icon name="check" color={colors.green} />
          <AppText variant="bodySm" tone="muted">
            {t('barcode.result.title')}
          </AppText>
        </View>
        <AppText variant="titleSm" accessibilityRole="header" testID="barcode-product-name">
          {product.name}
        </AppText>
        {product.brand ? (
          <AppText variant="bodyMd" tone="muted">
            {t('barcode.result.brand', { brand: product.brand })}
          </AppText>
        ) : null}
        <AppText variant="bodyMd">
          {t('log.search.per100', {
            kcal: formatNumber(locale, per100g.kcal ?? 0),
            protein: formatDecimal(locale, per100g.protein ?? 0, 1),
            carbs: formatDecimal(locale, per100g.carbs ?? 0, 1),
            fat: formatDecimal(locale, per100g.fat ?? 0, 1),
          })}
        </AppText>
        {product.servingG !== null ? (
          <AppText variant="bodyMd" tone="muted">
            {t('barcode.result.serving', { grams: formatDecimal(locale, product.servingG, 1) })}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="muted">
          {product.barcode}
        </AppText>
      </View>

      {stale ? (
        <AppText variant="bodySm" tone="warning" testID="barcode-stale">
          {t('barcode.result.stale', { date: formatInstantDate(locale, new Date(product.fetchedAt)) })}
        </AppText>
      ) : null}
      <AppText variant="bodySm" tone="muted" testID="barcode-attribution">
        {t('barcode.result.source')}
      </AppText>

      <Button label={t('barcode.result.choose')} icon="plus" onPress={onChoose} testID="barcode-choose" />
      <Button label={t('barcode.result.another')} variant="secondary" icon="barcode" onPress={onScanAnother} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.s3 },
  card: { borderRadius: radius.lg, padding: spacing.s4, gap: spacing.s1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
});
