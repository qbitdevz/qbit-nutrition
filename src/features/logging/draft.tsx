import { createContext, useCallback, useEffect, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';

import type { FoodRef } from '@/core/catalog';
import type { MealSlot, NutrientAmounts } from '@/core/nutrition';

/** One food in the meal being built: enough to show it and to compute its nutrients for any grams. */
export interface DraftItem {
  key: string;
  displayName: string;
  ref: FoodRef;
  /** All per-100 g values of the food (`computeItemNutrients` input). */
  per100g: NutrientAmounts;
  grams: number;
}

interface DraftState {
  items: DraftItem[];
  slot: MealSlot | null;
  /** A food just created (custom food): the search screen opens its portion sheet next. */
  pending: FoodRef | null;
}

type Action =
  | { type: 'add'; item: DraftItem }
  | { type: 'grams'; key: string; grams: number }
  | { type: 'remove'; key: string }
  | { type: 'restore'; item: DraftItem; index: number }
  | { type: 'slot'; slot: MealSlot }
  | { type: 'pending'; ref: FoodRef | null }
  | { type: 'clear' };

const initial: DraftState = { items: [], slot: null, pending: null };

function reduce(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case 'add':
      return { ...state, items: [...state.items, action.item] };
    case 'grams':
      return { ...state, items: state.items.map((item) => (item.key === action.key ? { ...item, grams: action.grams } : item)) };
    case 'remove':
      return { ...state, items: state.items.filter((item) => item.key !== action.key) };
    case 'restore': {
      if (state.items.some((item) => item.key === action.item.key)) return state;
      const items = [...state.items];
      items.splice(Math.min(action.index, items.length), 0, action.item);
      return { ...state, items };
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

  const value = useMemo<MealDraft>(
    () => ({
      items: state.items,
      slot: state.slot,
      pending: state.pending,
      addItem,
      setGrams: (key, grams) => dispatch({ type: 'grams', key, grams }),
      removeItem,
      restoreItem: (item, index) => dispatch({ type: 'restore', item, index }),
      setSlot: (slot) => dispatch({ type: 'slot', slot }),
      setPending: (ref) => dispatch({ type: 'pending', ref }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [state, addItem, removeItem],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useMealDraft(): MealDraft {
  const draft = useContext(DraftContext);
  if (!draft) throw new Error('useMealDraft must be used under a MealDraftProvider');
  return draft;
}
