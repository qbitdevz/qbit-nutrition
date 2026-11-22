import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ImportedCollection } from '@/data';
import type { Locale } from '@/i18n/locale';
import { AppText, BottomSheet, Button, ErrorState, Icon, ScreenFooter, ScreenFrame, TopBar, layout, radius, spacing, useTheme } from '@/ui';
import { useDataPlatform } from '../data/DataPlatformContext';
import { useServices } from '../startup/AppProvider';
import { analyseFile, buildPlan, defaultChoices, groupMatches, pickAndAnalyse, runPlan, type AnalysedFile, type Choices, type NotImportedReason, type Plan, type RunReport } from './batchService';
import { BatchPreviewView, blockerText, FileDetails } from './BatchPreviewView';
import { suggestMapping } from './headers';
import { MappingView } from './MappingView';
import { mappingProblems, type ImportMapping } from './mapping';
import { READ_LIMITS, type CancelToken } from './readFile';
import { yieldToUi } from './readTypes';

interface ImportTableScreenProps {
  /** Leaves the flow (back from the first step, or "Done"). */
  onClose: () => void;
  /** A table was imported: the list behind this screen reads again. */
  onImported?: () => void;
}

type Step = 'start' | 'reading' | 'refused' | 'batch' | 'map' | 'checking' | 'saving' | 'done' | 'failed';

const MEGABYTE = 1024 * 1024;

/**
 * Adding tables (S1, S2, S4, S6, S9). One flow, nothing written until the last step:
 *   start (the license notice, the formats, Choose files: one or several)
 *     -> reading (file n of N, Cancel) -> [refused: why, choose again, when the only file cannot be read]
 *     -> batch (ONE preview of everything chosen: per file what was recognised, or exactly what to confirm; tables that are already here with
 *        replace / keep both / skip; files that are parts of one table, as one or as several; files with nothing usable listed as such)
 *        -> [map: the columns of one file, optional; back to the batch with the file read again]
 *     -> saving (table n of N, each in its own transaction) -> done (exactly which were imported, replaced, skipped, failed).
 * Back goes one step; what was chosen is kept while the person moves between the batch and the columns. No step makes a network request.
 */
