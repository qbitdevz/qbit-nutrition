export type DataErrorCode =
  /** A migration failed; the database was left as it was before the attempt. */
  | 'migration_failed'
  /** The SQLite build refused `PRAGMA foreign_keys = ON`. */
  | 'foreign_keys_unavailable'
  | 'not_found'
  | 'invalid_input'
  /** A goal change that would rewrite or overlap an earlier period. */
  | 'goal_date_conflict';

/** Typed error of the data layer (docs/08 section 8: surfaced to a recovery screen). */
export class DataError extends Error {
  constructor(
    public readonly code: DataErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DataError';
  }
}

export function isDataError(error: unknown, code?: DataErrorCode): error is DataError {
  return error instanceof DataError && (code === undefined || error.code === code);
}
