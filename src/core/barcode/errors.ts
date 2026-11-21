/** Why a barcode lookup did not give a product. Each code has its own message in the app (docs/09 section 2.6). */
export type BarcodeLookupErrorCode =
  /** The text is not a barcode of a product format, or its check digit is wrong: nothing was sent. */
  | 'invalid_code'
  /** The service has no product with this barcode. */
  | 'not_found'
  /** The request never reached the service. */
  | 'no_network'
  | 'timeout'
  /** The service (or the local guard that keeps the person inside the service's limit) says too many lookups. */
  | 'rate_limited'
  /** HTTP 5xx, an answer that could not be read, or a refused redirect. */
  | 'service_error';

export class BarcodeLookupError extends Error {
  readonly code: BarcodeLookupErrorCode;
  /** Seconds until the limit resets, when known (`rate_limited`). */
  readonly retryAfterS?: number;

  constructor(code: BarcodeLookupErrorCode, options: { retryAfterS?: number } = {}) {
    super(code);
    this.name = 'BarcodeLookupError';
    this.code = code;
    this.retryAfterS = options.retryAfterS;
    Object.setPrototypeOf(this, BarcodeLookupError.prototype);
  }
}
