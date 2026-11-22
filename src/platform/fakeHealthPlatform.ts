import type { HealthAvailability, HealthGrant, HealthGrants, HealthNutritionRecord, HealthPlatform, HealthWeightReading } from './healthPlatform';

export interface FakeHealthState {
  availability: HealthAvailability;
  granted: HealthGrants;
  /** What the person allows when the permission screen opens. */
  willGrant: HealthGrants;
  /** The nutrition records Health Connect holds, by client record id. */
  records: Map<string, HealthNutritionRecord>;
  /** The weights Health Connect holds. */
  weights: HealthWeightReading[];
  /** Fails the next n nutrition writes (a locked device, Health Connect busy, no space). */
  failWrites: number;
  failDeletes: number;
  failReads: boolean;
  failGrantCheck: boolean;
  /** Every call, in order, so a test can prove nothing was called. */
  calls: string[];
  settingsOpened: number;
  installOpened: number;
}

export interface FakeHealthPlatform extends HealthPlatform {
  state: FakeHealthState;
}

/**
 * Test and development stand-in for Health Connect. A write to an id that exists is applied only when its version is higher,
 * like the real service, and nothing is ever written without the write grant.
 */
export function createFakeHealthPlatform(initial: Partial<FakeHealthState> = {}): FakeHealthPlatform {
  const state: FakeHealthState = {
    availability: 'available',
    granted: { writeNutrition: false, readWeight: false },
    willGrant: { writeNutrition: true, readWeight: true },
    records: new Map(),
    weights: [],
    failWrites: 0,
    failDeletes: 0,
    failReads: false,
    failGrantCheck: false,
    calls: [],
    settingsOpened: 0,
    installOpened: 0,
    ...initial,
  };
  const log = (name: string) => void state.calls.push(name);

  return {
    state,
    async availability() {
      log('availability');
      return state.availability;
    },
    async grantedPermissions() {
      log('grantedPermissions');
      if (state.failGrantCheck) throw new Error('Health Connect could not be reached.');
      return { ...state.granted };
    },
    async requestPermissions(wanted: readonly HealthGrant[]) {
      log('requestPermissions');
      for (const grant of wanted) if (state.willGrant[grant]) state.granted[grant] = true;
      return { ...state.granted };
    },
    async writeNutrition(record) {
      log('writeNutrition');
      if (state.failWrites > 0) {
        state.failWrites -= 1;
        throw new Error('Health Connect is busy.');
      }
      if (!state.granted.writeNutrition) throw new Error('Permission to write nutrition is missing.');
      const existing = state.records.get(record.clientRecordId);
      if (existing && existing.clientRecordVersion >= record.clientRecordVersion) return;
      state.records.set(record.clientRecordId, record);
    },
    async deleteNutrition(ids) {
      log('deleteNutrition');
      if (state.failDeletes > 0) {
        state.failDeletes -= 1;
        throw new Error('Health Connect is busy.');
      }
      if (!state.granted.writeNutrition) throw new Error('Permission to write nutrition is missing.');
      for (const id of ids) state.records.delete(id);
    },
    async deleteAllNutritionWritten() {
      log('deleteAllNutritionWritten');
      if (state.failDeletes > 0) {
        state.failDeletes -= 1;
        throw new Error('Health Connect is busy.');
      }
      state.records.clear();
    },
    async readWeights({ from, to }) {
      log('readWeights');
      if (state.failReads) throw new Error('Health Connect is busy.');
      if (!state.granted.readWeight) throw new Error('Permission to read weight is missing.');
      return state.weights.filter((w) => {
        const at = Date.parse(w.time);
        return at >= from.getTime() && at <= to.getTime();
      });
    },
    openSettings() {
      log('openSettings');
      state.settingsOpened += 1;
    },
    openInstall() {
      log('openInstall');
      state.installOpened += 1;
    },
  };
}
