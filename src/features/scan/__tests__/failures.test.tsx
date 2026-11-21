import { cleanup, fireEvent, screen } from '@testing-library/react-native';

import { CancelledError, NoFoodDetectedError, ProviderError } from '@/core/ai';
import type { ProviderErrorCode } from '@/core/ai';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { SecretStoreError } from '@/platform/secretStore';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { FailureView } from '../FailureView';
import { classifyFailure, type FailureKind } from '../failures';
import { ScanSetupError } from '../scanGateway';
import { waitParts } from '../waitTime';

describe('classifyFailure', () => {
  it.each<[ProviderErrorCode, FailureKind]>([
    ['no_network', 'no_network'],
    ['timeout', 'timeout'],
    ['auth_invalid', 'auth_invalid'],
    ['model_not_found', 'model_not_found'],
    ['no_vision', 'no_vision'],
    ['quota_exceeded', 'quota'],
    ['provider_unavailable', 'provider_unavailable'],
    ['content_refused', 'no_food'],
    ['invalid_output', 'invalid_output'],
    ['insecure_url', 'insecure_url'],
  ])('maps the provider code %s to %s', (code, kind) => {
    const { failure } = classifyFailure(new ProviderError(code));
    expect(failure.kind).toBe(kind);
  });

  it('maps the scan-level errors', () => {
    expect(classifyFailure(new ScanSetupError('no_provider'))).toMatchObject({ failure: { kind: 'no_provider' }, errorCode: 'no_provider' });
    expect(classifyFailure(new ScanSetupError('provider_changed'))).toMatchObject({ failure: { kind: 'provider_changed' }, errorCode: 'provider_changed' });
    expect(classifyFailure(new NoFoodDetectedError())).toMatchObject({ failure: { kind: 'no_food' }, status: 'no_food', errorCode: null });
    expect(classifyFailure(new CancelledError())).toMatchObject({ errorCode: 'cancelled' });
    expect(classifyFailure(new SecretStoreError('failed', 'x'))).toMatchObject({ failure: { kind: 'unknown' }, errorCode: 'secret_store' });
  });

  it('keeps the wait of a limit, and redacts the detail of an unknown error', () => {
    expect(classifyFailure(new ProviderError('quota_exceeded', { retryAfterS: 90 })).failure.retryAfterS).toBe(90);
    const { failure } = classifyFailure(new Error('went wrong with Bearer abc.def-ghi and sk-ABCDEFGHIJKLMNOP'));
    expect(failure.kind).toBe('unknown');
    expect(failure.detail).not.toContain('abc.def-ghi');
    expect(failure.detail).not.toContain('sk-ABCDEFGHIJKLMNOP');
  });

  it('shows no technical detail for the causes that have their own message', () => {
    expect(classifyFailure(new ProviderError('auth_invalid', { detail: 'secret detail' })).failure.detail).toBeUndefined();
  });
});

describe('waitParts', () => {
  it('rounds up to the next minute', () => {
    expect(waitParts(7800)).toEqual({ hours: 2, minutes: 10 });
    expect(waitParts(1)).toEqual({ hours: 0, minutes: 1 });
    expect(waitParts(3600)).toEqual({ hours: 1, minutes: 0 });
    expect(waitParts(61)).toEqual({ hours: 0, minutes: 2 });
  });
});

const KINDS: FailureKind[] = ['no_provider', 'no_network', 'auth_invalid', 'quota', 'no_vision', 'model_not_found', 'invalid_output', 'no_food', 'provider_changed', 'insecure_url', 'timeout', 'provider_unavailable', 'photo_unreadable', 'unknown'];

describe('FailureView: one screen per cause (S8)', () => {
  let h: Harness;
  let services: ReturnType<typeof createTestServices>;
  beforeEach(async () => {
    h = await createHarness();
    services = createTestServices(h);
  });
  afterEach(async () => {
    await cleanup();
    services.close();
    h.close();
    await i18n.changeLanguage('en');
  });

  describe.each(['en', 'es'] as const)('in %s', (locale) => {
    it.each(KINDS)('%s: its own title and message, the photo, and "Add manually"', async (kind) => {
      const onAction = jest.fn();
      await renderApp(<FailureView failure={{ kind, providerLabel: 'Mine', detail: 'detail' }} photoUri="file:///cache/p.jpg" onAction={onAction} onClose={jest.fn()} />, { services, locale });
      expect(await screen.findByText(i18n.t(`scan.failure.${kind}.title`))).toBeOnTheScreen();
      expect(screen.getByText(i18n.t(`scan.failure.${kind}.message`))).toBeOnTheScreen();
      expect(screen.getByTestId('failure-photo')).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId('failure-manual'));
      expect(onAction).toHaveBeenCalledWith('manual');
    });
  });

  it('gives every cause a different title', async () => {
    for (const locale of ['en', 'es']) {
      const titles = KINDS.map((kind) => i18n.t(`scan.failure.${kind}.title`, { lng: locale }));
      expect(new Set(titles).size).toBe(KINDS.length);
      expect(titles.every((title) => !title.includes('scan.failure'))).toBe(true);
    }
  });
});
