import type { NutrientAmounts } from '@/core/nutrition';
import type { BackupSnapshot, MealWithItems, Profile } from '@/data';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, isKnownTestResult, type ExportDocument } from './exportFormat';
import { portableSettings } from './settingsPolicy';

/**
 * The base URL as it travels: without credentials. `assertSecureBaseUrl` refuses credentials when a profile is created, so
 * a stored URL should never have any; if one does, they are cut. The query string and the fragment are kept: a provider
 * can legitimately need one (`?api-version=...`) and dropping it would break the profile on the new phone without a word.
 * A key pasted into any part of the URL is not handled here: the exporter refuses the whole file when any exported text
 * contains a stored key (`dataService.ts`), and says which field.
 */
export function cleanBaseUrl(url: string): string {
  return url.trim().replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#@]*@/i, '$1');
}

export interface ToDocumentOptions {
  appVersion: string;
  exportedAt: Date;
  /** Photo paths that go into the same file. A meal whose photo is not in this set is exported without one. */
  includedPhotos: ReadonlySet<string>;
}

/** The documented JSON shape of a snapshot (docs/08 section 9). Every field is named here, so nothing else can leak into a file. */
export function documentFromSnapshot(snapshot: BackupSnapshot, { appVersion, exportedAt, includedPhotos }: ToDocumentOptions): ExportDocument {
  const { profile } = snapshot;
  return {
    format: EXPORT_FORMAT,
    format_version: EXPORT_FORMAT_VERSION,
    app_version: appVersion,
    exported_at: exportedAt.toISOString(),
    profile: profile && {
      id: profile.id,
      sex: profile.sex,
      birth_date: profile.birthDate,
      height_cm: profile.heightCm,
      activity_level: profile.activityLevel,
      special_condition: profile.specialCondition,
      unit_system: profile.unitSystem,
      locale: profile.locale,
      disclaimer_accepted_at: profile.disclaimerAcceptedAt,
      disclaimer_version: profile.disclaimerVersion,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    },
    goals: snapshot.goals.map((g) => ({
      id: g.id,
      type: g.type,
      pace: g.pace,
      start_date: g.startDate,
      end_date: g.endDate,
      kcal_target: g.kcalTarget,
      protein_g_target: g.proteinGTarget,
      carbs_g_target: g.carbsGTarget,
      fat_g_target: g.fatGTarget,
      is_custom: g.isCustom,
      basis_weight_kg: g.basisWeightKg,
      formula_version: g.formulaVersion,
    })),
    body_measurements: snapshot.measurements.map((m) => ({ id: m.id, measured_on: m.measuredOn, kind: m.kind, value: m.value, source: m.source })),
    meals: snapshot.meals.map((m) => ({
      id: m.id,
      local_date: m.localDate,
      eaten_at: m.eatenAt,
      slot: m.slot,
      name: m.name,
      source: m.source,
      photo_path: m.photoPath !== null && includedPhotos.has(m.photoPath) ? m.photoPath : null,
      note: m.note,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
      items: m.items.map((i) => ({
        id: i.id,
        position: i.position,
        display_name: i.displayName,
        grams: i.grams,
        food_source: i.foodSource,
        food_ref: i.foodRef,
        origin: i.origin,
        confidence_food: i.confidenceFood,
        confidence_portion: i.confidencePortion,
        kcal: i.kcal,
        protein_g: i.proteinG,
        carbs_g: i.carbsG,
        fat_g: i.fatG,
        nutrients: { ...i.nutrients } as Record<string, number>,
      })),
    })),
    custom_foods: snapshot.customFoods.map((f) => ({
      id: f.id,
      name: f.name,
      kcal_100g: f.kcal100g,
      protein_100g: f.protein100g,
      carbs_100g: f.carbs100g,
      fat_100g: f.fat100g,
      other_nutrients: f.otherNutrients ? ({ ...f.otherNutrients } as Record<string, number>) : null,
      default_portion_g: f.defaultPortionG,
    })),
    food_usage: snapshot.foodUsage.map((u) => ({
      food_source: u.foodSource,
      food_ref: u.foodRef,
      last_used_at: u.lastUsedAt,
      use_count: u.useCount,
      is_favorite: u.isFavorite,
      last_grams: u.lastGrams,
    })),
    match_memory: snapshot.matchMemory.map((m) => ({
      detected_name_normalized: m.name,
      food_source: m.ref.source,
      food_ref: m.ref.id,
      times_confirmed: m.timesConfirmed,
      updated_at: m.updatedAt,
    })),
    // A provider profile as stored: there is no key in the database, and none is read from secure storage here.
    ai_providers: snapshot.aiProviders.map((p) => ({
      id: p.id,
      label: p.label,
      preset: p.preset,
      adapter: p.adapter,
      base_url: cleanBaseUrl(p.baseUrl),
      model: p.model,
      output_mode: p.outputMode,
      timeout_s: p.timeoutS,
      is_active: p.isActive,
      last_test_at: p.lastTestAt,
      // Only a known code leaves the phone: the field holds whatever a provider said, and free text could hold anything.
      last_test_result: isKnownTestResult(p.lastTestResult) ? p.lastTestResult : null,
    })),
    settings: portableSettings(snapshot.settings),
  };
}

