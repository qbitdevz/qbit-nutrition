import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { CancelledError } from '@/core/ai';
import type { AiAdapterId } from '@/data';
import type { Locale } from '@/i18n/locale';
import { SecretStoreError } from '@/platform/secretStore';
import {
  AppText,
  Button,
  ChoiceChips,
  ConfirmSheet,
  ErrorState,
  FieldMessage,
  Icon,
  ScreenFooter,
  ScreenFrame,
  Skeleton,
  TextField,
  TopBar,
  layout,
  radius,
  spacing,
  useSnackbar,
  useTheme,
} from '@/ui';
import { useSession } from '../session/AppSession';
import { useServices } from '../startup/AppProvider';
import { getPreset, noteIn, type Preset } from './presets';
import { ProviderSaveError, normalizeBaseUrl, type ProviderView, type TestOutcome } from './providerService';
import { checkBaseUrl, parseTimeout, testResultKey, urlMessageKey } from './providerValidation';

const DEFAULT_TIMEOUT_S = 60;
const MAX_SHOWN_MODELS = 20;

interface ProviderFormScreenProps {
  /** Edit this saved profile. */
  providerId?: string | null;
  /** Start a new profile from this preset (`custom` for none). Nothing is chosen when absent. */
  presetId?: string | null;
  onBack?: () => void;
  /** After a save or a delete: the screen leaves. */
  onDone: () => void;
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; existing: ProviderView | null };

