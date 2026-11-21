import { deriveMealTime, type Repositories } from '@/data';
import type { HealthAvailability, HealthGrant, HealthGrants, HealthPlatform } from '@/platform/healthPlatform';
import { nutritionRecordForMeal } from './record';

/** `setting` keys of the integration. None is in the export whitelist (`settingsPolicy.ts`): it is this installation's own state. */
export const HEALTH_ENABLED_KEY = 'health_connect.enabled';
export const HEALTH_PENDING_KEY = 'health_connect.pending';
export const HEALTH_SEEN_KEY = 'health_connect.granted';
export const HEALTH_WEIGHT_SYNCED_KEY = 'health_connect.weight_synced_at';
export const HEALTH_SETTING_KEYS = [HEALTH_ENABLED_KEY, HEALTH_PENDING_KEY, HEALTH_SEEN_KEY, HEALTH_WEIGHT_SYNCED_KEY] as const;

/** Health Connect lets an app read other apps' data from 30 days before its first grant (docs: "Read data older than 30 days"). */
export const WEIGHT_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

/** Per grant: given now, taken away after being given (revoked in system settings), or never given. */
export type GrantState = 'granted' | 'revoked' | 'not_granted';

export interface HealthStatus {
  enabled: boolean;
  /** Null while the integration is off: nothing is asked of the system then. */
  availability: HealthAvailability | null;
  /** Null while off, when Health Connect is not available, or when it could not be reached. */
  grants: Record<HealthGrant, GrantState> | null;
  /** Meals whose record is waiting to be written, updated, or deleted. */
  pending: number;
  /** The last attempt to write failed (or Health Connect could not be reached). */
  failing: boolean;
  /** ISO time of the last weight import, if any. */
  lastWeightSyncAt: string | null;
}

export type TurnOnOutcome = 'on' | 'declined' | 'unavailable';

export interface HealthSync {
  /** A settings read only: never calls the platform. */
  isEnabled(): Promise<boolean>;
  status(): Promise<HealthStatus>;
  /**
   * The person saw the rationale and agreed: checks availability, asks for both grants (each can be declined), and starts.
   * If neither is granted the integration stays off.
   */
  turnOn(): Promise<{ outcome: TurnOnOutcome; status: HealthStatus }>;
  /** Stops all syncing and forgets the queue. Records already in Health Connect stay there. */
  turnOff(): Promise<void>;
  /** Asks for one grant again (after it was declined or revoked). */
  requestGrant(grant: HealthGrant): Promise<HealthStatus>;
  /** A meal was saved or edited. Never throws: a failure leaves the record pending. */
  mealChanged(mealId: string): Promise<void>;
  /** A meal was deleted. Never throws: a failure leaves the delete pending. */
  mealDeleted(mealId: string): Promise<void>;
  /** Tries the pending records again, then reads weights. */
  retry(): Promise<HealthStatus>;
  /** Reads recent weights into the weight log. Returns how many entries were added, changed or removed. */
  syncWeight(): Promise<number>;
  /** The person asked for it: queues every saved meal to be written. Returns how many. */
  sendExistingMeals(): Promise<number>;
  /** Deletes the records this app wrote and forgets the queue. Rejects when Health Connect refuses. */
  removeWrittenRecords(): Promise<void>;
  /** Resolves when everything queued so far has been tried. For tests and for the screen. */
  idle(): Promise<void>;
  openSettings(): void;
  openInstall(): void;
}

interface Pending {
  upsert: string[];
  remove: string[];
}

interface Deps {
  repos: Pick<Repositories, 'settings' | 'meals' | 'measurements'>;
  platform: HealthPlatform;
  now?: () => Date;
}

const NONE: HealthGrants = { writeNutrition: false, readWeight: false };
const OFF: HealthStatus = { enabled: false, availability: null, grants: null, pending: 0, failing: false, lastWeightSyncAt: null };

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The Health Connect integration (S7, docs/09 section 2.7): writes saved meals as nutrition records, keyed by meal id, and
 * reads weights into `body_measurement` with source `health_connect`. While it is off, nothing here calls the platform.
 * Everything that touches the queue runs one at a time, so a flush never races a new change.
 */
