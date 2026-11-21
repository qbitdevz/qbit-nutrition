import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ACTIVITY_FACTORS, type ActivityLevel } from '@/core/nutrition';
import { AppText, ChoiceChips, FieldMessage, OptionList, TextField, spacing } from '@/ui';
import type { FieldError } from '../forms/numbers';
import type { ProfileForm } from './profileForm';
import type { UnitSystem } from './units';

const ACTIVITY_LEVELS = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];

/**
 * The profile fields (FR-03, FR-04): units, sex, birth date, height, weight, activity and the
 * pregnancy or breastfeeding indication. Every field is optional. Metric or imperial entry; the
 * stored form is always metric (`validateProfile`). Errors show when a field is left and on submit,
 * and the typed text is never cleared.
 */
export function ProfileFields({ form }: { form: ProfileForm }) {
  const { t } = useTranslation();
  const { values, errors, set, setUnit, blur } = form;
  const imperial = values.unit === 'imperial';
  const message = (error?: FieldError) => (error ? t(error.key, error.params ?? {}) : null);

  // The three birth-date fields are checked together: leaving "Day" while "Month" is still empty is not yet a mistake.
  const blurBirth = (last: boolean) => {
    if (last || (values.day && values.month && values.year)) blur('birth');
  };
  const birthError = message(errors.birth);

  return (
    <View style={styles.form}>
      <ChoiceChips<UnitSystem>
        label={t('profile.units.label')}
        title
        options={[
          { value: 'metric', label: t('profile.units.metric') },
          { value: 'imperial', label: t('profile.units.imperial') },
        ]}
        value={values.unit}
        onChange={(value) => value && setUnit(value)}
      />

      <ChoiceChips
        label={t('profile.sex.label')}
        title
        clearable
        options={[
          { value: 'female', label: t('profile.sex.female') },
          { value: 'male', label: t('profile.sex.male') },
        ]}
        value={values.sex}
        onChange={(value) => set('sex', value)}
      />

      <View style={styles.group}>
        <AppText variant="bodyMd" tone="muted" style={styles.groupTitle}>
          {t('profile.birth.label')}
        </AppText>
        <View style={styles.row}>
          <View style={styles.narrow}>
            <TextField label={t('profile.birth.day')} value={values.day} onChangeText={(v) => set('day', v)} onBlur={() => blurBirth(false)} invalid={Boolean(birthError)} keyboardType="number-pad" maxLength={2} placeholder="DD" />
          </View>
          <View style={styles.narrow}>
            <TextField label={t('profile.birth.month')} value={values.month} onChangeText={(v) => set('month', v)} onBlur={() => blurBirth(false)} invalid={Boolean(birthError)} keyboardType="number-pad" maxLength={2} placeholder="MM" />
          </View>
          <View style={styles.wide}>
            <TextField label={t('profile.birth.year')} value={values.year} onChangeText={(v) => set('year', v)} onBlur={() => blurBirth(true)} invalid={Boolean(birthError)} keyboardType="number-pad" maxLength={4} placeholder="YYYY" />
          </View>
        </View>
        {birthError ? <FieldMessage message={birthError} /> : null}
      </View>

      {imperial ? (
        <View style={styles.group}>
          <AppText variant="bodyMd" tone="muted" style={styles.groupTitle}>
            {t('profile.height.group')}
          </AppText>
          <View style={styles.row}>
            <View style={styles.half}>
              <TextField label={t('profile.height.ft')} value={values.heightFt} onChangeText={(v) => set('heightFt', v)} onBlur={() => blur('height')} invalid={Boolean(errors.height)} keyboardType="number-pad" maxLength={1} suffix="ft" />
            </View>
            <View style={styles.half}>
              <TextField label={t('profile.height.in')} value={values.heightIn} onChangeText={(v) => set('heightIn', v)} onBlur={() => blur('height')} invalid={Boolean(errors.height)} keyboardType="number-pad" maxLength={2} suffix="in" />
            </View>
          </View>
          {errors.height ? <FieldMessage message={message(errors.height) ?? ''} /> : null}
        </View>
      ) : (
        <TextField label={t('profile.height.cm')} value={values.heightCm} onChangeText={(v) => set('heightCm', v)} onBlur={() => blur('height')} error={message(errors.height)} keyboardType="decimal-pad" maxLength={5} suffix="cm" />
      )}

      <TextField
        label={imperial ? t('profile.weight.lb') : t('profile.weight.kg')}
        value={values.weight}
        onChangeText={(v) => set('weight', v)}
        onBlur={() => blur('weight')}
        error={message(errors.weight)}
        keyboardType="decimal-pad"
        maxLength={6}
        suffix={imperial ? 'lb' : 'kg'}
      />

      <OptionList<ActivityLevel>
        label={t('profile.activity.label')}
        title
        clearable
        options={ACTIVITY_LEVELS.map((level) => ({ value: level, label: t(`profile.activity.${level}`), hint: t(`profile.activity.${level}Hint`) }))}
        value={values.activity}
        onChange={(value) => set('activity', value)}
      />

      <View style={styles.group}>
        <ChoiceChips
          label={t('profile.condition.label')}
          title
          clearable
          options={[
            { value: 'none', label: t('profile.condition.none') },
            { value: 'pregnant', label: t('profile.condition.pregnant') },
            { value: 'breastfeeding', label: t('profile.condition.breastfeeding') },
          ]}
          value={values.condition}
          onChange={(value) => set('condition', value)}
        />
        <AppText variant="bodySm" tone="muted" style={styles.groupTitle}>
          {t('profile.condition.hint')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.s5 },
  group: { gap: spacing.s2 },
  groupTitle: { paddingLeft: spacing.s2 },
  row: { flexDirection: 'row', gap: spacing.s2 },
  narrow: { flex: 1 },
  wide: { flex: 1.5 },
  half: { flex: 1 },
});
