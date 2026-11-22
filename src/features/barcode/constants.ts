/** A cached product older than this is refreshed the next time it is looked up (docs/08 `barcode_product`: "entries refresh after a set age"). */
export const BARCODE_CACHE_MAX_AGE_DAYS = 30;
export const BARCODE_CACHE_MAX_AGE_MS = BARCODE_CACHE_MAX_AGE_DAYS * 86_400_000;

/**
 * Open Food Facts allows 15 product reads a minute per user for a mobile app (docs/09 section 2.6). The app keeps
 * itself inside that: after this many requests in the window it stops asking (and says so) instead of sending one more.
 */
export const LOOKUP_LIMIT = { perWindow: 15, windowMs: 60_000 } as const;

/**
 * `setting` key of the one-time "this number is sent to Open Food Facts" notice (S9). The `notice_ack.` prefix makes it
 * an acknowledgement for the export and import rules: consent given on one installation, never carried to another.
 */
export const BARCODE_NOTICE_KEY = 'notice_ack.barcode';
