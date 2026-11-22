import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Locale } from '@/i18n/locale';
import { AppText, ScreenFrame, SettingsRow, TopBar, layout, spacing } from '@/ui';
import { groupPresets, noteIn, type Preset } from './presets';

interface ProviderPresetsScreenProps {
  onChoose: (presetId: string) => void;
  onBack?: () => void;
}

/**
 * Flow E, step 2: pick a preset or "Custom". Nothing is preselected. Options with a zero-cost path
 * come first and the list says so plainly; each row carries the preset's cost note (FR-64), and the
 * full cost and data-use notes follow on the form.
 */
export function ProviderPresetsScreen({ onChoose, onBack }: ProviderPresetsScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { zeroCost, paid, custom } = groupPresets();

  const rows = (presets: Preset[]) =>
    presets.map((preset) => (
      <SettingsRow key={preset.id} icon="sparkle" title={preset.name} detail={noteIn(preset.cost, locale)} onPress={() => onChoose(preset.id)} />
    ));

  return (
    <ScreenFrame header={<TopBar title={t('providers.presets.title')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        <AppText tone="muted">{t('providers.presets.intro')}</AppText>

        <Section title={t('providers.presets.free')} note={t('providers.presets.freeNote')}>
          {rows(zeroCost)}
        </Section>
        <Section title={t('providers.presets.paid')} note={t('providers.presets.paidNote')}>
          {rows(paid)}
        </Section>
        <Section title={t('providers.presets.custom')}>
          <SettingsRow icon="settings" title={custom.name} detail={noteIn(custom.cost, locale)} onPress={() => onChoose(custom.id)} />
        </Section>

        <AppText variant="bodySm" tone="muted" style={styles.legal}>
          {t('providers.notAffiliated')}
        </AppText>
      </View>
    </ScreenFrame>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {note ? (
        <AppText variant="bodySm" tone="muted">
          {note}
        </AppText>
      ) : null}
      <View style={styles.rows}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s6 },
  section: { gap: spacing.s2 },
  rows: { gap: spacing.s2 },
  legal: { paddingHorizontal: spacing.s2 },
});
