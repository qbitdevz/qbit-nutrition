export type DataErrorCode =
  /** A migration failed; the database was left as it was before the attempt. */
  | 'migration_failed'
  /** The SQLite build refused `PRAGMA foreign_keys = ON`. */
  | 'foreign_keys_unavailable'
  | 'not_found'
  | 'invalid_input'
  /** A date outside what a record may have (`dayBounds`): before 2000, or more than two days after the device's date. */
  | 'date_out_of_range'
  /** A goal change that would rewrite or overlap an earlier period. */
  | 'goal_date_conflict'
  /** Moving a measurement onto a day that already has one of the same kind and source. */
  | 'measurement_conflict';

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
