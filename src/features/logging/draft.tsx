import { createContext, useCallback, useEffect, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';

import type { ItemWarning } from '@/core/ai';
import type { FoodRef } from '@/core/catalog';
import type { MealSlot, NutrientAmounts } from '@/core/nutrition';

export type ScanConfidence = 'low' | 'medium' | 'high';

/** How a detected item was resolved when the scan finished (docs/04, flow B: three visible states, plus the one that cannot be saved). */
export type ScanItemKind = 'matched' | 'estimate' | 'needs_match';

/** What a scan knows about an item it detected; absent for foods the person added by hand. */
export interface ScanItemMeta {
  /** The model's name for it: what a swap is remembered under. */
  detectedName: string;
  kind: ScanItemKind;
  /** The catalog food it matched, by name; null for an estimate or an item that needs a match. */
  matchedName: string | null;
  confidenceFood: ScanConfidence;
  confidencePortion: ScanConfidence;
  /** The grams the model estimated (rounded): an item is "edited" once its grams differ. */
  aiGrams: number;
  /** Weight sanity flags from core; they describe the model's estimate and stop applying once the person changes it. */
  warnings: readonly ItemWarning[];
  /** The person replaced the food. */
  swapped: boolean;
}

/** What the person sees on a scan item, in text and not only in colour (flow B, "three visible states"). */
export type ScanItemState = 'matched' | 'estimate' | 'confirmed' | 'needs_match';

/** One food in the meal being built: enough to show it and to compute its nutrients for any grams. */
export interface DraftItem {
  key: string;
  displayName: string;
  /** The catalog or custom food; null for an AI estimate and for an item that still needs a match. */
  ref: FoodRef | null;
  /** All per-100 g values of the food (`computeItemNutrients` input); null while the item needs a match (it carries no numbers). */
  per100g: NutrientAmounts | null;
  grams: number;
  scan?: ScanItemMeta;
}

/** True once a scan item no longer is exactly what the model said. */
export const isEdited = (item: DraftItem): boolean => item.scan !== undefined && (item.scan.swapped || item.grams !== item.scan.aiGrams);

/**
 * The state of a scan item: an AI estimate keeps that mark even when its grams are edited (its numbers
 * still come from the model); a catalog item the person changed or swapped is "confirmed". Null for
 * foods added by hand.
 */
export function itemState(item: DraftItem): ScanItemState | null {
  const scan = item.scan;
  if (!scan) return null;
  if (item.per100g === null) return 'needs_match';
  if (scan.swapped) return 'confirmed';
  if (scan.kind === 'estimate') return 'estimate';
  return isEdited(item) ? 'confirmed' : 'matched';
}

interface DraftState {
  items: DraftItem[];
  slot: MealSlot | null;
  /** A food just created (custom food): the search screen opens its portion sheet next. */
  pending: FoodRef | null;
  /** The person changed the meal after the scan (removed, added or swapped something); a retake then asks first. */
  dirty: boolean;
}

type Action =
  | { type: 'add'; item: DraftItem }
  | { type: 'grams'; key: string; grams: number }
  | { type: 'remove'; key: string }
  | { type: 'restore'; item: DraftItem; index: number }
  | { type: 'slot'; slot: MealSlot }
  | { type: 'pending'; ref: FoodRef | null }
  | { type: 'load'; items: DraftItem[] }
  | { type: 'swap'; key: string; displayName: string; ref: FoodRef; per100g: NutrientAmounts }
  | { type: 'clear' };

const initial: DraftState = { items: [], slot: null, pending: null, dirty: false };

function reduce(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case 'add':
      return { ...state, items: [...state.items, action.item], dirty: true };
    case 'grams':
      return { ...state, items: state.items.map((item) => (item.key === action.key ? { ...item, grams: action.grams } : item)), dirty: true };
    case 'remove':
      return { ...state, items: state.items.filter((item) => item.key !== action.key), dirty: true };
    case 'load':
      return { ...initial, items: action.items };
    case 'swap':
      return {
        ...state,
        dirty: true,
        items: state.items.map((item) =>
          item.key === action.key
            ? { ...item, displayName: action.displayName, ref: action.ref, per100g: action.per100g, scan: item.scan ? { ...item.scan, swapped: true, matchedName: action.displayName } : item.scan }
            : item,
        ),
      };
    case 'restore': {
      if (state.items.some((item) => item.key === action.item.key)) return state;
      const items = [...state.items];
      items.splice(Math.min(action.index, items.length), 0, action.item);
      return { ...state, items, dirty: true };
    }
    case 'slot':
      return { ...state, slot: action.slot };
    case 'pending':
      return { ...state, pending: action.ref };
    case 'clear':
      return { ...initial };
  }
}

