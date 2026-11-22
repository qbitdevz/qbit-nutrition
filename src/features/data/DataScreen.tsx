import Constants from 'expo-constants';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { EARLIEST_DAY, dayBounds } from '@/data';
import { deviceLocale } from '@/i18n';
import { formatDecimal, formatInstantDate, formatLongDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, BottomSheet, Button, ChoiceChips, ErrorState, FieldMessage, Icon, ScreenFrame, TextField, TopBar, layout, radius, spacing, useSnackbar, useTheme } from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { useDataPlatform } from './DataPlatformContext';
import { HealthRecordsNotRemovedError, WipeFailedError } from '../health/healthSync';
import type { ArchiveLimits } from './archive';
import { DeleteIncompleteError, ExportError, ImportError, createDataService, type ImportProgress, type ImportResult, type ImportPreview, type PreparedImport, type SkippedRow } from './dataService';

interface DataScreenProps {
  onBack?: () => void;
  /** Where the result of an import leads when AI providers need their key again. */
  onOpenProviders?: () => void;
  /** Opens Imported tables (food tables the person loaded from a file). */
  onOpenImportedTables?: () => void;
  /** Opens a meal (the export names the meal it could not write, and offers to open it). */
  onOpenMeal?: (mealId: string) => void;
  /** The clock; tests pass a fixed one. */
  now?: () => Date;
  /** Size limits of the export and the import (one definition); tests lower them. */
  limits?: Partial<ArchiveLimits>;
}

type ImportState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'preview'; prepared: PreparedImport }
  | { kind: 'applying'; prepared: PreparedImport; progress: ImportProgress | null }
  | { kind: 'done'; result: ImportResult }
  | { kind: 'error'; error: ImportError };

const ERROR_KEY: Record<ImportError['code'], string> = {
  too_large: 'tooLarge',
  archive_too_large: 'archiveTooLarge',
  storage_unreadable: 'storageUnreadable',
  unreadable: 'unreadable',
  damaged: 'damaged',
  not_export: 'notExport',
  newer_version: 'newerVersion',
  invalid: 'invalid',
  photos_missing: 'photosMissing',
  photo_invalid: 'photoInvalid',
  write_failed: 'writeFailed',
};

/** The kinds of data shown in the preview, in the order a person thinks of them: what the phone has now next to what the file brings. */
const COUNT_ROWS = ['meals', 'weights', 'measurements', 'goals', 'customFoods', 'importedTables', 'importedFoods', 'favoritesAndRecents', 'learnedMatches', 'barcodeProducts', 'providers', 'photos'] as const;

/**
 * Settings → Data (docs/04 flow F, S3): export everything to one file and share it, import a file to replace the
 * data, delete everything. Every destructive step is confirmed first and the safe choice is the primary button.
 * The work is in `dataService.ts`; this file lays out the steps and the messages.
 */
