import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { DataError } from '../errors';
import { bodyMeasurement } from '../schema';
import { VALUE_LIMITS, requireWithin } from './limits';
import { invalid, requireLocalDate, type RepositoryContext } from './shared';

export type Measurement = typeof bodyMeasurement.$inferSelect;

export interface MeasurementInput {
  measuredOn: string;
  kind: Measurement['kind'];
  /** kg, cm or percent according to `kind`. */
  value: number;
  /** Default `manual`. */
  source?: Measurement['source'];
}

export interface MeasurementRepository {
  /**
   * Records a measurement. (`measuredOn`, `kind`, `source`) is unique, so recording again the
   * same day from the same source replaces the value and keeps the id.
   */
  record(input: MeasurementInput): Promise<Measurement>;
  /** One kind, oldest first, optionally limited to a local-date range (inclusive). */
  list(kind: Measurement['kind'], range?: { from?: string; to?: string }): Promise<Measurement[]>;
  latest(kind: Measurement['kind']): Promise<Measurement | null>;
  /**
   * Edits one entry (its value, its day, or both) and keeps its id, kind and source. Moving it onto a
   * day that already has that kind and source is a `measurement_conflict` and changes nothing.
   */
  update(id: string, patch: { measuredOn?: string; value?: number }): Promise<Measurement>;
  delete(id: string): Promise<void>;
}

export function createMeasurementRepository({ db, newId }: RepositoryContext): MeasurementRepository {
  return {
    async record(input) {
      requireLocalDate(input.measuredOn, 'measuredOn');
      if (!Number.isFinite(input.value) || input.value <= 0) {
        throw invalid(`value must be a positive finite number, got ${input.value}`);
      }
      requireWithin(input.value, VALUE_LIMITS.measurement[input.kind], `${input.kind} value`);
      const source = input.source ?? 'manual';
      return db.transaction((tx) => {
        tx.insert(bodyMeasurement)
          .values({ id: newId(), measuredOn: input.measuredOn, kind: input.kind, value: input.value, source })
          .onConflictDoUpdate({
            target: [bodyMeasurement.measuredOn, bodyMeasurement.kind, bodyMeasurement.source],
            set: { value: input.value },
          })
          .run();
        return tx
          .select()
          .from(bodyMeasurement)
          .where(
            and(
              eq(bodyMeasurement.measuredOn, input.measuredOn),
              eq(bodyMeasurement.kind, input.kind),
              eq(bodyMeasurement.source, source),
            ),
          )
          .get()!;
      });
    },

    async list(kind, range = {}) {
      return db
        .select()
        .from(bodyMeasurement)
        .where(
          and(
            eq(bodyMeasurement.kind, kind),
            range.from ? gte(bodyMeasurement.measuredOn, range.from) : undefined,
            range.to ? lte(bodyMeasurement.measuredOn, range.to) : undefined,
          ),
        )
        .orderBy(asc(bodyMeasurement.measuredOn), asc(bodyMeasurement.source))
        .all();
    },

    async latest(kind) {
      return (
        db
          .select()
          .from(bodyMeasurement)
          .where(eq(bodyMeasurement.kind, kind))
          .orderBy(desc(bodyMeasurement.measuredOn), asc(bodyMeasurement.source))
          .limit(1)
          .get() ?? null
      );
    },

    async update(id, patch) {
      if (patch.measuredOn !== undefined) requireLocalDate(patch.measuredOn, 'measuredOn');
      if (patch.value !== undefined && (!Number.isFinite(patch.value) || patch.value <= 0)) {
        throw invalid(`value must be a positive finite number, got ${patch.value}`);
      }
      return db.transaction((tx) => {
        const current = tx.select().from(bodyMeasurement).where(eq(bodyMeasurement.id, id)).get();
        if (!current) throw new DataError('not_found', `measurement not found: ${id}`);
        if (patch.value !== undefined) requireWithin(patch.value, VALUE_LIMITS.measurement[current.kind], `${current.kind} value`);
        const measuredOn = patch.measuredOn ?? current.measuredOn;
        if (measuredOn !== current.measuredOn) {
          const taken = tx
            .select({ id: bodyMeasurement.id })
            .from(bodyMeasurement)
            .where(
              and(eq(bodyMeasurement.measuredOn, measuredOn), eq(bodyMeasurement.kind, current.kind), eq(bodyMeasurement.source, current.source)),
            )
            .get();
          if (taken) throw new DataError('measurement_conflict', `There is already a ${current.kind} entry on ${measuredOn}.`);
        }
        tx.update(bodyMeasurement)
          .set({ measuredOn, value: patch.value ?? current.value })
          .where(eq(bodyMeasurement.id, id))
          .run();
        return tx.select().from(bodyMeasurement).where(eq(bodyMeasurement.id, id)).get()!;
      });
    },

    async delete(id) {
      const removed = db.delete(bodyMeasurement).where(eq(bodyMeasurement.id, id)).returning({ id: bodyMeasurement.id }).all();
      if (removed.length === 0) throw new DataError('not_found', `measurement not found: ${id}`);
    },
  };
}
