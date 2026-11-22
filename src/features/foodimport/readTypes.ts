/** A cell as read: text as written, a number as a spreadsheet stores it, or nothing. */
export type Cell = string | number | null;

export interface Sheet {
  name: string;
  rows: Cell[][];
}

export type TableKind = 'csv' | 'xlsx' | 'xls';

export interface TableFile {
  fileName: string;
  kind: TableKind;
  /** Text files only. */
  encoding?: string;
  delimiter?: string;
  sheets: Sheet[];
}

/**
 * What a file may be before it is refused. Parsing happens in memory on a phone, so each number bounds something real:
 * the bytes read, what a workbook may unpack to, and the table's rows and columns. The messages the person sees name the limit.
 */
export const READ_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  /** All the parts of a workbook together, once unpacked ("zip bomb" guard: the sizes are read from the archive before anything is unpacked). */
  maxUnpackedBytes: 200 * 1024 * 1024,
  maxRowsPerSheet: 100_000,
  maxColumns: 300,
  maxSheets: 100,
} as const;

export type ReadLimits = { [K in keyof typeof READ_LIMITS]: number };

export type ImportReadErrorCode =
  | 'too_large'
  | 'unpacked_too_large'
  | 'too_many_rows'
  | 'too_many_columns'
  | 'too_many_sheets'
  | 'empty'
  | 'damaged'
  | 'unsupported'
  | 'cancelled';

export class ImportReadError extends Error {
  constructor(
    readonly code: ImportReadErrorCode,
    /** The limit that was exceeded, for the message. */
    readonly limit?: number,
  ) {
    super(code);
    this.name = 'ImportReadError';
  }
}

/** The person pressed Cancel: set `cancelled` and the reader stops at the next checkpoint. */
export interface CancelToken {
  cancelled: boolean;
}

export interface ReadOptions {
  limits?: Partial<ReadLimits>;
  cancel?: CancelToken;
  /** 0 to 1, called between steps; a long synchronous step reports before it starts. */
  onProgress?: (fraction: number) => void;
}

/** Gives the UI a turn (a spinner frame, a tap on Cancel) between two chunks of work. */
export const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export function throwIfCancelled(cancel: CancelToken | undefined): void {
  if (cancel?.cancelled) throw new ImportReadError('cancelled');
}