export function DataScreen({ onBack, onOpenProviders, onOpenImportedTables, onOpenMeal, now, limits }: DataScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const snackbar = useSnackbar();
  const platform = useDataPlatform();
  const { repos, providers, health } = useServices();
  const session = useSession();
  const service = useMemo(
    () => createDataService({ repos, providers, platform, appVersion: Constants.expoConfig?.version ?? '0.0.0', now, limits }),
    [repos, providers, platform, now, limits],
  );

  // Export.
  const [photoCount, setPhotoCount] = useState(0);
  const [tableCount, setTableCount] = useState(0);
  const [withPhotos, setWithPhotos] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProblem, setExportProblem] = useState<ExportError | 'failed' | null>(null);
  const [skippedPhotos, setSkippedPhotos] = useState(0);
  const [skippedRows, setSkippedRows] = useState<SkippedRow[]>([]);
  const [clampedDates, setClampedDates] = useState(0);
  // Import.
  const [imported, setImported] = useState<ImportState>({ kind: 'idle' });
  // Delete.
  const [deleting, setDeleting] = useState<'closed' | 'confirm' | 'working' | 'failed' | 'leftover'>('closed');
  const [word, setWord] = useState('');
  const confirmWord = t('data.delete.word');
  // Health Connect: when the integration is on, deleting everything also offers to remove the records this app wrote there.
  const [healthOn, setHealthOn] = useState(false);
  const [removeHealth, setRemoveHealth] = useState(true);
  const [healthFailed, setHealthFailed] = useState(false);
  // What a delete that did not finish left behind, stated exactly.
  const [deleteReport, setDeleteReport] = useState<{ incomplete: DeleteIncompleteError | null; healthRemoved: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    health.isEnabled().then(
      (on) => active && setHealthOn(on),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [health]);

  useEffect(() => {
    let active = true;
    // The count is not worth an error: without it the screen is still complete.
    service.photoCount().then(
      (count) => active && setPhotoCount(count),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [service]);

  useEffect(() => {
    let active = true;
    // Like the photo count: not worth an error. It tells the person that the export will contain the tables they imported.
    repos.importedFoods.listCollections().then(
      (tables) => active && setTableCount(tables.length),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [repos]);

  const share = async () => {
    setReminder(false);
    setExportProblem(null);
    setSkippedPhotos(0);
    setSkippedRows([]);
    setClampedDates(0);
    setExporting(true);
    try {
      const result = await service.exportData({ withPhotos: withPhotos && photoCount > 0, shareTitle: t('data.export.shareTitle') });
      setSkippedPhotos(result.skippedPhotos.length);
      setSkippedRows(result.skippedRows);
      setClampedDates(result.clampedDates);
      snackbar.show({ message: t('data.export.done', { name: result.fileName }), bottomOffset: spacing.s6 });
    } catch (error) {
      setExportProblem(error instanceof ExportError ? error : 'failed');
    } finally {
      setExporting(false);
    }
  };

  const chooseFile = async () => {
    setImported({ kind: 'reading' });
    try {
      const picked = await platform.picker.pick();
      if (!picked) {
        setImported({ kind: 'idle' });
        return;
      }
      setImported({ kind: 'preview', prepared: await service.prepareImport(picked) });
    } catch (error) {
      setImported({ kind: 'error', error: error instanceof ImportError ? error : new ImportError('unreadable') });
    }
  };

  const replace = async (prepared: PreparedImport) => {
    setImported({ kind: 'applying', prepared, progress: null });
    let result: ImportResult;
    try {
      result = await service.applyImport(prepared, { onProgress: (progress) => setImported({ kind: 'applying', prepared, progress }) });
    } catch (error) {
      // Nothing was replaced: the service rolled everything back.
      setImported({ kind: 'error', error: error instanceof ImportError ? error : new ImportError('write_failed') });
      return;
    }
    // From here the data IS replaced. A failure of what follows (switching language, telling other screens) must never be shown as
    // "your data was not changed".
    try {
      if (result.locale && result.locale !== i18n.language) await i18n.changeLanguage(result.locale);
      session.notifyChange();
    } catch {
      // The data is in; the other screens read it again the next time they are opened.
    }
    setImported({ kind: 'done', result });
  };

  const deleteEverything = async () => {
    setDeleting('working');
    setHealthFailed(false);
    setDeleteReport(null);
    let leftover = false;
    try {
      // One exclusive step: a Health Connect sync already under way finishes first, the records this app wrote are removed first (if
      // Health Connect refuses, nothing has been deleted), and no sync can add anything after the wipe.
      const result = await health.wipe(healthOn && removeHealth, () => service.deleteAll({ confirmation: word }));
      leftover = result.exportFilesLeft;
    } catch (error) {
      if (error instanceof HealthRecordsNotRemovedError) {
        setHealthFailed(true);
        setDeleting('confirm');
        return;
      }
      const wipe = error instanceof WipeFailedError ? error : null;
      const cause = wipe ? wipe.cause : error;
      setDeleteReport({ incomplete: cause instanceof DeleteIncompleteError ? cause : null, healthRemoved: wipe?.recordsRemoved ?? false });
      setDeleting('failed');
      return;
    }
    // Everything is deleted. A copy of an earlier export that could not be removed is said first: the app resets only after it has been read.
    if (leftover) {
      setDeleting('leftover');
      return;
    }
    await finishDelete();
  };

  const finishDelete = async () => {
    setDeleting('closed');
    setWord('');
    // First launch again: the language is the device's, not the one chosen on the data that is gone.
    await i18n.changeLanguage(deviceLocale()).catch(() => undefined);
    session.resetOnboarding();
  };

  const closeDelete = () => {
    setDeleting('closed');
    setWord('');
  };

  const preview = imported.kind === 'preview' || imported.kind === 'applying' ? imported.prepared.preview : null;
  const wordMatches = word.trim().toLowerCase() === confirmWord.toLowerCase();

  return (
    <ScreenFrame header={<TopBar title={t('data.title')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        <AppText tone="muted">{t('data.intro')}</AppText>

        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="data-export">
          <AppText variant="heading" accessibilityRole="header">
            {t('data.export.title')}
          </AppText>
          <AppText tone="muted">{t('data.export.body')}</AppText>
          {photoCount > 0 ? (
            <View style={styles.group}>
              <ChoiceChips<'off' | 'on'>
                label={t('data.export.photosLabel')}
                options={[
                  { value: 'off', label: t('data.export.photosOff') },
                  { value: 'on', label: t('data.export.photosOn', { count: photoCount }) },
                ]}
                value={withPhotos ? 'on' : 'off'}
                onChange={(value) => value && setWithPhotos(value === 'on')}
              />
              <AppText variant="bodySm" tone="muted">
                {t('data.export.photosHint')}
              </AppText>
            </View>
          ) : null}
          {exporting ? <Busy label={t('data.export.preparing')} /> : null}
          {exportProblem ? <ExportProblemView problem={exportProblem} locale={locale} today={dayBounds((now ?? (() => new Date()))()).latest} onOpenMeal={onOpenMeal} /> : null}
          {clampedDates > 0 ? <FieldMessage message={t('data.export.datesCorrected', { count: clampedDates })} /> : null}
          {skippedPhotos > 0 ? <FieldMessage message={t('data.export.photosSkipped', { count: skippedPhotos })} /> : null}
          {skippedRows.length > 0 ? <FieldMessage message={t('data.export.rowsSkipped', { count: skippedRows.length, what: skippedRows.slice(0, 3).map((row) => row.detail).join(', ') + (skippedRows.length > 3 ? '…' : '') })} /> : null}
          <Button label={t('data.export.button')} icon="copy" disabled={exporting} onPress={() => setReminder(true)} testID="export-button" />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="data-import">
          <AppText variant="heading" accessibilityRole="header">
            {t('data.import.title')}
          </AppText>
          <AppText tone="muted">{t('data.import.body')}</AppText>
          {imported.kind === 'reading' ? <Busy label={t('data.import.reading')} /> : null}
          {imported.kind === 'applying' ? <Busy label={importLabel(t, imported.progress)} /> : null}
          {imported.kind === 'error' ? <ImportProblem error={imported.error} locale={locale} onRetry={() => void chooseFile()} /> : null}
          {imported.kind === 'done' ? <ImportDone result={imported.result} onOpenProviders={onOpenProviders} /> : null}
          {imported.kind !== 'error' ? (
            <Button label={t('data.import.button')} variant="secondary" icon="plus" disabled={imported.kind === 'reading' || imported.kind === 'applying'} onPress={() => void chooseFile()} testID="import-button" />
          ) : null}
        </View>

        {onOpenImportedTables ? (
          <View style={[styles.card, { backgroundColor: colors.surface }]} testID="data-tables">
            <AppText variant="heading" accessibilityRole="header">
              {t('import.card.title')}
            </AppText>
            <AppText tone="muted">{t('import.card.body')}</AppText>
            <AppText variant="bodySm" tone="muted">
              {tableCount > 0 ? t('import.card.count', { count: tableCount }) : t('import.card.none')}
            </AppText>
            <Button label={t('import.card.open')} variant="secondary" icon="plate" onPress={onOpenImportedTables} testID="open-imported-tables" />
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="data-delete">
          <AppText variant="heading" accessibilityRole="header">
            {t('data.delete.title')}
          </AppText>
          <AppText tone="muted">{t('data.delete.body')}</AppText>
          <Button label={t('data.delete.button')} variant="secondary" icon="trash" onPress={() => setDeleting('confirm')} testID="delete-button" />
        </View>
      </View>

      <BottomSheet visible={reminder} onClose={() => setReminder(false)} title={t('data.export.reminderTitle')} closeLabel={t('common.close')}>
        <View style={styles.notice}>
          <Icon name="alert" color={colors.warning} />
          <AppText style={styles.noticeText}>{t('data.export.reminderBody')}</AppText>
        </View>
        {tableCount > 0 ? (
          <View style={styles.notice} testID="export-tables-note">
            <Icon name="alert" color={colors.warning} />
            <AppText style={styles.noticeText}>{t('data.export.reminderTables', { count: tableCount })}</AppText>
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button label={t('data.export.share')} onPress={() => void share()} testID="share-file" />
          <Button label={t('data.export.cancel')} variant="secondary" onPress={() => setReminder(false)} />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={preview !== null}
        onClose={() => imported.kind === 'preview' && setImported({ kind: 'idle' })}
        title={t('data.import.previewTitle')}
        closeLabel={t('common.close')}>
        {preview ? <PreviewBody preview={preview} locale={locale} /> : null}
        <View style={styles.actions}>
          <Button label={t('data.import.keep')} disabled={imported.kind === 'applying'} onPress={() => setImported({ kind: 'idle' })} />
          <Button
            label={t('data.import.replace')}
            variant="secondary"
            disabled={imported.kind === 'applying'}
            onPress={() => imported.kind === 'preview' && void replace(imported.prepared)}
            testID="replace-data"
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={deleting !== 'closed'}
        onClose={deleting === 'working' ? () => undefined : deleting === 'leftover' ? () => void finishDelete() : closeDelete}
        title={t('data.delete.sheetTitle')}
        closeLabel={t('common.close')}>
        {deleting === 'leftover' ? (
          <>
            <View style={styles.notice} testID="delete-leftover">
              <Icon name="alert" color={colors.warning} />
              <AppText style={styles.noticeText}>{t('data.delete.leftover')}</AppText>
            </View>
            <View style={styles.actions}>
              <Button label={t('data.delete.continue')} onPress={() => void finishDelete()} testID="delete-continue" />
            </View>
          </>
        ) : (
          <>
        <AppText tone="muted">{t('data.delete.sheetBody')}</AppText>
        <TextField
          label={t('data.delete.fieldLabel')}
          value={word}
          onChangeText={setWord}
          hint={t('data.delete.type', { word: confirmWord })}
          autoCapitalize="characters"
          returnKeyType="done"
          testID="confirm-word"
        />
        {!wordMatches ? (
          <AppText variant="bodySm" tone="muted">
            {t('data.delete.disabledWhy', { word: confirmWord })}
          </AppText>
        ) : null}
        {healthOn ? (
          <View style={styles.group} testID="delete-health">
            <AppText variant="heading" accessibilityRole="header">
              {t('data.delete.healthTitle')}
            </AppText>
            <AppText tone="muted">{t('data.delete.healthBody')}</AppText>
            <ChoiceChips<'remove' | 'keep'>
              label={t('data.delete.healthTitle')}
              options={[
                { value: 'remove', label: t('data.delete.healthRemove') },
                { value: 'keep', label: t('data.delete.healthKeep') },
              ]}
              value={removeHealth ? 'remove' : 'keep'}
              onChange={(value) => value && setRemoveHealth(value === 'remove')}
            />
            {healthFailed ? <FieldMessage message={t('data.delete.healthFailed')} /> : null}
          </View>
        ) : null}
        {deleting === 'working' ? <Busy label={t('data.delete.deleting')} /> : null}
        {deleting === 'failed' && deleteReport ? <DeleteReportView report={deleteReport} /> : null}
        <View style={styles.actions}>
          <Button label={t('data.delete.keep')} disabled={deleting === 'working'} onPress={closeDelete} />
          <Button label={t('data.delete.confirm')} variant="secondary" disabled={!wordMatches || deleting === 'working'} onPress={() => void deleteEverything()} testID="delete-everything" />
        </View>
          </>
        )}
      </BottomSheet>
    </ScreenFrame>
  );
}

function DeleteReportView({ report }: { report: { incomplete: DeleteIncompleteError | null; healthRemoved: boolean } }) {
  const { t } = useTranslation();
  const e = report.incomplete;
  const lines: string[] = [];
  if (!e) lines.push(t('data.delete.incomplete.unknown'));
  else if (e.stage === 'keys') {
    // Every key is tried before this is reported, so say how many are already gone: "nothing was deleted" is only true when none was.
    if (e.keysUnlistable && e.keysFailed === 0) lines.push(e.keysDeleted > 0 ? t('data.delete.incomplete.keysUnlistableSome', { count: e.keysDeleted }) : t('data.delete.incomplete.keysUnlistable'));
    else lines.push(e.keysDeleted > 0 ? t('data.delete.incomplete.keysSome', { count: e.keysFailed, removed: e.keysDeleted }) : t('data.delete.incomplete.keys', { count: e.keysFailed }));
  }
  else if (e.stage === 'photos') {
    lines.push(
      e.photosUnlistable
        ? t('data.delete.incomplete.photosUnlistable')
        : t('data.delete.incomplete.photos', { removed: e.photosRemoved, total: e.photosRemoved + e.photosFailed, count: e.photosFailed }),
    );
  } else lines.push(t('data.delete.incomplete.data'));
  if (report.healthRemoved) lines.push(t('data.delete.incomplete.health'));
  return (
    <View style={styles.group} testID="delete-report">
      {lines.map((line) => (
        <FieldMessage key={line} message={line} />
      ))}
    </View>
  );
}

const MEGABYTE = 1024 * 1024;

/** A size the person can read: "412.0 KB", "63.5 MB". */
const formatSize = (locale: Locale, bytes: number): string => (bytes < MEGABYTE ? `${formatDecimal(locale, bytes / 1024, 1)} KB` : `${formatDecimal(locale, bytes / MEGABYTE, 1)} MB`);

function exportMessage(t: TFunction, locale: Locale, today: string, problem: ExportError | 'failed'): string {
  if (problem === 'failed') return t('data.export.error');
  if (problem.code === 'secret_in_field') return t('data.export.errorSecret', { where: problem.where });
  if (problem.code === 'keys_unreadable') return t('data.export.errorKeys');
  if (problem.code === 'meal_out_of_range' && problem.meal) {
    const more = problem.moreMeals ? ` ${t('data.export.errorMealMore', { count: problem.moreMeals })}` : '';
    return `${t('data.export.errorMeal', { name: problem.meal.name ?? t('meal.title'), date: formatLongDate(locale, problem.meal.date), from: formatLongDate(locale, EARLIEST_DAY), to: formatLongDate(locale, today) })}${more}`;
  }
  if (problem.code === 'invalid_value' && problem.meal) return t('data.export.errorMealValue', { name: problem.meal.name ?? t('meal.title'), date: formatLongDate(locale, problem.meal.date), where: problem.where });
  if (problem.code === 'invalid_value') return t('data.export.errorValue', { where: problem.where });
  if (problem.code === 'too_large') {
    const sizes = { size: formatSize(locale, problem.size ?? 0), limit: formatSize(locale, problem.limit ?? 0) };
    // The photos are what can be left out: say so first when leaving them out would fit.
    if (problem.kind === 'photos') return t('data.export.errorTooManyPhotos', { count: problem.size ?? 0, limit: problem.limit ?? 0 });
    if (problem.withoutPhotosFits) return t('data.export.errorTooLargePhotos', sizes);
    return t(problem.kind === 'file' ? 'data.export.errorTooLargeFile' : 'data.export.errorTooLarge', sizes);
  }
  return t('data.export.error');
}

/** What stopped an export, in words the person can act on, with a way to open the meal when it is a meal. */
function ExportProblemView({ problem, locale, today, onOpenMeal }: { problem: ExportError | 'failed'; locale: Locale; today: string; onOpenMeal?: (mealId: string) => void }) {
  const { t } = useTranslation();
  const meal = problem !== 'failed' ? problem.meal : undefined;
  return (
    <View style={styles.group}>
      <FieldMessage message={exportMessage(t, locale, today, problem)} />
      {meal && onOpenMeal ? <Button label={t('data.export.openMeal')} variant="secondary" icon="plate" onPress={() => onOpenMeal(meal.id)} testID="open-meal" /> : null}
    </View>
  );
}

/** The line shown while an import runs: which of its steps is under way. */
function importLabel(t: TFunction, progress: ImportProgress | null): string {
  if (!progress) return t('data.import.importing');
  if (progress.step === 'photos') return t('data.import.progressPhotos', { done: Math.min(progress.done + 1, progress.total), total: progress.total });
  return t(progress.step === 'writing' ? 'data.import.progressWriting' : 'data.import.progressCleaning');
}

/** A line that says work is under way; announced to screen readers as a progress element. */
function Busy({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite" style={[styles.busy, { backgroundColor: colors.primarySoft }]}>
      <Icon name="clock" color={colors.primaryText} />
      <AppText variant="bodyMd" style={styles.noticeText}>
        {label}
      </AppText>
    </View>
  );
}

function PreviewBody({ preview, locale }: { preview: ImportPreview; locale: Locale }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <>
      <AppText tone="muted">{t('data.import.contains', { date: formatInstantDate(locale, new Date(preview.exportedAt)), version: preview.appVersion })}</AppText>
      <CountsTable preview={preview} locale={locale} />
      {!preview.hasProfile ? (
        <AppText variant="bodySm" tone="muted">
          {t('data.import.noProfile')}
        </AppText>
      ) : null}
      <AppText variant="bodyMd">
        {preview.dateRange ? t('data.import.range', { from: formatLongDate(locale, preview.dateRange.from), to: formatLongDate(locale, preview.dateRange.to) }) : t('data.import.noRange')}
      </AppText>
      <View style={styles.notice}>
        <Icon name="alert" color={colors.warning} />
        <AppText variant="bodyMd" style={styles.noticeText} testID="replace-warning">
          {t('data.import.replaceWarning')}
        </AppText>
      </View>
      {preview.providerHosts.length > 0 ? (
        <View style={[styles.counts, { backgroundColor: colors.warningSoft }]} testID="provider-hosts">
          <AppText variant="itemName">{t('data.import.providersHosts')}</AppText>
          {preview.providerHosts.map((provider, index) => (
            <AppText key={`${provider.label}-${index}`} variant="bodyMd">
              {`${provider.label} → ${provider.host}`}
            </AppText>
          ))}
          <AppText variant="bodySm">{t('data.import.providersCheck')}</AppText>
        </View>
      ) : null}
      {preview.healthConnectWeights > 0 ? (
        <AppText variant="bodySm" tone="muted" testID="health-weights-note">
          {t('data.import.healthWeights', { count: preview.healthConnectWeights })}
          {preview.mergedWeights > 0 ? ` ${t('data.import.healthMerged', { count: preview.mergedWeights })}` : ''}
        </AppText>
      ) : null}
      {preview.providersNeedingKey > 0 ? (
        <AppText variant="bodySm" tone="muted">
          {t('data.import.providersNote')}
        </AppText>
      ) : null}
      <AppText variant="bodySm" tone="muted">
        {t('data.import.noticeNote')}
      </AppText>
    </>
  );
}

/** What the phone has now next to what the file brings, one row per kind of data that either side has. */
function CountsTable({ preview, locale }: { preview: ImportPreview; locale: Locale }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rows = COUNT_ROWS.filter((row) => preview.counts[row] > 0 || preview.current[row] > 0);
  const number = (value: number) => formatDecimal(locale, value, 0);
  return (
    <View style={[styles.counts, { backgroundColor: colors.surface }]} testID="import-counts" accessibilityLabel={t('data.import.contents')}>
      <View style={[styles.countRow, styles.countHead]}>
        <View style={styles.countLabel} />
        <AppText variant="caption" tone="muted" style={styles.countValue}>
          {t('data.import.columnNow')}
        </AppText>
        <AppText variant="caption" tone="muted" style={styles.countValue}>
          {t('data.import.columnFile')}
        </AppText>
      </View>
      {rows.map((row) => (
        <View key={row} style={styles.countRow} testID={`count-${row}`} accessible accessibilityLabel={t('data.import.rowLabel', { label: t(`data.import.rows.${row}`), now: number(preview.current[row]), file: number(preview.counts[row]) })}>
          <AppText variant="bodyMd" style={styles.countLabel}>
            {t(`data.import.rows.${row}`)}
          </AppText>
          <AppText variant="itemName" style={styles.countValue}>
            {number(preview.current[row])}
          </AppText>
          <AppText variant="itemName" style={styles.countValue}>
            {number(preview.counts[row])}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function ImportProblem({ error, locale, onRetry }: { error: ImportError; locale: Locale; onRetry: () => void }) {
  const { t } = useTranslation();
  // A refusal that is probably the phone's own date says so, with both dates, instead of only naming a place in the file.
  const clockKey = error.code === 'invalid' && error.clock ? (error.clock.fileDate ? 'invalidClock' : 'invalidClockNoFile') : null;
  const message = t(`data.import.error.${clockKey ?? ERROR_KEY[error.code]}`, {
    where: error.where ?? '',
    fileVersion: error.fileVersion,
    supportedVersion: error.supportedVersion,
    deviceDate: error.clock ? formatLongDate(locale, error.clock.deviceDate) : '',
    fileDate: error.clock?.fileDate ? formatLongDate(locale, error.clock.fileDate) : '',
  });
  return (
    <ErrorState title={t('data.import.error.title')} message={message} icon="alert">
      <AppText tone="muted">{t('data.import.error.notChanged')}</AppText>
      <Button label={t('data.import.error.retry')} variant="secondary" icon="retake" onPress={onRetry} />
    </ErrorState>
  );
}

function ImportDone({ result, onOpenProviders }: { result: ImportResult; onOpenProviders?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.done, { backgroundColor: colors.primarySoft }]} accessibilityLiveRegion="polite" testID="import-done">
      <View style={styles.notice}>
        <Icon name="check" color={colors.primaryText} />
        <AppText variant="heading" accessibilityRole="header" style={styles.noticeText}>
          {t('data.import.doneTitle')}
        </AppText>
      </View>
      <AppText>{t('data.import.done', { count: result.meals })}</AppText>
      {result.providersNeedingKey > 0 ? <AppText>{t('data.import.needKey', { count: result.providersNeedingKey })}</AppText> : null}
      {result.leftovers.photos || result.leftovers.keys ? <FieldMessage message={t('data.import.leftovers')} /> : null}
      {result.providersNeedingKey > 0 && onOpenProviders ? <Button label={t('data.import.openProviders')} variant="secondary" onPress={onOpenProviders} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s3 },
  group: { gap: spacing.s2 },
  actions: { gap: 10, marginTop: spacing.s2 },
  notice: { flexDirection: 'row', gap: spacing.s3, alignItems: 'flex-start' },
  noticeText: { flex: 1 },
  busy: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center', borderRadius: radius.lg, paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 },
  counts: { borderRadius: radius.lg, padding: spacing.s4, gap: spacing.s1 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  countHead: { alignItems: 'flex-end' },
  countLabel: { flex: 1 },
  countValue: { width: 76, textAlign: 'right' },
  done: { borderRadius: radius.lg, padding: spacing.s4, gap: spacing.s2 },
});
