import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { AppText, PressableScale, ScreenFrame, TopBar, layout, radius, spacing, useTheme } from '@/ui';
import { licenseReport, type LicenseEntry, type LicenseReport } from './licenses';

interface LicensesScreenProps {
  onBack?: () => void;
  /** The report to list; the one generated at build time unless a test gives its own. */
  report?: LicenseReport;
}

/**
 * Settings → About → Open-source licenses (S8, docs/12 section 7): every package the app is built with, its license, and on
 * request the license text. The list comes from `catalog-build/licenses.json`, generated from the installed dependencies.
 */
export function LicensesScreen({ onBack, report = licenseReport }: LicensesScreenProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ScreenFrame scroll={false} header={<TopBar title={t('about.licensesRow')} onBack={onBack} backLabel={t('common.back')} />}>
      <FlatList
        data={report.packages}
        keyExtractor={(item) => `${item.name}@${item.version}`}
        contentContainerStyle={styles.list}
        initialNumToRender={12}
        ListHeaderComponent={
          <View style={styles.header} testID="licenses-header">
            <AppText>{t('legal.licenses.intro')}</AppText>
            <AppText>{t('legal.licenses.own')}</AppText>
            <AppText>{t('legal.licenses.fonts')}</AppText>
            <AppText variant="bodySm" tone="muted">
              {report.packages.length > 0 ? t('legal.licenses.count', { count: report.packages.length }) : t('legal.licenses.unavailable')}
            </AppText>
          </View>
        }
        renderItem={({ item }) => {
          const key = `${item.name}@${item.version}`;
          return <Row item={item} expanded={open === key} onToggle={() => setOpen(open === key ? null : key)} />;
        }}
      />
    </ScreenFrame>
  );
}

function Row({ item, expanded, onToggle }: { item: LicenseEntry; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('legal.licenses.item', { name: item.name, version: item.version, license: item.license })}
        accessibilityHint={expanded ? t('legal.licenses.hide') : t('legal.licenses.show')}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.rowButton}>
        <View style={styles.rowText}>
          <AppText variant="itemName" aria-hidden>
            {item.name}
          </AppText>
          <AppText variant="bodySm" tone="muted" aria-hidden>
            {item.version} · {item.license}
          </AppText>
        </View>
        <AppText variant="bodySm" tone="primary" aria-hidden>
          {expanded ? t('legal.licenses.hide') : t('legal.licenses.show')}
        </AppText>
      </PressableScale>
      {expanded ? (
        <AppText variant="bodySm" selectable style={styles.text} testID={`license-text-${item.name}`}>
          {item.text ?? t('legal.licenses.noText')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s2 },
  header: { gap: spacing.s3, paddingBottom: spacing.s3 },
  row: { borderRadius: radius.md, overflow: 'hidden' },
  rowButton: { minHeight: layout.touchTarget + 8, flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingHorizontal: spacing.s4, paddingVertical: spacing.s2 },
  rowText: { flex: 1 },
  text: { paddingHorizontal: spacing.s4, paddingBottom: spacing.s4 },
});
