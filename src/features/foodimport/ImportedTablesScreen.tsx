import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ImportedCollection } from '@/data';
import { formatInstantDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import { AppText, BottomSheet, Button, ConfirmSheet, EmptyState, ErrorState, Icon, ScreenFrame, Skeleton, TextField, TopBar, layout, radius, spacing, useSnackbar, useTheme } from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { presetById } from './presets';

interface ImportedTablesScreenProps {
  onBack?: () => void;
  /** Opens the add-a-table flow. */
  onAdd: () => void;
  /** Tells the rest of the app that foods changed (search results, favorites). */
  onChanged?: () => void;
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; tables: ImportedCollection[] };

/**
 * Settings → Data → Imported tables (S1, S5): the food tables the person loaded from a file. Add, rename, remove (after a confirmation
 * that names how many foods go). States: loading, error with retry, empty with the one action that fills it, the list.
 */
export function ImportedTablesScreen({ onBack, onAdd, onChanged }: ImportedTablesScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const snackbar = useSnackbar();
  const { repos } = useServices();
  // The add flow sits on top of this screen in the stack: when it imports a table the session revision goes up and the list reads again.
  const { revision } = useSession();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [renaming, setRenaming] = useState<ImportedCollection | null>(null);
  const [name, setName] = useState('');
  const [renameProblem, setRenameProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ImportedCollection | null>(null);
  const [removeFailed, setRemoveFailed] = useState(false);

  const load = useCallback(() => {
    repos.importedFoods.listCollections().then(
      (tables) => setState({ status: 'ready', tables }),
      () => setState({ status: 'error' }),
    );
  }, [repos]);
  useEffect(load, [load, revision]);

  const startRename = (table: ImportedCollection) => {
    setRenaming(table);
    setName(table.name);
    setRenameProblem(null);
  };
  const saveRename = async () => {
    if (!renaming) return;
    if (name.trim() === '') return setRenameProblem(t('import.list.renameBlank'));
    try {
      await repos.importedFoods.renameCollection(renaming.id, name);
      setRenaming(null);
      load();
      onChanged?.();
    } catch {
      setRenameProblem(t('import.list.renameFailed'));
    }
  };
  const remove = async () => {
    if (!removing) return;
    const gone = removing;
    try {
      await repos.importedFoods.removeCollection(gone.id);
      setRemoving(null);
      setRemoveFailed(false);
      snackbar.show({ message: t('import.list.removed', { name: gone.name }), bottomOffset: spacing.s6 });
      load();
      onChanged?.();
    } catch {
      setRemoveFailed(true);
    }
  };

  return (
    <ScreenFrame header={<TopBar title={t('import.list.title')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        <AppText tone="muted">{t('import.list.intro')}</AppText>

        {state.status === 'loading' ? (
          <View style={styles.list} accessibilityLabel={t('common.loading')} testID="tables-loading">
            <Skeleton height={112} radius={24} />
            <Skeleton height={112} radius={24} />
          </View>
        ) : null}

        {state.status === 'error' ? (
          <ErrorState title={t('import.list.title')} message={t('import.list.loadError')}>
            <Button label={t('common.retry')} icon="retake" onPress={() => {
              setState({ status: 'loading' });
              load();
            }} />
          </ErrorState>
        ) : null}

        {state.status === 'ready' && state.tables.length === 0 ? (
          <EmptyState icon="plate" title={t('import.list.emptyTitle')} body={t('import.list.emptyBody')}>
            <Button label={t('import.list.add')} icon="plus" onPress={onAdd} testID="add-table" />
          </EmptyState>
        ) : null}

        {state.status === 'ready' && state.tables.length > 0 ? (
          <>
            <View style={styles.list}>
              {state.tables.map((table) => {
                const preset = table.presetId ? presetById(table.presetId) : null;
                return (
                  <View key={table.id} style={[styles.card, { backgroundColor: colors.surface }]} testID={`table-${table.name}`}>
                    <AppText variant="heading" accessibilityRole="header">
                      {table.name}
                    </AppText>
                    <AppText variant="bodyMd">{t('import.list.foods', { count: table.foodCount })}</AppText>
                    <AppText variant="bodySm" tone="muted">
                      {[
                        table.fileName ? t('import.list.file', { file: table.fileName }) : null,
                        t('import.list.date', { date: formatInstantDate(locale, new Date(table.importedAt)) }),
                        preset ? t('import.list.preset', { preset: preset.name }) : null,
                        table.basis === 'ml' ? t('import.list.ml') : null,
                      ]
                        .filter((line): line is string => line !== null)
                        .join(' · ')}
                    </AppText>
                    <View style={styles.actions}>
                      <Button label={t('import.list.rename')} variant="secondary" icon="pencil" block={false} onPress={() => startRename(table)} />
                      <Button label={t('import.list.remove')} variant="secondary" icon="trash" block={false} onPress={() => setRemoving(table)} />
                    </View>
                  </View>
                );
              })}
            </View>
            <Button label={t('import.list.add')} icon="plus" onPress={onAdd} testID="add-table" />
            <View style={styles.note}>
              <Icon name="info" color={colors.textMuted} />
              <AppText variant="bodySm" tone="muted" style={styles.noteText}>
                {t('import.list.exportNote')}
              </AppText>
            </View>
          </>
        ) : null}
      </View>

      <BottomSheet visible={renaming !== null} onClose={() => setRenaming(null)} title={t('import.list.renameTitle')} closeLabel={t('common.close')}>
        <TextField
          label={t('import.list.renameLabel')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setRenameProblem(null);
          }}
          error={renameProblem}
          maxLength={200}
          returnKeyType="done"
          onSubmitEditing={() => void saveRename()}
          autoFocus
          testID="rename-field"
        />
        <View style={styles.sheetActions}>
          <Button label={t('import.list.renameSave')} onPress={() => void saveRename()} testID="rename-save" />
          <Button label={t('common.cancel')} variant="secondary" onPress={() => setRenaming(null)} />
        </View>
      </BottomSheet>

      <ConfirmSheet
        visible={removing !== null}
        title={t('import.list.removeTitle', { name: removing?.name ?? '' })}
        body={t('import.list.removeBody', { count: removing?.foodCount ?? 0 })}
        note={removeFailed ? t('import.list.removeFailed') : undefined}
        confirmLabel={t('import.list.removeConfirm')}
        cancelLabel={t('import.list.removeKeep')}
        closeLabel={t('common.close')}
        onConfirm={() => void remove()}
        onCancel={() => {
          setRemoving(null);
          setRemoveFailed(false);
        }}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s10, gap: spacing.s4 },
  list: { gap: spacing.s3 },
  card: { borderRadius: radius.lg, padding: spacing.s5, gap: spacing.s2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s2 },
  sheetActions: { gap: 10, marginTop: spacing.s3 },
  note: { flexDirection: 'row', gap: spacing.s3, alignItems: 'flex-start' },
  noteText: { flex: 1 },
});
