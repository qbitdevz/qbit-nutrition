import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { CancelledError } from '@/core/ai';
import { BarcodeLookupError, isComplete } from '@/core/barcode';
import type { BarcodeProductRecord } from '@/data';
import type { Locale } from '@/i18n/locale';
import { AppText, Button, ErrorState, ScreenFrame, Skeleton, TopBar, layout, spacing } from '@/ui';
import { useMealDraft } from '../logging/draft';
import type { FoodRow } from '../logging/foods';
import { PortionSheet } from '../logging/PortionSheet';
import { useServices } from '../startup/AppProvider';
import type { LookupOutcome } from './barcodeService';
import { BarcodeNotice } from './BarcodeNotice';
import { planFor } from './failures';
import { IncompleteForm } from './IncompleteForm';
import { ProductView } from './ProductView';
import { ScanPanel } from './ScanPanel';

interface BarcodeScreenProps {
  /** An item was added to the meal: the route moves on to the review screen. */
  onAdded: () => void;
  /** "Create custom food", for a product that cannot be found. */
  onCreateCustom: () => void;
  onBack?: () => void;
}

type Phase =
  | { kind: 'entry' }
  | { kind: 'loading'; code: string }
  | { kind: 'result'; outcome: LookupOutcome }
  | { kind: 'failed'; error: BarcodeLookupError; code: string };

const rowOf = (product: BarcodeProductRecord): FoodRow => ({
  ref: { source: 'barcode', id: product.barcode },
  name: product.name,
  kcal100g: product.per100g.kcal ?? 0,
  protein100g: product.per100g.protein ?? 0,
  carbs100g: product.per100g.carbs ?? 0,
  fat100g: product.per100g.fat ?? 0,
  custom: false,
  barcode: true,
});

/**
 * The barcode path of manual logging (S5, FR-34): read or type the number, look it up once, then choose an amount for
 * the product (or complete it first when Open Food Facts only partly knows it). One lookup per action: the number is
 * checked on the device, the one-time notice says where it goes (S9), and a wrong number never leaves the phone.
 */
