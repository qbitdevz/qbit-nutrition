import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DEFAULT_MINIMUM_DAILY_KCAL, TARGET_SOURCES } from '@/core/nutrition';
import { formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, InsightLine, TextField, spacing } from '@/ui';
import { parseWhole } from '../forms/numbers';
import { useServices } from '../startup/AppProvider';
import { MINIMUM_KCAL_RANGE, writeMinimumKcal } from './minimum';

interface MinimumEnergyEditorProps {
  /** The person's own minimum, or null when the default applies. */
  value: number | null;
  /** Called after the new value (or null, the default) was stored. */
  onSaved: (kcal: number | null) => void;
}

/**
 * The minimum daily energy below which no targets are suggested (S3, FR-14): the default with the
 * source it comes from, the person's own value, and the way to change or reset it. The same editor
 * is in Settings and inside the "below the minimum" explanation, so it can be fixed where it is met.
 */
export function MinimumEnergyEditor({ value, onSaved }: MinimumEnergyEditorProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { repos } = useServices();
  const [text, setText] = useState(value === null ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const range = { min: formatNumber(locale, MINIMUM_KCAL_RANGE.min), max: formatNumber(locale, MINIMUM_KCAL_RANGE.max) };
  const source = TARGET_SOURCES['minimumKcal.female'].source;

  const validate = (): number | null => {
    const parsed = parseWhole(text);
    if (parsed.kind !== 'number' || parsed.value < MINIMUM_KCAL_RANGE.min || parsed.value > MINIMUM_KCAL_RANGE.max) {
      setError(t('minimum.error', range));
      return null;
    }
    setError(null);
    return parsed.value;
  };

  const store = async (kcal: number | null) => {
    setBusy(true);
    setFailed(false);
    try {
      await writeMinimumKcal(repos.settings, kcal);
      if (kcal === null) setText('');
      setError(null);
      onSaved(kcal);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppText tone="muted">{t('minimum.intro')}</AppText>
      <AppText variant="bodyMd">
        {t('minimum.default', { female: formatNumber(locale, DEFAULT_MINIMUM_DAILY_KCAL.female), male: formatNumber(locale, DEFAULT_MINIMUM_DAILY_KCAL.male) })}
      </AppText>
      {source ? (
        <AppText variant="bodySm" tone="muted">
          {t('minimum.sourceLabel')}: {source.title}. {source.publisher}.
        </AppText>
      ) : null}
      <AppText variant="bodySm" tone="muted">
        {t('minimum.unconfirmed')}
      </AppText>
      {value !== null ? <AppText variant="bodyMd">{t('minimum.current', { kcal: formatNumber(locale, value) })}</AppText> : null}

      <TextField
        label={t('minimum.field')}
        value={text}
        onChangeText={setText}
        onBlur={() => (text.trim() === '' ? setError(null) : validate())}
        error={error}
        keyboardType="number-pad"
        maxLength={4}
        suffix="kcal"
        returnKeyType="done"
      />
      <InsightLine text={t('minimum.warning')} icon="alert" />
      {failed ? <AppText tone="warning">{t('minimum.saveError')}</AppText> : null}
      <Button
        label={t('minimum.save')}
        onPress={() => {
          const kcal = validate();
          if (kcal !== null) void store(kcal);
        }}
        disabled={busy}
      />
      {value !== null ? <Button label={t('minimum.reset')} variant="secondary" onPress={() => void store(null)} disabled={busy} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.s3 },
});