export function createHealthSync({ repos, platform, now = () => new Date() }: Deps): HealthSync {
  const { settings } = repos;
  let chain: Promise<unknown> = Promise.resolve();
  let failing = false;

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  };

  const enabled = async () => (await settings.get(HEALTH_ENABLED_KEY)) === 'true';

  const readPending = async (): Promise<Pending> => {
    const raw = parseJson<Partial<Pending>>(await settings.get(HEALTH_PENDING_KEY));
    return { upsert: strings(raw?.upsert), remove: strings(raw?.remove) };
  };
  const writePending = async (pending: Pending) => {
    if (pending.upsert.length === 0 && pending.remove.length === 0) await settings.remove(HEALTH_PENDING_KEY);
    else await settings.set(HEALTH_PENDING_KEY, JSON.stringify(pending));
  };

  const readSeen = async (): Promise<HealthGrants> => ({ ...NONE, ...(parseJson<Partial<HealthGrants>>(await settings.get(HEALTH_SEEN_KEY)) ?? {}) });

  /** Remembers which grants were ever seen, to tell "revoked" from "never given". Returns the states for the current grants. */
  const noteGrants = async (current: HealthGrants): Promise<Record<HealthGrant, GrantState>> => {
    const seen = await readSeen();
    const next: HealthGrants = { writeNutrition: seen.writeNutrition || current.writeNutrition, readWeight: seen.readWeight || current.readWeight };
    if (next.writeNutrition !== seen.writeNutrition || next.readWeight !== seen.readWeight) await settings.set(HEALTH_SEEN_KEY, JSON.stringify(next));
    const state = (grant: HealthGrant): GrantState => (current[grant] ? 'granted' : seen[grant] ? 'revoked' : 'not_granted');
    return { writeNutrition: state('writeNutrition'), readWeight: state('readWeight') };
  };

  const currentGrants = async (): Promise<HealthGrants | null> => {
    try {
      const grants = await platform.grantedPermissions();
      await noteGrants(grants);
      return grants;
    } catch {
      failing = true;
      return null;
    }
  };

  /** Writes what is pending. Stops at the first failure (Health Connect is busy or locked), leaving the rest queued. */
  const flush = async (): Promise<void> => {
    if (!(await enabled())) return;
    const pending = await readPending();
    if (pending.upsert.length === 0 && pending.remove.length === 0) return;
    const grants = await currentGrants();
    if (!grants) return;
    if (!grants.writeNutrition) {
      failing = true;
      return;
    }
    let broke = false;
    const left: Pending = { upsert: [...pending.upsert], remove: [...pending.remove] };
    try {
      for (const id of pending.remove) {
        await platform.deleteNutrition([id]);
        left.remove = left.remove.filter((x) => x !== id);
      }
      for (const id of pending.upsert) {
        const meal = await repos.meals.getMeal(id);
        // Deleted in the meantime: the record, if it was ever written, goes too.
        if (!meal) await platform.deleteNutrition([id]);
        else await platform.writeNutrition(nutritionRecordForMeal(meal));
        left.upsert = left.upsert.filter((x) => x !== id);
      }
    } catch {
      broke = true;
    }
    failing = broke;
    await writePending(left);
  };

  const change = (kind: 'upsert' | 'remove', mealId: string) =>
    enqueue(async () => {
      try {
        if (!(await enabled())) return;
        const pending = await readPending();
        // Without a write grant ever seen, nothing was written and nothing can need deleting: not queued for ever
        // (the person can send the existing meals later).
        if (!(await readSeen()).writeNutrition && !pending.upsert.includes(mealId) && !pending.remove.includes(mealId)) return;
        const keep = (list: string[]) => list.filter((x) => x !== mealId);
        const next: Pending =
          kind === 'upsert'
            ? { upsert: [...keep(pending.upsert), mealId], remove: keep(pending.remove) }
            : { upsert: keep(pending.upsert), remove: [...keep(pending.remove), mealId] };
        await writePending(next);
        await flush();
      } catch {
        // Bookkeeping must never reach the person who saved a meal.
      }
    });

  const syncWeight = async (): Promise<number> => {
    if (!(await enabled())) return 0;
    const grants = await currentGrants();
    if (!grants?.readWeight) return 0;
    const to = now();
    const from = new Date(to.getTime() - WEIGHT_WINDOW_DAYS * DAY_MS);
    let readings;
    try {
      readings = await platform.readWeights({ from, to });
    } catch {
      failing = true;
      return 0;
    }
    // One entry per local day: the latest reading of the day.
    const byDay = new Map<string, { at: number; kg: number }>();
    for (const { time, kg } of readings) {
      const at = Date.parse(time);
      if (!Number.isFinite(at) || !Number.isFinite(kg) || kg <= 0) continue;
      const day = deriveMealTime(new Date(at)).localDate;
      const prior = byDay.get(day);
      if (!prior || at > prior.at) byDay.set(day, { at, kg: round2(kg) });
    }
    // Only this source's rows are compared and replaced; manual entries are never touched.
    const windowStart = deriveMealTime(from).localDate;
    const mine = (await repos.measurements.list('weight', { from: windowStart })).filter((m) => m.source === 'health_connect');
    const existing = new Map(mine.map((m) => [m.measuredOn, m]));
    let changed = 0;
    for (const [day, { kg }] of byDay) {
      if (existing.get(day)?.value === kg) continue;
      await repos.measurements.record({ measuredOn: day, kind: 'weight', value: kg, source: 'health_connect' });
      changed += 1;
    }
    // A day inside the window that Health Connect no longer has (the person deleted it there). The first, partial day is left alone.
    for (const row of mine) {
      if (row.measuredOn > windowStart && !byDay.has(row.measuredOn)) {
        await repos.measurements.delete(row.id);
        changed += 1;
      }
    }
    await settings.set(HEALTH_WEIGHT_SYNCED_KEY, to.toISOString());
    return changed;
  };

  const status = async (): Promise<HealthStatus> => {
    if (!(await enabled())) return OFF;
    let availability: HealthAvailability;
    try {
      availability = await platform.availability();
    } catch {
      availability = 'unavailable';
    }
    let grants: HealthStatus['grants'] = null;
    if (availability === 'available') {
      try {
        grants = await noteGrants(await platform.grantedPermissions());
      } catch {
        failing = true;
      }
    }
    const pending = await readPending();
    return {
      enabled: true,
      availability,
      grants,
      pending: pending.upsert.length + pending.remove.length,
      failing,
      lastWeightSyncAt: await settings.get(HEALTH_WEIGHT_SYNCED_KEY),
    };
  };

  const clearState = async () => {
    for (const key of HEALTH_SETTING_KEYS) await settings.remove(key);
    failing = false;
  };

  return {
    isEnabled: enabled,
    status: () => enqueue(status),

    turnOn: () =>
      enqueue(async () => {
        let availability: HealthAvailability;
        try {
          availability = await platform.availability();
        } catch {
          availability = 'unavailable';
        }
        if (availability !== 'available') return { outcome: 'unavailable' as const, status: { ...OFF, availability } };
        await settings.set(HEALTH_ENABLED_KEY, 'true');
        let granted: HealthGrants = NONE;
        try {
          granted = await platform.requestPermissions(['writeNutrition', 'readWeight']);
        } catch {
          // The permission screen could not open: nothing was granted.
        }
        if (!granted.writeNutrition && !granted.readWeight) {
          await clearState();
          return { outcome: 'declined' as const, status: OFF };
        }
        await noteGrants(granted);
        await syncWeight();
        return { outcome: 'on' as const, status: await status() };
      }),

    turnOff: () => enqueue(clearState),

    requestGrant: (grant) =>
      enqueue(async () => {
        if (await enabled()) {
          try {
            await noteGrants(await platform.requestPermissions([grant]));
          } catch {
            failing = true;
          }
          await flush();
          await syncWeight();
        }
        return status();
      }),

    mealChanged: (id) => change('upsert', id),
    mealDeleted: (id) => change('remove', id),

    retry: () =>
      enqueue(async () => {
        failing = false;
        await flush();
        await syncWeight();
        return status();
      }),

    syncWeight: () => enqueue(syncWeight),

    sendExistingMeals: () =>
      enqueue(async () => {
        if (!(await enabled())) return 0;
        const ids = await repos.meals.listIds();
        const pending = await readPending();
        const upsert = [...new Set([...pending.upsert, ...ids])];
        await writePending({ upsert, remove: pending.remove.filter((id) => !ids.includes(id)) });
        await flush();
        return ids.length;
      }),

    removeWrittenRecords: () =>
      enqueue(async () => {
        await platform.deleteAllNutritionWritten();
        await settings.remove(HEALTH_PENDING_KEY);
        failing = false;
      }),

    idle: async () => {
      await chain;
    },
    openSettings: () => platform.openSettings(),
    openInstall: () => platform.openInstall(),
  };
}

/** A sync that does nothing, for code paths that run without the integration (tests that do not care about it). */
export function createInactiveHealthSync(): HealthSync {
  return {
    isEnabled: async () => false,
    status: async () => OFF,
    turnOn: async () => ({ outcome: 'unavailable', status: OFF }),
    turnOff: async () => undefined,
    requestGrant: async () => OFF,
    mealChanged: async () => undefined,
    mealDeleted: async () => undefined,
    retry: async () => OFF,
    syncWeight: async () => 0,
    sendExistingMeals: async () => 0,
    removeWrittenRecords: async () => undefined,
    idle: async () => undefined,
    openSettings: () => undefined,
    openInstall: () => undefined,
  };
}
