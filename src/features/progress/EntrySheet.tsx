import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { isDataError } from '@/data';
import { formatDecimal, formatLongDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, BottomSheet, Button, FieldMessage, TextField, spacing } from '@/ui';
import { useServices } from '../startup/AppProvider';
import type { UnitSystem } from '../profile/units';
import { DateStepper } from './DateStepper';
import { displayUnit, fromMetric, parseEntry, type MeasureKind, type SeriesPoint } from './series';

export type EntryOutcome =
  | { type: 'saved'; kind: MeasureKind; displayValue: number }
  | { type: 'deleted'; kind: MeasureKind; point: SeriesPoint };

interface EntrySheetProps {
  visible: boolean;
  kind: MeasureKind;
  units: UnitSystem;
  /** Latest date that can be logged. */
  today: string;
  /** The entry being edited; null logs a new one. */
  editing: SeriesPoint | null;
  /** Every entry of this kind (metric), to say what a save would replace and what the last one was. */
  points: readonly SeriesPoint[];
  onClose: () => void;
  onDone: (outcome: EntryOutcome) => void;
}

/**
 * Log, edit or delete one weight or body measurement. The value is typed in the profile's units and
 * stored in metric; the day is picked with a stepper. A mistake is reported next to the field and the
 * typed text stays. Deleting asks first, inside the same sheet, and the caller offers Undo.
 */
export function EntrySheet({ visible, kind, units, today, editing, points, onClose, onDone }: EntrySheetProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { repos } = useServices();
  const unit = displayUnit(kind, units);
  const kindName = t(`progress.kind.${kind}`);

  const [date, setDate] = useState(today);
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [problem, setProblem] = useState<'save' | 'conflict' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Every opening starts from the entry (or from today and an empty field). Adjusting state while rendering,
  // guarded by `opened`, resets the form in the same pass instead of one frame later.
  const [opened, setOpened] = useState(false);
  if (visible !== opened) {
    setOpened(visible);
    if (visible) {
      setDate(editing?.date ?? today);
      setText(editing ? String(fromMetric(kind, editing.value, units)) : '');
      setFieldError(null);
      setProblem(null);
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  const number = (value: number) => formatDecimal(locale, fromMetric(kind, value, units), 1);
  const last = points[points.length - 1];
  const sameDay = points.find((p) => p.date === date && p.id !== editing?.id);

  const save = async () => {
    const parsed = parseEntry(kind, text, units);
    if (!parsed.ok) {
      setFieldError(t(parsed.error.key, { ...parsed.error.params, kind: kindName }));
      return;
    }
    setFieldError(null);
    setProblem(null);
    setBusy(true);
    try {
      if (editing) await repos.measurements.update(editing.id, { measuredOn: date, value: parsed.value });
      else await repos.measurements.record({ measuredOn: date, kind, value: parsed.value });
      onDone({ type: 'saved', kind, displayValue: fromMetric(kind, parsed.value, units) });
    } catch (error) {
      setProblem(isDataError(error, 'measurement_conflict') ? 'conflict' : 'save');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    setProblem(null);
    try {
      await repos.measurements.delete(editing.id);
      onDone({ type: 'deleted', kind, point: editing });
    } catch {
      setProblem('delete');
      setConfirmingDelete(false);
      setBusy(false);
    }
  };

  const title = editing ? t('progress.entry.editTitle', { kind: t(`progress.kindLower.${kind}`) }) : t('progress.entry.logTitle', { kind: t(`progress.kindLower.${kind}`) });

  return (
    <BottomSheet visible={visible} onClose={onClose} title={confirmingDelete ? t('progress.entry.deleteTitle') : title} closeLabel={t('common.close')}>
      {confirmingDelete && editing ? (
        <>
          <AppText tone="muted">
            {t('progress.entry.deleteBody', { date: formatLongDate(locale, editing.date), value: number(editing.value), unit })}
          </AppText>
          <View style={styles.actions}>
            <Button label={t('progress.entry.keep')} onPress={() => setConfirmingDelete(false)} />
            <Button label={t('progress.entry.delete')} variant="secondary" disabled={busy} onPress={() => void remove()} testID="confirm-delete" />
          </View>
        </>
      ) : (
        <>
          <DateStepper value={date} max={today} onChange={setDate} />
          <TextField
            label={kindName}
            value={text}
            onChangeText={(value) => {
              setText(value);
              if (fieldError) setFieldError(null);
            }}
            onSubmitEditing={() => void save()}
            error={fieldError}
            hint={!editing && last ? t('progress.entry.last', { value: number(last.value), unit, date: formatLongDate(locale, last.date) }) : undefined}
            suffix={unit}
            keyboardType="decimal-pad"
            returnKeyType="done"
            autoFocus
            testID="entry-value"
          />
          {sameDay ? (
            <AppText variant="bodySm" tone="muted">
              {t('progress.entry.replaces', { value: number(sameDay.value), unit })}
            </AppText>
          ) : null}
          {problem ? <FieldMessage message={t(problem === 'conflict' ? 'progress.entry.conflict' : problem === 'delete' ? 'progress.entry.deleteError' : 'progress.entry.saveError')} /> : null}
          <View style={styles.actions}>
            <Button label={t('progress.entry.save')} disabled={busy} onPress={() => void save()} testID="entry-save" />
            {editing ? <Button label={t('progress.entry.delete')} variant="secondary" onPress={() => setConfirmingDelete(true)} testID="entry-delete" /> : null}
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: spacing.s2 },
});
