import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, spacing } from '@/ui';

const POINTS = ['estimates', 'targets', 'professional', 'allergens'] as const;

/**
 * The health notice, verbatim from docs/12 section 2 (English and Spanish live in `legal.disclaimer`
 * of the i18n files). Shown at first launch and under Settings → About. Edit the text only together
 * with `DISCLAIMER_VERSION`.
 */
export function Disclaimer({ headingVariant = 'titleLg' }: { headingVariant?: 'titleLg' | 'titleSm' }) {
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <AppText variant={headingVariant} accessibilityRole="header">
        {t('legal.disclaimer.title')}
      </AppText>
      <AppText>{t('legal.disclaimer.intro')}</AppText>
      {POINTS.map((point) => (
        <View key={point} style={styles.point}>
          <AppText style={styles.bullet} aria-hidden>
            •
          </AppText>
          <AppText style={styles.pointText}>
            <AppText style={styles.lead}>{t(`legal.disclaimer.${point}.lead`)}</AppText> {t(`legal.disclaimer.${point}.body`)}
          </AppText>
        </View>
      ))}
      <AppText>{t('legal.disclaimer.closing')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.s3 },
  point: { flexDirection: 'row', gap: spacing.s2 },
  bullet: { width: 12 },
  pointText: { flex: 1 },
  lead: { fontFamily: 'Figtree_700Bold' },
});
