import Constants from 'expo-constants';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { deviceLocale } from '@/i18n';
import { formatInstantDate, formatLongDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, BottomSheet, Button, ChoiceChips, ErrorState, FieldMessage, Icon, ScreenFrame, TextField, TopBar, layout, radius, spacing, useSnackbar, useTheme } from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { useDataPlatform } from './DataPlatformContext';
import { ExportError, ImportError, createDataService, type ImportResult, type ImportPreview, type PreparedImport } from './dataService';

interface DataScreenProps {
  onBack?: () => void;
  /** Where the result of an import leads when AI providers need their key again. */
  onOpenProviders?: () => void;
  /** The clock; tests pass a fixed one. */
  now?: () => Date;
}

type ImportState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'preview'; prepared: PreparedImport }
  | { kind: 'applying'; prepared: PreparedImport }
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

const COUNT_ROWS = ['meals', 'weights', 'measurements', 'goals', 'customFoods', 'providers', 'photos'] as const;

/**
 * Settings → Data (docs/04 flow F, S3): export everything to one file and share it, import a file to replace the
 * data, delete everything. Every destructive step is confirmed first and the safe choice is the primary button.
 * The work is in `dataService.ts`; this file lays out the steps and the messages.
 */
export function DataScreen({ onBack, onOpenProviders, now }: DataScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const snackbar = useSnackbar();
  const platform = useDataPlatform();
  const { repos, providers } = useServices();
  const session = useSession();
  const service = useMemo(
    () => createDataService({ repos, providers, platform, appVersion: Constants.expoConfig?.version ?? '0.0.0', now }),
    [repos, providers, platform, now],
  );

  // Export.
  const [photoCount, setPhotoCount] = useState(0);
  const [withPhotos, setWithPhotos] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProblem, setExportProblem] = useState<ExportError | 'failed' | null>(null);
  const [skippedPhotos, setSkippedPhotos] = useState(0);
  // Import.
  const [imported, setImported] = useState<ImportState>({ kind: 'idle' });
  // Delete.
  const [deleting, setDeleting] = useState<'closed' | 'confirm' | 'working' | 'failed'>('closed');
  const [word, setWord] = useState('');
  const confirmWord = t('data.delete.word');

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

  const share = async () => {
    setReminder(false);
    setExportProblem(null);
    setSkippedPhotos(0);
    setExporting(true);
    try {
      const result = await service.exportData({ withPhotos: withPhotos && photoCount > 0, shareTitle: t('data.export.shareTitle') });
      setSkippedPhotos(result.skippedPhotos.length);
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
    setImported({ kind: 'applying', prepared });
    let result: ImportResult;
    try {
      result = await service.applyImport(prepared);
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
    try {
      await service.deleteAll({ confirmation: word });
      setDeleting('closed');
      setWord('');
      // First launch again: the language is the device's, not the one chosen on the data that is gone.
      await i18n.changeLanguage(deviceLocale()).catch(() => undefined);
      session.resetOnboarding();
    } catch {
      setDeleting('failed');
    }
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
          {exportProblem ? <FieldMessage message={exportMessage(t, exportProblem)} /> : null}
          {skippedPhotos > 0 ? <FieldMessage message={t('data.export.photosSkipped', { count: skippedPhotos })} /> : null}
          <Button label={t('data.export.button')} icon="copy" disabled={exporting} onPress={() => setReminder(true)} testID="export-button" />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="data-import">
          <AppText variant="heading" accessibilityRole="header">
            {t('data.import.title')}
          </AppText>
          <AppText tone="muted">{t('data.import.body')}</AppText>
          {imported.kind === 'reading' ? <Busy label={t('data.import.reading')} /> : null}
          {imported.kind === 'applying' ? <Busy label={t('data.import.importing')} /> : null}
          {imported.kind === 'error' ? <ImportProblem error={imported.error} onRetry={() => void chooseFile()} /> : null}
          {imported.kind === 'done' ? <ImportDone result={imported.result} onOpenProviders={onOpenProviders} /> : null}
          {imported.kind !== 'error' ? (
            <Button label={t('data.import.button')} variant="secondary" icon="plus" disabled={imported.kind === 'reading' || imported.kind === 'applying'} onPress={() => void chooseFile()} testID="import-button" />
          ) : null}
        </View>

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

      <BottomSheet visible={deleting !== 'closed'} onClose={deleting === 'working' ? () => undefined : closeDelete} title={t('data.delete.sheetTitle')} closeLabel={t('common.close')}>
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
        {deleting === 'working' ? <Busy label={t('data.delete.deleting')} /> : null}
        {deleting === 'failed' ? <FieldMessage message={t('data.delete.error')} /> : null}
        <View style={styles.actions}>
          <Button label={t('data.delete.keep')} disabled={deleting === 'working'} onPress={closeDelete} />
          <Button label={t('data.delete.confirm')} variant="secondary" disabled={!wordMatches || deleting === 'working'} onPress={() => void deleteEverything()} testID="delete-everything" />
        </View>
      </BottomSheet>
    </ScreenFrame>
  );
}

function exportMessage(t: TFunction, problem: ExportError | 'failed'): string {
  if (problem === 'failed') return t('data.export.error');
  if (problem.code === 'secret_in_field') return t('data.export.errorSecret', { where: problem.where });
  if (problem.code === 'keys_unreadable') return t('data.export.errorKeys');
  if (problem.code === 'invalid_value') return t('data.export.errorValue', { where: problem.where });
  return t('data.export.error');
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
      <View style={[styles.counts, { backgroundColor: colors.surface }]} accessibilityLabel={t('data.import.contents')}>
        {COUNT_ROWS.filter((row) => preview.counts[row] > 0).map((row) => (
          <AppText key={row} variant="itemName">
            {t(`data.import.${row}`, { count: preview.counts[row] })}
          </AppText>
        ))}
        {!preview.hasProfile ? (
          <AppText variant="bodySm" tone="muted">
            {t('data.import.noProfile')}
          </AppText>
        ) : null}
      </View>
      <AppText variant="bodyMd">
        {preview.dateRange ? t('data.import.range', { from: formatLongDate(locale, preview.dateRange.from), to: formatLongDate(locale, preview.dateRange.to) }) : t('data.import.noRange')}
      </AppText>
      <View style={styles.notice}>
        <Icon name="alert" color={colors.warning} />
        <AppText variant="bodyMd" style={styles.noticeText}>
          {t('data.import.replaceWarning')}
        </AppText>
      </View>
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

function ImportProblem({ error, onRetry }: { error: ImportError; onRetry: () => void }) {
  const { t } = useTranslation();
  const message = t(`data.import.error.${ERROR_KEY[error.code]}`, {
    where: error.where ?? '',
    fileVersion: error.fileVersion,
    supportedVersion: error.supportedVersion,
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
  done: { borderRadius: radius.lg, padding: spacing.s4, gap: spacing.s2 },
});