export interface ToSnapshotOptions {
  /** Where each photo of the document was stored on this device (document path → new relative path). */
  storedPhotos: ReadonlyMap<string, string>;
  /** This installation's own profile, if it has one: its accepted health notice is kept (see `profileFromDocument`). */
  localProfile: Profile | null;
  /** This installation's own state (`keptSettings`), written next to the imported settings. */
  keptSettings: Readonly<Record<string, string>>;
  /**
   * Makes the id of every imported provider profile. Imported profiles never keep the id the file gives them: a key is stored under
   * the profile id, so a reused id could pair a key that existed before the import with a profile (and a host) it was never entered for.
   */
  newId: () => string;
}

/** The notice acceptance of an installation that has none: never equal to the current notice version, so it is asked. */
export const NOT_ACCEPTED_HERE = { disclaimerAcceptedAt: '1970-01-01T00:00:00.000Z', disclaimerVersion: '' } as const;

/**
 * The imported profile. The person's data comes from the file; the health notice does not: acceptance is
 * consent given on one installation, so this installation keeps its own (the person must have accepted the
 * notice here to reach Settings at all). With no profile here, the notice counts as not accepted and is asked.
 */
export function profileFromDocument(imported: NonNullable<ExportDocument['profile']>, local: Profile | null): Profile {
  const acceptance = local
    ? { disclaimerAcceptedAt: local.disclaimerAcceptedAt, disclaimerVersion: local.disclaimerVersion }
    : NOT_ACCEPTED_HERE;
  return {
    id: imported.id,
    sex: imported.sex,
    birthDate: imported.birth_date,
    heightCm: imported.height_cm,
    activityLevel: imported.activity_level,
    specialCondition: imported.special_condition,
    unitSystem: imported.unit_system,
    locale: imported.locale,
    ...acceptance,
    createdAt: imported.created_at,
    updatedAt: imported.updated_at,
  };
}

/** The snapshot to write for a validated document. Photos named by the document must all be in `storedPhotos`. */
export function snapshotFromDocument(doc: ExportDocument, { storedPhotos, localProfile, keptSettings, newId }: ToSnapshotOptions): BackupSnapshot {
  const meals: MealWithItems[] = doc.meals.map((m) => ({
    id: m.id,
    localDate: m.local_date,
    eatenAt: m.eaten_at,
    slot: m.slot,
    name: m.name,
    source: m.source,
    scanId: null,
    photoPath: m.photo_path === null ? null : (storedPhotos.get(m.photo_path) ?? null),
    note: m.note,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    items: m.items.map((i) => ({
      id: i.id,
      mealId: m.id,
      position: i.position,
      displayName: i.display_name,
      grams: i.grams,
      foodSource: i.food_source,
      foodRef: i.food_ref,
      origin: i.origin,
      confidenceFood: i.confidence_food,
      confidencePortion: i.confidence_portion,
      kcal: i.kcal,
      proteinG: i.protein_g,
      carbsG: i.carbs_g,
      fatG: i.fat_g,
      nutrients: { ...i.nutrients } as NutrientAmounts,
    })),
  }));

  return {
    // A file without a profile leaves this installation's own profile in place: it holds the accepted health notice and the units,
    // and an onboarded app without one would be incoherent. (With no profile here the app is not onboarded, so onboarding asks.)
    profile: doc.profile ? profileFromDocument(doc.profile, localProfile) : localProfile,
    goals: doc.goals.map((g) => ({
      id: g.id,
      type: g.type,
      pace: g.pace,
      startDate: g.start_date,
      endDate: g.end_date,
      kcalTarget: g.kcal_target,
      proteinGTarget: g.protein_g_target,
      carbsGTarget: g.carbs_g_target,
      fatGTarget: g.fat_g_target,
      isCustom: g.is_custom,
      basisWeightKg: g.basis_weight_kg,
      formulaVersion: g.formula_version,
    })),
    measurements: doc.body_measurements.map((m) => ({ id: m.id, measuredOn: m.measured_on, kind: m.kind, value: m.value, source: m.source })),
    meals,
    customFoods: doc.custom_foods.map((f) => {
      const other = f.other_nutrients && Object.keys(f.other_nutrients).length > 0 ? ({ ...f.other_nutrients } as NutrientAmounts) : null;
      return {
        id: f.id,
        name: f.name,
        kcal100g: f.kcal_100g,
        protein100g: f.protein_100g,
        carbs100g: f.carbs_100g,
        fat100g: f.fat_100g,
        defaultPortionG: f.default_portion_g,
        otherNutrients: other,
        per100g: { kcal: f.kcal_100g, protein: f.protein_100g, carbs: f.carbs_100g, fat: f.fat_100g, ...other },
      };
    }),
    foodUsage: doc.food_usage.map((u) => ({
      foodSource: u.food_source,
      foodRef: u.food_ref,
      lastUsedAt: u.last_used_at,
      useCount: u.use_count,
      isFavorite: u.is_favorite,
      lastGrams: u.last_grams,
    })),
    matchMemory: doc.match_memory.map((m) => ({
      name: m.detected_name_normalized,
      ref: { source: m.food_source, id: m.food_ref },
      timesConfirmed: m.times_confirmed,
      updatedAt: m.updated_at,
    })),
    aiProviders: doc.ai_providers.map((p) => ({
      id: newId(),
      label: p.label,
      preset: p.preset,
      adapter: p.adapter,
      baseUrl: p.base_url,
      model: p.model,
      outputMode: p.output_mode,
      timeoutS: p.timeout_s,
      isActive: p.is_active,
      lastTestAt: p.last_test_at,
      lastTestResult: p.last_test_result,
    })),
    // Imported preferences, then this installation's own state on top (a document cannot overwrite it: the portable filter drops those keys first).
    settings: { ...portableSettings(doc.settings), ...keptSettings },
  };
}
