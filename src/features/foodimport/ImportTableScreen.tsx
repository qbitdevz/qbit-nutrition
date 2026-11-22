import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ImportedCollection } from '@/data';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, ErrorState, Icon, ScreenFooter, ScreenFrame, TopBar, layout, radius, spacing, useTheme } from '@/ui';
import { useDataPlatform } from '../data/DataPlatformContext';
import { useServices } from '../startup/AppProvider';
import { suggestMapping } from './headers';
import { commitImport, defaultTableName, pickTableFile } from './importService';
import { MappingView } from './MappingView';
import { buildPreviewAsync, mappingProblems, type ImportMapping, type ImportPreview } from './mapping';
import { PreviewView } from './PreviewView';
import { detectPreset } from './presets';
import { READ_LIMITS, type CancelToken, type ImportReadErrorCode, type TableFile } from './readFile';

interface ImportTableScreenProps {
  /** Leaves the flow (back from the first step, or "Done"). */
  onClose: () => void;
  /** A table was imported: the list behind this screen reads again. */
  onImported?: () => void;
}

type Step = 'start' | 'reading' | 'refused' | 'map' | 'checking' | 'preview' | 'saving' | 'done' | 'failed';

const MEGABYTE = 1024 * 1024;

/**
 * Adding a table (S1, S2, S4, S6). One flow, nothing written until the last step:
 *   start (the license notice, the formats, Choose a file)
 *     -> reading (progress, Cancel) -> [refused: why, choose another]
 *     -> map (the columns, units, basis and the rules, all changeable; a recognised table arrives filled in)
 *     -> checking (progress, Cancel) -> preview (counts, rows left out, warnings, a sample, the table's name)
 *     -> saving -> done (counts, what was left out) | failed (nothing was written, the work is kept).
 * Back goes one step; the file and the choices are kept while the person moves between map and preview. No step makes a network request.
 */
