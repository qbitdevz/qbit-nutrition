import { desc, eq } from 'drizzle-orm';
import { scan, SCAN_STATUSES } from '../schema';
import { invalid, type RepositoryContext } from './shared';

export type Scan = typeof scan.$inferSelect;

export interface RecordScanInput {
  /** The profile used; the row keeps working when it is deleted later (`providerLabel` and `model` are copies). */
  providerId: string | null;
  providerLabel: string;
  model: string;
  /** The version of the prompt that was sent (core's `PROMPT_VERSION`). */
  promptVersion: string | number;
  status: (typeof SCAN_STATUSES)[number];
  /** Provider error code, or a scan-level one (`cancelled`, `image_failed`, `provider_changed`, ...). Never a message. */
  errorCode?: string | null;
  hint?: string | null;
  /** The validated model output as JSON text. */
  resultJson?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  repaired?: boolean;
}

/** `scan` in app.db: one row per analysis request, failed and canceled ones included (docs/08). */
export interface ScanRepository {
  record(input: RecordScanInput): Promise<Scan>;
  get(id: string): Promise<Scan | null>;
  /** Newest first. */
  list(limit?: number): Promise<Scan[]>;
}

export function createScanRepository({ db, now, newId }: RepositoryContext): ScanRepository {
  return {
    async record(input) {
      if (!(SCAN_STATUSES as readonly string[]).includes(input.status)) throw invalid(`unknown scan status "${input.status}"`);
      const values = (providerId: string | null): typeof scan.$inferInsert => ({
        id: newId(),
        createdAt: now().toISOString(),
        providerId,
        providerLabel: input.providerLabel,
        model: input.model,
        promptVersion: String(input.promptVersion),
        status: input.status,
        errorCode: input.errorCode ?? null,
        hint: input.hint ?? null,
        resultJson: input.resultJson ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        latencyMs: input.latencyMs ?? null,
        repaired: input.repaired ? 1 : 0,
      });
      try {
        return db.insert(scan).values(values(input.providerId)).returning().get();
      } catch (error) {
        // The profile was deleted while the request ran: the attempt is still worth a row.
        if (input.providerId === null) throw error;
        return db.insert(scan).values(values(null)).returning().get();
      }
    },

    async get(id) {
      return db.select().from(scan).where(eq(scan.id, id)).get() ?? null;
    },

    async list(limit = 50) {
      return db.select().from(scan).orderBy(desc(scan.createdAt), desc(scan.id)).limit(limit).all();
    },
  };
}