export function BarcodeScreen({ onAdded, onCreateCustom, onBack }: BarcodeScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { barcode } = useServices();
  const draft = useMealDraft();

  const [phase, setPhase] = useState<Phase>({ kind: 'entry' });
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [portion, setPortion] = useState<FoodRow | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  const lookup = useCallback(
    async (code: string) => {
      const abort = new AbortController();
      controller.current = abort;
      setTyped(code);
      setPhase({ kind: 'loading', code });
      try {
        const outcome = await barcode.lookup(code, { locale, signal: abort.signal });
        if (!alive.current) return;
        setPhase({ kind: 'result', outcome });
        // A complete product goes straight to choosing the amount; an incomplete one is completed first.
        if (isComplete(outcome.product)) setPortion(rowOf(outcome.product));
      } catch (error) {
        if (!alive.current || error instanceof CancelledError) return;
        setPhase({ kind: 'failed', code, error: error instanceof BarcodeLookupError ? error : new BarcodeLookupError('service_error') });
      } finally {
        busy.current = false;
      }
    },
    [barcode, locale],
  );

  /** A valid barcode from the camera or the field: the first lookup asks, once, whether the number may be sent. */
  const request = useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      let acknowledged = false;
      try {
        acknowledged = await barcode.noticeAcknowledged();
      } catch {
        // If the acknowledgement cannot be read, the notice is shown (it can only err towards telling the person).
      }
      if (!alive.current) return;
      if (!acknowledged) {
        busy.current = false;
        setTyped(code);
        setNotice(code);
        return;
      }
      await lookup(code);
    },
    [barcode, lookup],
  );

  const continueNotice = async () => {
    const code = notice;
    if (!code || busy.current) return;
    busy.current = true;
    try {
      await barcode.acknowledgeNotice();
    } catch {
      // The lookup still goes ahead: the person said yes. The notice will simply be shown again next time.
    }
    setNotice(null);
    await lookup(code);
  };

  const cancelLookup = () => {
    controller.current?.abort();
    busy.current = false;
    setPhase({ kind: 'entry' });
  };

  const saveValues = async (outcome: LookupOutcome, values: Parameters<typeof barcode.saveEdited>[1]) => {
    const product = await barcode.saveEdited(outcome.product.barcode, values);
    if (!alive.current) return;
    setPhase({ kind: 'result', outcome: { ...outcome, product } });
    setPortion(rowOf(product));
  };

  const onPortionAdd = (item: Parameters<ComponentProps<typeof PortionSheet>['onAdd']>[0]) => {
    draft.addItem(item);
    onAdded();
  };

  return (
    <ScreenFrame header={<TopBar title={t('barcode.title')} onBack={onBack} backLabel={t('common.back')} />}>
      <View style={styles.body}>
        {phase.kind === 'entry' ? <ScanPanel onCode={(code) => void request(code)} initialText={typed} paused={notice !== null} /> : null}

        {phase.kind === 'loading' ? (
          <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLiveRegion="polite" accessibilityLabel={t('barcode.loading', { code: phase.code })} testID="barcode-loading">
            <Skeleton height={96} radius={20} />
            <Skeleton width="60%" height={18} radius={9} />
            <AppText variant="itemName">{t('barcode.loading', { code: phase.code })}</AppText>
            <AppText variant="bodySm" tone="muted">
              {t('barcode.loadingHint')}
            </AppText>
            <Button label={t('common.cancel')} variant="secondary" onPress={cancelLookup} testID="barcode-cancel" />
          </View>
        ) : null}

        {phase.kind === 'result' && isComplete(phase.outcome.product) ? (
          <ProductView
            product={phase.outcome.product}
            stale={phase.outcome.stale}
            locale={locale}
            onChoose={() => setPortion(rowOf(phase.outcome.product))}
            onScanAnother={() => setPhase({ kind: 'entry' })}
          />
        ) : null}
        {phase.kind === 'result' && !isComplete(phase.outcome.product) ? (
          <IncompleteForm product={phase.outcome.product} locale={locale} onSave={(values) => saveValues(phase.outcome, values)} />
        ) : null}

        {phase.kind === 'failed' ? <Failure error={phase.error} onRetry={() => void request(phase.code)} onTypeAnother={() => setPhase({ kind: 'entry' })} onCreateCustom={onCreateCustom} /> : null}
      </View>

      <BarcodeNotice code={notice} onContinue={() => void continueNotice()} onDecline={() => setNotice(null)} />
      <PortionSheet food={portion} onClose={() => setPortion(null)} onAdd={onPortionAdd} />
    </ScreenFrame>
  );
}

function Failure({ error, onRetry, onTypeAnother, onCreateCustom }: { error: BarcodeLookupError; onRetry: () => void; onTypeAnother: () => void; onCreateCustom: () => void }) {
  const { t } = useTranslation();
  const plan = planFor(error);
  const message = plan.messageWaitKey ? t(plan.messageWaitKey, { seconds: error.retryAfterS }) : t(plan.messageKey);
  return (
    <ErrorState title={t(plan.titleKey)} message={message} icon={plan.icon}>
      {plan.retry ? <Button label={t('common.retry')} icon="retake" onPress={onRetry} testID="barcode-retry" /> : null}
      <Button label={t('barcode.failure.typeAnother')} variant="secondary" icon="barcode" onPress={onTypeAnother} testID="barcode-type-another" />
      {plan.offerCustomFood ? <Button label={t('barcode.failure.create')} variant="secondary" icon="plus" onPress={onCreateCustom} testID="barcode-create-custom" /> : null}
    </ErrorState>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.s2, paddingBottom: spacing.s8, gap: spacing.s4 },
  loading: { gap: spacing.s3 },
});