export function ImportTableScreen({ onClose, onImported }: ImportTableScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const platform = useDataPlatform();
  const { repos } = useServices();

  const [step, setStep] = useState<Step>('start');
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState<'cancelled' | null>(null);
  const [refused, setRefused] = useState<{ code: ImportReadErrorCode; limit?: number } | null>(null);
  const [file, setFile] = useState<TableFile | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [presetName, setPresetName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [name, setName] = useState('');
  const [nameProblem, setNameProblem] = useState(false);
  const [done, setDone] = useState<{ table: ImportedCollection; skipped: number } | null>(null);
  const cancel = useRef<CancelToken>({ cancelled: false });

  const fresh = (): CancelToken => {
    cancel.current = { cancelled: false };
    return cancel.current;
  };

  const choose = async () => {
    setNote(null);
    setProgress(0);
    setStep('reading');
    const token = fresh();
    try {
      const result = await pickTableFile(platform, { cancel: token, onProgress: setProgress });
      if (result.kind === 'cancelled') return setStep('start');
      if (result.kind === 'refused') {
        if (result.code === 'cancelled') {
          setNote('cancelled');
          return setStep('start');
        }
        setRefused({ code: result.code, limit: result.limit });
        return setStep('refused');
      }
      const recognised = detectPreset(result.file);
      setFile(result.file);
      setSheetIndex(0);
      setMapping(recognised ? recognised.mapping : suggestMapping(result.file, 0).mapping);
      setPresetName(recognised ? recognised.preset.name : null);
      setName(recognised ? recognised.tableName : defaultTableName(result.file.fileName));
      setStep('map');
    } catch {
      setRefused({ code: 'damaged' });
      setStep('refused');
    }
  };

  const review = async () => {
    if (!file || !mapping) return;
    setProgress(0);
    setStep('checking');
    const token = fresh();
    try {
      const next = await buildPreviewAsync(file, mapping, { cancel: token, onProgress: setProgress });
      setPreview(next);
      setStep(next.blocking.length > 0 ? 'map' : 'preview');
    } catch {
      // Cancelled (or a row the reader could not take): back to the columns with everything kept.
      setStep('map');
    }
  };

  const save = async () => {
    if (!preview) return;
    if (name.trim() === '') return setNameProblem(true);
    setStep('saving');
    try {
      const table = await commitImport(repos, { preview, name, fileName: file?.fileName ?? '', presetId: mapping?.presetId ?? null });
      const skipped = Object.values(preview.counts.skipped).reduce((a, b) => a + b, 0);
      setDone({ table, skipped });
      setStep('done');
      onImported?.();
    } catch {
      setStep('failed');
    }
  };

  const back = () => {
    if (step === 'preview' || step === 'failed') return setStep('map');
    if (step === 'map') return setStep('start');
    if (step === 'reading' || step === 'checking') return cancel.current && (cancel.current.cancelled = true);
    onClose();
  };

  const percent = Math.round(progress * 100);
  const problems = mapping ? mappingProblems(mapping) : [];
  const busy = step === 'reading' || step === 'checking' || step === 'saving';

  const footer =
    step === 'map' ? (
      <ScreenFooter>
        <Button label={t('import.map.review')} disabled={problems.length > 0} onPress={() => void review()} testID="review-import" />
      </ScreenFooter>
    ) : step === 'preview' && preview ? (
      <ScreenFooter>
        <Button label={t('import.preview.importButton', { count: preview.counts.foods })} onPress={() => void save()} testID="confirm-import" />
        <Button label={t('import.preview.back')} variant="secondary" onPress={() => setStep('map')} />
      </ScreenFooter>
    ) : undefined;

  return (
    <ScreenFrame header={<TopBar title={step === 'map' ? t('import.map.title') : step === 'preview' ? t('import.preview.title') : t('import.add.title')} onBack={busy ? undefined : back} backLabel={t('common.back')} />} footer={footer}>
      {step === 'start' ? (
        <View style={styles.body}>
          <View style={[styles.card, { backgroundColor: colors.surface }]} testID="license-notice">
            <View style={styles.titleRow}>
              <Icon name="info" color={colors.primaryText} />
              <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
                {t('import.add.noticeTitle')}
              </AppText>
            </View>
            <AppText>{t('import.add.notice')}</AppText>
            <AppText variant="bodySm" tone="muted">
              {t('import.add.formats')}
            </AppText>
            <AppText variant="bodySm" tone="muted">
              {t('import.add.limit', { size: READ_LIMITS.maxFileBytes / MEGABYTE })}
            </AppText>
          </View>
          {note === 'cancelled' ? (
            <AppText tone="muted" accessibilityLiveRegion="polite">
              {t('import.add.cancelled')}
            </AppText>
          ) : null}
          <Button label={t('import.add.choose')} icon="plus" onPress={() => void choose()} testID="choose-file" />
        </View>
      ) : null}

      {step === 'reading' || step === 'checking' || step === 'saving' ? (
        <View style={styles.body}>
          <View accessible accessibilityRole="progressbar" accessibilityLabel={t('import.add.reading')} accessibilityLiveRegion="polite" style={[styles.busy, { backgroundColor: colors.primarySoft }]} testID="import-busy">
            <Icon name="clock" color={colors.primaryText} />
            <AppText variant="bodyMd" style={styles.flex}>
              {step === 'saving'
                ? t('import.preview.saving')
                : step === 'checking'
                  ? percent > 0
                    ? t('import.map.reviewingPercent', { percent })
                    : t('import.map.reviewing')
                  : percent > 0
                    ? t('import.add.readingPercent', { percent })
                    : t('import.add.reading')}
            </AppText>
          </View>
          {step !== 'saving' ? <Button label={t('import.add.cancel')} variant="secondary" onPress={back} testID="cancel-import" /> : null}
        </View>
      ) : null}

      {step === 'refused' && refused ? (
        <View style={styles.body}>
          <ErrorState title={t('import.add.refusedTitle')} message={t(`import.add.refused.${refused.code}`, { limit: refused.limit === undefined ? '' : refused.code === 'too_large' || refused.code === 'unpacked_too_large' ? refused.limit / MEGABYTE : refused.limit })}>
            <AppText tone="muted">{t('import.add.refusedNothing')}</AppText>
            <Button label={t('import.add.refusedAgain')} icon="retake" onPress={() => void choose()} testID="choose-another" />
          </ErrorState>
        </View>
      ) : null}

      {step === 'map' && file && mapping ? (
        <MappingView
          file={file}
          sheetIndex={sheetIndex}
          mapping={mapping}
          presetName={presetName}
          onSheet={(index) => {
            setSheetIndex(index);
            setMapping(suggestMapping(file, index).mapping);
          }}
          onMapping={setMapping}
          onHeaderRow={(row) => setMapping({ ...suggestMapping(file, sheetIndex, { headerRow: row }).mapping, basis: mapping.basis, basisAssumed: mapping.basisAssumed, decimal: mapping.decimal, presetId: mapping.presetId })}
        />
      ) : null}

      {step === 'preview' && preview ? <PreviewView preview={preview} locale={locale} name={name} onName={(value) => { setName(value); setNameProblem(false); }} nameProblem={nameProblem} /> : null}

      {step === 'failed' ? (
        <View style={styles.body}>
          <ErrorState title={t('import.add.failedTitle')} message={t('import.add.failed')}>
            <Button label={t('import.add.failedRetry')} icon="retake" onPress={() => void save()} testID="retry-save" />
            <Button label={t('import.preview.back')} variant="secondary" onPress={() => setStep('map')} />
          </ErrorState>
        </View>
      ) : null}

      {step === 'done' && done ? (
        <View style={styles.body}>
          <View style={[styles.card, { backgroundColor: colors.primarySoft }]} accessibilityLiveRegion="polite" testID="import-done">
            <View style={styles.titleRow}>
              <Icon name="check" color={colors.primaryText} />
              <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
                {t('import.done.title')}
              </AppText>
            </View>
            <AppText>{t('import.done.body', { count: done.table.foodCount, name: done.table.name })}</AppText>
            {done.skipped > 0 ? <AppText>{t('import.done.partial', { count: done.skipped })}</AppText> : null}
            <AppText variant="bodySm" tone="muted">
              {t('import.done.search')}
            </AppText>
          </View>
          <Button label={t('import.done.button')} onPress={onClose} testID="import-finish" />
        </View>
      ) : null}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s3 },
  titleRow: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center' },
  flex: { flex: 1 },
  busy: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center', borderRadius: radius.lg, paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 },
});