export interface MealDraft {
  items: readonly DraftItem[];
  /** The slot the person picked; null until they do (the review screen preselects one from the time of day). */
  slot: MealSlot | null;
  pending: FoodRef | null;
  /** See `DraftState.dirty`. */
  dirty: boolean;
  /** Replaces the whole meal with the items of a finished scan. */
  loadScan: (items: readonly Omit<DraftItem, 'key'>[]) => void;
  /** The person picked another food for an item: the grams stay, the numbers and the name come from the new food. */
  swapItem: (key: string, food: { displayName: string; ref: FoodRef; per100g: NutrientAmounts }) => void;
  addItem: (item: Omit<DraftItem, 'key'>) => DraftItem;
  setGrams: (key: string, grams: number) => void;
  /** Removes an item and returns it with its position, so an undo can put it back where it was. */
  removeItem: (key: string) => { item: DraftItem; index: number } | null;
  restoreItem: (item: DraftItem, index: number) => void;
  setSlot: (slot: MealSlot) => void;
  setPending: (ref: FoodRef | null) => void;
  clear: () => void;
}

const DraftContext = createContext<MealDraft | null>(null);

/**
 * The meal being logged by hand (flow D): foods added from the search collect here and are read by
 * the review screen. It lives above the routes, so it survives moving between search and review,
 * and it is cleared when the meal is saved or discarded. It holds nothing durable: until Save, nothing
 * is written (docs/04 flow B, "Nothing is saved until you tap Save meal").
 */
export function MealDraftProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, initial);
  const counter = useRef(0);
  // The latest items, for `removeItem`, which has to return the removed item synchronously.
  const latest = useRef(state.items);
  useEffect(() => {
    latest.current = state.items;
  }, [state.items]);

  const addItem = useCallback((item: Omit<DraftItem, 'key'>) => {
    counter.current += 1;
    const added = { ...item, key: `draft-${counter.current}` };
    dispatch({ type: 'add', item: added });
    return added;
  }, []);

  const removeItem = useCallback((key: string) => {
    const index = latest.current.findIndex((item) => item.key === key);
    if (index < 0) return null;
    const item = latest.current[index]!;
    dispatch({ type: 'remove', key });
    return { item, index };
  }, []);

  const loadScan = useCallback((items: readonly Omit<DraftItem, 'key'>[]) => {
    const loaded = items.map((item) => {
      counter.current += 1;
      return { ...item, key: `draft-${counter.current}` };
    });
    dispatch({ type: 'load', items: loaded });
  }, []);

  const value = useMemo<MealDraft>(
    () => ({
      items: state.items,
      slot: state.slot,
      pending: state.pending,
      dirty: state.dirty,
      loadScan,
      swapItem: (key, food) => dispatch({ type: 'swap', key, ...food }),
      addItem,
      setGrams: (key, grams) => dispatch({ type: 'grams', key, grams }),
      removeItem,
      restoreItem: (item, index) => dispatch({ type: 'restore', item, index }),
      setSlot: (slot) => dispatch({ type: 'slot', slot }),
      setPending: (ref) => dispatch({ type: 'pending', ref }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [state, addItem, removeItem, loadScan],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useMealDraft(): MealDraft {
  const draft = useContext(DraftContext);
  if (!draft) throw new Error('useMealDraft must be used under a MealDraftProvider');
  return draft;
}