/** Settings → AI providers → a profile (flow E, steps 3 to 5). */
export function ProviderFormScreen({ providerId, presetId, onBack, onDone }: ProviderFormScreenProps) {
  const { t } = useTranslation();
  const { providers } = useServices();
  const [state, setState] = useState<State>(providerId ? { status: 'loading' } : { status: 'ready', existing: null });

  const read = useCallback(() => {
    if (!providerId) return;
    providers.get(providerId).then(
      (existing) => setState(existing ? { status: 'ready', existing } : { status: 'error' }),
      () => setState({ status: 'error' }),
    );
  }, [providers, providerId]);
  useEffect(read, [read]);

  if (state.status === 'ready') {
    const preset = getPreset(state.existing ? state.existing.preset : presetId);
    return <ProviderEditor existing={state.existing} preset={preset} onBack={onBack} onDone={onDone} />;
  }
  return (
    <ScreenFrame header={<TopBar title={t('providers.form.titleEdit')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        {state.status === 'loading' ? <Skeleton height={320} radius={24} /> : null}
        {state.status === 'error' ? (
          <ErrorState title={t('providers.form.titleEdit')} message={t('providers.form.loadError')}>
            <Button
              label={t('common.retry')}
              icon="retake"
              onPress={() => {
                setState({ status: 'loading' });
                read();
              }}
            />
          </ErrorState>
        ) : null}
      </View>
    </ScreenFrame>
  );
}

type Field = 'name' | 'baseUrl' | 'model' | 'timeout';
type TestState = { status: 'idle' } | { status: 'running' } | { status: 'done'; outcome: TestOutcome };
type ModelList = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; models: string[] } | { status: 'none' } | { status: 'storage' };

function ProviderEditor({ existing: initial, preset, onBack, onDone }: { existing: ProviderView | null; preset: Preset | undefined; onBack?: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const { providers } = useServices();
  const { notifyChange } = useSession();
  const snackbar = useSnackbar();

  // The profile as it really is in storage: refreshed after a save that only half worked, so the screen never claims more than is true.
  const [existing, setExisting] = useState<ProviderView | null>(initial);
  // Prefilled from the saved profile, or from preset data. A model is never prefilled.
  const [name, setName] = useState(existing?.label ?? (preset && preset.id !== 'custom' ? preset.name : ''));
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? preset?.baseUrl ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  const [timeoutText, setTimeoutText] = useState(String(existing?.timeoutS ?? DEFAULT_TIMEOUT_S));
  // Write-only: typed here, sent on save, emptied afterwards, and never filled from storage.
  const [apiKey, setApiKey] = useState('');
  const hasKey = existing?.hasKey ?? false;
  const isActive = existing?.isActive ?? false;
  const [firstProvider, setFirstProvider] = useState(false);
  const [touched, setTouched] = useState<Record<Field, boolean>>({ name: false, baseUrl: false, model: false, timeout: false });
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [modelList, setModelList] = useState<ModelList>({ status: 'idle' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<null | 'fix' | 'save' | 'key' | 'keyKept' | 'keyUnavailable'>(null);
  const [confirm, setConfirm] = useState<null | 'delete' | 'removeKey'>(null);

  const adapter: AiAdapterId = existing?.adapter ?? preset?.adapter ?? 'openai_compatible';
  // The request in flight for the test and for the model list; an edit or leaving the screen aborts it, and an answer
  // that is no longer the current request is dropped, so nothing shown or saved belongs to values it was not run for.
  const testRun = useRef<AbortController | null>(null);
  const listRun = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      testRun.current?.abort();
      listRun.current?.abort();
    },
    [],
  );
  // Only a person with no provider yet is told that this one becomes the active one.
  useEffect(() => {
    if (initial) return;
    let alive = true;
    providers.list().then(
      (list) => alive && setFirstProvider(list.length === 0),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [initial, providers]);

  const urlProblem = checkBaseUrl(baseUrl);
  const timeoutS = parseTimeout(timeoutText);
  const problems: Record<Field, string | null> = {
    name: name.trim() === '' ? t('providers.name.required') : null,
    baseUrl: urlProblem ? t(urlMessageKey(urlProblem)) : null,
    model: model.trim() === '' ? t('providers.model.required') : null,
    timeout: timeoutS === null ? t('providers.timeout.invalid') : null,
  };
  const shown = (field: Field) => (touched[field] ? problems[field] : null);
  const touch = (...fields: Field[]) => setTouched((current) => ({ ...current, ...Object.fromEntries(fields.map((f) => [f, true])) }));
  const keyWillClear = existing !== null && hasKey && normalizeBaseUrl(baseUrl) !== existing.baseUrl;

  // A shown result or list belongs to the values it was made with.
  const forgetTest = () => {
    testRun.current?.abort();
    testRun.current = null;
    setTest({ status: 'idle' });
    setProblem(null);
  };
  const forgetList = () => {
    listRun.current?.abort();
    listRun.current = null;
    setModelList({ status: 'idle' });
  };
  const changeBaseUrl = (value: string) => {
    setBaseUrl(value);
    forgetList();
    forgetTest();
  };
  const changeModel = (value: string) => {
    setModel(value);
    forgetTest();
  };
  const changeKey = (value: string) => {
    setApiKey(value);
    forgetList();
    forgetTest();
  };

  const draft = () => ({ id: existing?.id, adapter, baseUrl, model, timeoutS: timeoutS ?? DEFAULT_TIMEOUT_S, apiKey: apiKey || null });

  const runTest = async () => {
    touch('baseUrl', 'model', 'timeout');
    if (problems.baseUrl || problems.model || problems.timeout) return;
    testRun.current?.abort();
    const mine = new AbortController();
    testRun.current = mine;
    setTest({ status: 'running' });
    const current = () => testRun.current === mine && !mine.signal.aborted;
    try {
      const outcome = await providers.testConnection(draft(), mine.signal);
      if (current()) setTest({ status: 'done', outcome });
    } catch (error) {
      if (error instanceof CancelledError || !current()) return;
      setTest({ status: 'done', outcome: { ok: false, code: 'unknown' } });
    }
  };

  const findModels = async () => {
    touch('baseUrl');
    if (problems.baseUrl) return;
    listRun.current?.abort();
    const mine = new AbortController();
    listRun.current = mine;
    setModelList({ status: 'loading' });
    const models = await providers.listModels(draft(), mine.signal).catch((error: unknown) => (error instanceof SecretStoreError ? 'storage' : null));
    if (listRun.current !== mine || mine.signal.aborted) return; // stale: the values changed while it ran
    setModelList(models === 'storage' ? { status: 'storage' } : models ? { status: 'ready', models } : { status: 'none' });
  };

  const save = async () => {
    touch('name', 'baseUrl', 'model', 'timeout');
    if (problems.name || problems.baseUrl || problems.model || timeoutS === null) {
      setProblem('fix');
      return;
    }
    setBusy(true);
    setProblem(null);
    const fields = {
      label: name,
      preset: existing ? existing.preset : (preset?.id ?? null),
      adapter,
      baseUrl,
      model,
      timeoutS,
      apiKey: apiKey || null,
      test: test.status === 'done' ? test.outcome : null,
    };
    try {
      const result = existing ? await providers.update(existing.id, fields) : await providers.create(fields);
      setApiKey(''); // gone from the screen before anything else happens
      notifyChange();
      snackbar.show({ message: test.status === 'done' && !result.testRecorded ? t('providers.form.savedNoTest') : t('providers.form.saved') });
      onDone();
    } catch (error) {
      // Show what is really stored now: a save can fail after the profile was already written.
      let stored: ProviderView | null = existing;
      if (error instanceof ProviderSaveError) stored = error.provider;
      else if (existing) stored = await providers.get(existing.id).catch(() => existing);
      if (stored) setExisting(stored);
      if (error instanceof SecretStoreError && error.code === 'unavailable') setProblem('keyUnavailable');
      else if (error instanceof SecretStoreError || error instanceof ProviderSaveError) setProblem(stored ? 'keyKept' : 'key');
      else setProblem('save');
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!existing) return;
    try {
      await providers.setActive(existing.id);
      setExisting((current) => (current ? { ...current, isActive: true } : current));
      notifyChange();
    } catch {
      setProblem('save');
    }
  };

  const removeKey = async () => {
    if (!existing) return;
    setConfirm(null);
    try {
      await providers.removeKey(existing.id);
      setExisting((current) => (current ? { ...current, hasKey: false } : current));
      notifyChange();
      snackbar.show({ message: t('providers.key.removed') });
    } catch {
      snackbar.show({ message: t('providers.key.removeFailed') });
    }
  };

  const remove = async () => {
    if (!existing) return;
    setConfirm(null);
    try {
      await providers.remove(existing.id);
      notifyChange();
      onDone();
    } catch {
      snackbar.show({ message: t('providers.form.deleteFailed') });
    }
  };

  const open = (url: string) => void Promise.resolve().then(() => Linking.openURL(url)).catch(() => undefined);

  const suggestions =
    modelList.status === 'ready' ? { label: t('providers.form.suggestions'), models: modelList.models } : preset && preset.models.length > 0 ? { label: t('providers.form.presetSuggestions'), models: preset.models } : null;
  const shownModels = suggestions?.models.slice(0, MAX_SHOWN_MODELS) ?? [];

  const problemText =
    problem === 'fix' ? t('providers.form.fixErrors') : problem === 'key' ? t('providers.key.storeFailed') : problem === 'keyKept' ? t('providers.key.storeFailedSaved') : problem === 'keyUnavailable' ? t('providers.key.unavailable') : problem === 'save' ? t('providers.form.saveFailed') : null;

  return (
    <ScreenFrame
      header={<TopBar title={existing ? t('providers.form.titleEdit') : t('providers.form.titleNew')} onBack={onBack} backLabel={t('common.back')} />}
      footer={
        <ScreenFooter>
          {problemText ? (
            <AppText variant="bodySm" tone="warning" style={styles.center} accessibilityRole="alert">
              {problemText}
            </AppText>
          ) : null}
          <Button label={t('providers.form.save')} onPress={() => void save()} disabled={busy} />
        </ScreenFooter>
      }>
      <View style={styles.body}>
        {preset ? (
          <View style={[styles.notes, { backgroundColor: colors.surface }]}>
            <AppText variant="heading" accessibilityRole="header">
              {t('providers.form.costTitle')}
            </AppText>
            <AppText tone="muted">{noteIn(preset.cost, locale)}</AppText>
            <AppText variant="heading" accessibilityRole="header">
              {t('providers.form.dataTitle')}
            </AppText>
            <AppText tone="muted">{noteIn(preset.dataUse, locale)}</AppText>
            <AppText variant="bodySm" tone="muted">
              {t('providers.form.verified', { date: preset.lastVerified })}
            </AppText>
            {preset.termsUrl ? <Button label={t('providers.form.terms')} variant="ghost" onPress={() => open(preset.termsUrl)} /> : null}
            {preset.keyUrl ? <Button label={t('providers.form.getKey')} variant="ghost" onPress={() => open(preset.keyUrl)} /> : null}
          </View>
        ) : null}

        <TextField label={t('providers.form.name')} value={name} onChangeText={setName} onBlur={() => touch('name')} error={shown('name')} maxLength={60} />

        <TextField
          label={t('providers.form.baseUrl')}
          value={baseUrl}
          onChangeText={changeBaseUrl}
          onBlur={() => touch('baseUrl')}
          error={shown('baseUrl')}
          hint={preset?.baseUrlNote ? noteIn(preset.baseUrlNote, locale) : undefined}
          keyboardType="url"
          autoCapitalize="none"
        />

        <View style={styles.keyBlock}>
          <TextField label={t('providers.form.apiKey')} value={apiKey} onChangeText={changeKey} secret hint={hasKey ? t('providers.key.saved') : t('providers.key.hint')} />
          {keyWillClear ? (
            <AppText variant="bodySm" tone="warning" style={styles.indent}>
              {t('providers.key.willClear')}
            </AppText>
          ) : null}
          {hasKey ? (
            <Button label={t('providers.form.removeKey')} variant="secondary" onPress={() => setConfirm('removeKey')} />
          ) : existing ? (
            <AppText variant="bodySm" tone="muted" style={styles.indent}>
              {t('providers.key.none')}
            </AppText>
          ) : null}
        </View>

        <TextField
          label={t('providers.form.model')}
          value={model}
          onChangeText={changeModel}
          onBlur={() => touch('model')}
          error={shown('model')}
          hint={t('providers.form.modelHint')}
          autoCapitalize="none"
        />
        {suggestions && shownModels.length > 0 ? (
          <View style={styles.suggestions}>
            <ChoiceChips<string>
              label={suggestions.label}
              title
              options={shownModels.map((id) => ({ value: id, label: id }))}
              value={shownModels.includes(model) ? model : null}
              onChange={(value) => value && changeModel(value)}
            />
            {suggestions.models.length > MAX_SHOWN_MODELS ? (
              <AppText variant="bodySm" tone="muted" style={styles.indent}>
                {t('providers.form.moreModels', { count: MAX_SHOWN_MODELS, total: suggestions.models.length })}
              </AppText>
            ) : null}
          </View>
        ) : null}
        <Button
          label={t('providers.form.findModels')}
          variant="secondary"
          icon="search"
          onPress={() => void findModels()}
          disabled={modelList.status === 'loading'}
        />
        {modelList.status === 'none' ? <FieldMessage message={t('providers.form.noModelList')} /> : null}
        {modelList.status === 'storage' ? <FieldMessage message={t('providers.test.result.key_storage')} /> : null}

        <TextField
          label={t('providers.form.timeout')}
          value={timeoutText}
          onChangeText={(value) => {
            setTimeoutText(value);
            forgetTest();
          }}
          onBlur={() => touch('timeout')}
          error={shown('timeout')}
          hint={t('providers.form.timeoutHint')}
          suffix={t('providers.form.timeoutSuffix')}
          keyboardType="number-pad"
          maxLength={4}
        />

        <View style={styles.testBlock}>
          <Button
            label={test.status === 'running' ? t('providers.form.testing') : t('providers.form.test')}
            variant="secondary"
            icon="sparkle"
            onPress={() => void runTest()}
            disabled={test.status === 'running'}
          />
          <TestResult state={test} />
        </View>

        {!existing && firstProvider ? (
          <AppText variant="bodySm" tone="muted" style={styles.indent}>
            {t('providers.form.firstActive')}
          </AppText>
        ) : null}

        {existing ? (
          <View style={styles.manage}>
            {isActive ? (
              <View style={styles.activeRow}>
                <Icon name="check" size={20} color={colors.primaryText} />
                <AppText tone="muted">{t('providers.form.isActive')}</AppText>
              </View>
            ) : (
              <Button label={t('providers.form.setActive')} variant="secondary" onPress={() => void activate()} />
            )}
            <Button label={t('providers.form.delete')} variant="ghost" icon="trash" onPress={() => setConfirm('delete')} />
          </View>
        ) : null}
      </View>

      <ConfirmSheet
        visible={confirm === 'delete'}
        title={t('providers.delete.title')}
        body={t('providers.delete.body')}
        confirmLabel={t('providers.delete.confirm')}
        cancelLabel={t('providers.delete.keep')}
        closeLabel={t('common.close')}
        onConfirm={() => void remove()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmSheet
        visible={confirm === 'removeKey'}
        title={t('providers.key.removeTitle')}
        body={t('providers.key.removeBody')}
        confirmLabel={t('providers.key.removeConfirm')}
        cancelLabel={t('providers.key.keep')}
        closeLabel={t('common.close')}
        onConfirm={() => void removeKey()}
        onCancel={() => setConfirm(null)}
      />
    </ScreenFrame>
  );
}

/** Progress while the test runs, then one plainly worded message for the outcome, with an icon: never colour alone. */
function TestResult({ state }: { state: TestState }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (state.status === 'idle') return null;
  if (state.status === 'running') {
    return (
      <View style={styles.result} accessible accessibilityRole="progressbar" accessibilityLabel={t('providers.form.testing')}>
        <AppText tone="muted">{t('providers.form.testing')}</AppText>
      </View>
    );
  }
  const ok = state.outcome.ok;
  const message = t(testResultKey(state.outcome.ok ? 'ok' : state.outcome.code));
  return (
    <View
      style={[styles.result, styles.resultRow, { backgroundColor: ok ? colors.primarySoft : colors.warningSoft, borderColor: ok ? colors.primary : colors.warning }]}
      accessibilityRole={ok ? 'summary' : 'alert'}
      accessibilityLiveRegion="polite"
      testID="test-result">
      <Icon name={ok ? 'check' : 'alert'} size={22} color={ok ? colors.primaryText : colors.warning} />
      <AppText style={styles.resultText}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s2, paddingBottom: spacing.s6, gap: spacing.s4 },
  notes: { borderRadius: radius.lg, padding: spacing.s4, gap: spacing.s2 },
  keyBlock: { gap: spacing.s2 },
  suggestions: { gap: spacing.s2 },
  testBlock: { gap: spacing.s3 },
  result: { borderRadius: radius.lg, padding: spacing.s4 },
  resultRow: { flexDirection: 'row', gap: spacing.s3, alignItems: 'flex-start', borderWidth: 1.5 },
  resultText: { flex: 1 },
  manage: { gap: spacing.s3, paddingTop: spacing.s2 },
  activeRow: { flexDirection: 'row', gap: spacing.s2, alignItems: 'center', paddingHorizontal: spacing.s2 },
  indent: { paddingHorizontal: spacing.s2 },
  center: { textAlign: 'center' },
});