export function ImportTableScreen({ onClose, onImported }: ImportTableScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const platform = useDataPlatform();
  const { repos } = useServices();

  const [step, setStep] = useState<Step>('start');
  const [progress, setProgress] = useState(0);
  const [reading, setReading] = useState<{ index: number; total: number; name: string } | null>(null);
  const [saving, setSaving] = useState<{ current: number; total: number } | null>(null);
  const [note, setNote] = useState<'cancelled' | null>(null);
  const [files, setFiles] = useState<AnalysedFile[]>([]);
  const [existing, setExisting] = useState<ImportedCollection[]>([]);
  const [choices, setChoices] = useState<Choices>(defaultChoices([]));
  const [mapFile, setMapFile] = useState<AnalysedFile | null>(null);
  const [mapSheet, setMapSheet] = useState(0);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [nameProblem, setNameProblem] = useState(false);
  const [details, setDetails] = useState<AnalysedFile | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const cancel = useRef<CancelToken>({ cancelled: false });

  const plan = useMemo(() => buildPlan(files, choices, existing.length), [files, choices, existing.length]);

  const fresh = (): CancelToken => {
    cancel.current = { cancelled: false };
    return cancel.current;
  };

  const choose = async () => {
    setNote(null);
    setProgress(0);
    setReading(null);
    setStep('reading');
    const token = fresh();
    try {
      const now = await repos.importedFoods.listCollections();
      const result = await pickAndAnalyse(platform, repos, { cancel: token, onFile: setReading, onProgress: setProgress });
      if (result.kind === 'cancelled') {
        if (token.cancelled) setNote('cancelled');
        return setStep('start');
      }
      setExisting(now);
      setFiles(result.files);
      setChoices({ ...defaultChoices(result.files), groupMatches: await groupMatches(repos, result.files) });
      setNameProblem(false);
      setReport(null);
      // A single file that cannot be read at all gets the old full-screen explanation and "choose another".
      const only = result.files[0];
      setStep(result.files.length === 1 && only?.outcome.kind === 'refused' ? 'refused' : 'batch');
    } catch {
      setFiles([]);
      setStep('start');
      setNote(null);
    }
  };

  /** The person changed the columns of one file: read it again with their mapping and put it back in the batch. */
  const review = async () => {
    if (!mapFile || !mapping || !mapFile.file) return;
    setProgress(0);
    setStep('checking');
    const token = fresh();
    try {
      const next = await analyseFile(repos, { id: mapFile.id, file: mapFile.file }, { override: { mapping, name: mapFile.defaultName }, cancel: token, onProgress: setProgress });
      if (next.outcome.kind !== 'ready') {
        // Still cannot be imported: back to the columns with everything kept.
        setMapFile(next);
        return setStep('map');
      }
      const updated = files.map((f) => (f.id === next.id ? next : f));
      setFiles(updated);
      setChoices((c) => ({ ...c, confirmed: { ...c.confirmed, [next.id]: [] } }));
      void groupMatches(repos, updated).then((matches) => setChoices((c) => ({ ...c, groupMatches: matches })));
      setStep('batch');
    } catch {
      // Cancelled (or a row the reader could not take): back to the columns with everything kept.
      setStep('map');
    }
  };

  const openColumns = (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file?.file || !file.mapping) return;
    setMapFile(file);
    setMapSheet(0);
    setMapping(file.mapping);
    setStep('map');
  };

  const run = async (target: Plan) => {
    setStep('saving');
    setSaving({ current: 1, total: target.units.length });
    await yieldToUi();
    const result = await runPlan(repos, target, { onUnit: (index, total) => setSaving({ current: index + 1, total }) });
    setReport(result);
    if (result.imported.length > 0) onImported?.();
    setStep(result.imported.length === 0 && result.failed.length > 0 ? 'failed' : 'done');
  };

  const save = async () => {
    if (!plan.canImport) return;
    if (plan.units.length === 1 && plan.units[0]!.name.trim() === '') return setNameProblem(true);
    await run(plan);
  };

  const retryFailed = async () => {
    if (!report) return;
    const failed = report.failed.map((f) => f.unit);
    await run({ ...plan, units: failed, blockedBy: [], canImport: true });
  };

  const back = () => {
    if (step === 'failed') return setStep('batch');
    if (step === 'map') return setStep('batch');
    if (step === 'batch') return setStep('start');
    if (step === 'reading' || step === 'checking') return cancel.current && (cancel.current.cancelled = true);
    onClose();
  };

  const percent = Math.round(progress * 100);
  const problems = mapping ? mappingProblems(mapping) : [];
  const busy = step === 'reading' || step === 'checking' || step === 'saving';
  const writing = plan.units.filter((u) => u.choice !== 'skip');
  const blockers = blockerText(t, plan.blockedBy, writing.length === 0);
  const foodCount = writing.reduce((sum, u) => sum + u.foods.length, 0);

  const footer =
    step === 'map' ? (
      <ScreenFooter>
        <Button label={t('import.map.review')} disabled={problems.length > 0} onPress={() => void review()} testID="review-import" />
      </ScreenFooter>
    ) : step === 'batch' ? (
      <ScreenFooter>
        {!plan.canImport && blockers.length > 0 ? (
          <View style={styles.blockers} accessibilityLiveRegion="polite" testID="blockers">
            {blockers.map((line) => (
              <AppText key={line} variant="bodySm" tone="muted">
                {line}
              </AppText>
            ))}
          </View>
        ) : null}
        <Button
          label={writing.length === 1 ? t('import.preview.importButton', { count: foodCount }) : t('import.batch.importButton', { count: writing.length })}
          disabled={!plan.canImport}
          onPress={() => void save()}
          testID="confirm-import"
        />
      </ScreenFooter>
    ) : undefined;

  const readingText =
    step === 'checking'
      ? percent > 0
        ? t('import.map.reviewingPercent', { percent })
        : t('import.map.reviewing')
      : step === 'saving'
        ? saving && saving.total > 1
          ? t('import.batch.saving', { current: saving.current, total: saving.total })
          : t('import.preview.saving')
        : reading && reading.total > 1
          ? t('import.add.readingFile', { current: reading.index + 1, total: reading.total, name: reading.name })
          : percent > 0
            ? t('import.add.readingPercent', { percent })
            : t('import.add.reading');

  const title = step === 'map' ? t('import.map.title') : step === 'batch' ? t('import.preview.title') : t('import.add.title');
  const refused = files.length === 1 && files[0]!.outcome.kind === 'refused' ? files[0]!.outcome : null;

  return (
    <ScreenFrame header={<TopBar title={title} onBack={busy ? undefined : back} backLabel={t('common.back')} />} footer={footer}>
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
            <AppText variant="bodySm" tone="muted">
              {t('import.add.multiHint')}
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

      {busy ? (
        <View style={styles.body}>
          <View accessible accessibilityRole="progressbar" accessibilityLabel={readingText} accessibilityLiveRegion="polite" style={[styles.busy, { backgroundColor: colors.primarySoft }]} testID="import-busy">
            <Icon name="clock" color={colors.primaryText} />
            <AppText variant="bodyMd" style={styles.flex}>
              {readingText}
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

      {step === 'map' && mapFile?.file && mapping ? (
        <MappingView
          file={mapFile.file}
          sheetIndex={mapSheet}
          mapping={mapping}
          presetName={mapFile.preset?.name ?? null}
          onSheet={(index) => {
            setMapSheet(index);
            setMapping(suggestMappingFor(mapFile, index));
          }}
          onMapping={setMapping}
          onHeaderRow={(row) => setMapping({ ...suggestMappingFor(mapFile, mapSheet, row), basis: mapping.basis, basisAssumed: mapping.basisAssumed, decimal: mapping.decimal, presetId: mapping.presetId })}
        />
      ) : null}

      {step === 'batch' ? (
        <BatchPreviewView
          files={files}
          plan={plan}
          choices={choices}
          locale={locale}
          nameProblem={nameProblem}
          onToggle={(id, selected) => setChoices((c) => ({ ...c, selected: { ...c.selected, [id]: selected } }))}
          onConfirm={(id, kind, on) => setChoices((c) => ({ ...c, confirmed: { ...c.confirmed, [id]: on ? [...new Set([...(c.confirmed[id] ?? []), kind])] : (c.confirmed[id] ?? []).filter((k) => k !== kind) } }))}
          onDuplicate={(key, choice) => setChoices((c) => ({ ...c, duplicate: { ...c.duplicate, [key]: choice } }))}
          onCombine={(presetId, combined) => setChoices((c) => ({ ...c, combine: { ...c.combine, [presetId]: combined } }))}
          onName={(key, name) => {
            setNameProblem(false);
            setChoices((c) => ({ ...c, names: { ...c.names, [key]: name } }));
          }}
          onChangeColumns={openColumns}
          onDetails={(id) => setDetails(files.find((f) => f.id === id) ?? null)}
        />
      ) : null}

      <BottomSheet visible={details !== null} onClose={() => setDetails(null)} title={details?.fileName ?? ''} closeLabel={t('common.close')}>
        {details ? <FileDetails file={details} locale={locale} /> : null}
      </BottomSheet>

      {step === 'failed' ? (
        <View style={styles.body}>
          <ErrorState title={t('import.add.failedTitle')} message={t('import.add.failed')}>
            <Button label={t('import.add.failedRetry')} icon="retake" onPress={() => void retryFailed()} testID="retry-save" />
            <Button label={t('import.preview.back')} variant="secondary" onPress={() => setStep('batch')} />
          </ErrorState>
        </View>
      ) : null}

      {step === 'done' && report ? <DoneView report={report} plan={plan} onRetry={() => void retryFailed()} onClose={onClose} /> : null}
    </ScreenFrame>
  );
}

/** A mapping for `sheet` of the file (what the sheet and header-row pickers of the columns screen start from). */
function suggestMappingFor(file: AnalysedFile, sheetIndex: number, headerRow?: number): ImportMapping {
  return suggestMapping(file.file!, sheetIndex, headerRow === undefined ? {} : { headerRow }).mapping;
}

const SORT: NotImportedReason[] = ['nothing_usable', 'needs_mapping', 'refused', 'deselected'];

/** Exactly what happened to every file: which tables were written (and what they replaced), which failed, which were left alone and why. */
function DoneView({ report, plan, onRetry, onClose }: { report: RunReport; plan: Plan; onRetry: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const foods = report.imported.reduce((sum, r) => sum + r.foods, 0);
  // One file imported cleanly keeps the short message the single-table flow always had.
  const simple = report.imported.length === 1 && report.failed.length === 0 && report.skipped.length === 0 && report.notDone.length === 0 && plan.notImported.length === 0 && report.imported[0]!.unit.files.length === 1;
  const left = simple ? Object.values(report.imported[0]!.unit.files[0]!.preview!.counts.skipped).reduce((a, b) => a + b, 0) : 0;
  return (
    <View style={styles.body}>
      {report.imported.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.primarySoft }]} accessibilityLiveRegion="polite" testID="import-done">
          <View style={styles.titleRow}>
            <Icon name="check" color={colors.primaryText} />
            <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
              {simple ? t('import.done.title') : t('import.batch.done.title')}
            </AppText>
          </View>
          {simple ? (
            <>
              <AppText>{t('import.done.body', { count: report.imported[0]!.foods, name: report.imported[0]!.collection.name })}</AppText>
              {left > 0 ? <AppText>{t('import.done.partial', { count: left })}</AppText> : null}
              {report.imported[0]!.replaced > 0 ? <AppText>{t('import.batch.done.replaced', { count: report.imported[0]!.replaced })}</AppText> : null}
              <AppText variant="bodySm" tone="muted">
                {t('import.done.search')}
              </AppText>
            </>
          ) : (
            <>
              <AppText>{t('import.batch.done.summary', { count: report.imported.length, foods })}</AppText>
              {report.imported.map((r) => (
                <View key={r.collection.id} style={styles.item}>
                  <AppText variant="itemName">{t('import.batch.done.imported', { name: r.collection.name, count: r.foods })}</AppText>
                  {r.replaced > 0 ? (
                    <AppText variant="bodySm" tone="muted">
                      {t('import.batch.done.replaced', { count: r.replaced })}
                    </AppText>
                  ) : null}
                </View>
              ))}
              <AppText variant="bodySm" tone="muted">
                {t('import.done.search')}
              </AppText>
            </>
          )}
        </View>
      ) : null}

      {report.failed.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.warningSoft }]} testID="import-failed">
          <AppText variant="heading" accessibilityRole="header">
            {t('import.batch.done.failedTitle')}
          </AppText>
          {report.failed.map((f) => (
            <AppText key={f.unit.key}>{t('import.batch.done.failed', { name: f.unit.name })}</AppText>
          ))}
          <Button label={t('import.batch.done.retryFailed')} variant="secondary" icon="retake" onPress={onRetry} testID="retry-failed" />
        </View>
      ) : null}

      {report.skipped.length + report.notDone.length + plan.notImported.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="import-not-imported">
          <AppText variant="heading" accessibilityRole="header">
            {t('import.batch.done.notImportedTitle')}
          </AppText>
          {report.skipped.flatMap((u) => u.files.map((f) => <AppText key={f.id}>{t('import.batch.done.skipped', { file: f.fileName })}</AppText>))}
          {report.notDone.flatMap((u) => u.files.map((f) => <AppText key={f.id}>{t('import.batch.done.notDone', { file: f.fileName })}</AppText>))}
          {[...plan.notImported].sort((a, b) => SORT.indexOf(a.reason) - SORT.indexOf(b.reason)).map(({ file, reason }) => (
            <AppText key={file.id}>{t(`import.batch.done.${reason}`, { file: file.fileName })}</AppText>
          ))}
        </View>
      ) : null}

      <Button label={t('import.done.button')} onPress={onClose} testID="import-finish" />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s3 },
  titleRow: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center' },
  flex: { flex: 1 },
  item: { gap: 2 },
  blockers: { gap: spacing.s1 },
  busy: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center', borderRadius: radius.lg, paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 },
});
