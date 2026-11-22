import type { BarcodeLookupError } from '@/core/barcode';
import type { IconName } from '@/ui';

/** What each failed lookup shows: its message key (under `barcode.failure.`), its icon, and what it offers. */
export interface LookupFailurePlan {
  titleKey: string;
  messageKey: string;
  /** The message with the wait in it, when the service said how long. */
  messageWaitKey?: string;
  icon: IconName;
  /** "Create custom food" is offered where the product itself is the problem. */
  offerCustomFood: boolean;
  /** "Try again" makes sense: the same number may work in a moment. */
  retry: boolean;
}

export function planFor(error: BarcodeLookupError): LookupFailurePlan {
  const base = `barcode.failure.${error.code}`;
  switch (error.code) {
    case 'not_found':
      return { titleKey: `${base}.title`, messageKey: `${base}.message`, icon: 'search', offerCustomFood: true, retry: false };
    case 'no_network':
      return { titleKey: `${base}.title`, messageKey: `${base}.message`, icon: 'alert', offerCustomFood: true, retry: true };
    case 'timeout':
      return { titleKey: `${base}.title`, messageKey: `${base}.message`, icon: 'clock', offerCustomFood: true, retry: true };
    case 'rate_limited':
      return {
        titleKey: `${base}.title`,
        messageKey: `${base}.message`,
        messageWaitKey: error.retryAfterS ? `${base}.messageWait` : undefined,
        icon: 'clock',
        offerCustomFood: true,
        retry: true,
      };
    case 'service_error':
      return { titleKey: `${base}.title`, messageKey: `${base}.message`, icon: 'alert', offerCustomFood: true, retry: true };
    case 'invalid_code':
      return { titleKey: `${base}.title`, messageKey: `${base}.message`, icon: 'alert', offerCustomFood: false, retry: false };
  }
}
