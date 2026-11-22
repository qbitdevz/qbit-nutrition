import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, runOnJS, useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * The one place that defines motion (design/system.md, "Motion"): durations, easing, and the
 * reduced-motion switch. Components import from here and never hard-code a duration or curve.
 *
 * Motion shows what changed and never delays routine work: touch feedback lands within 100 ms,
 * everything else is under 500 ms, except numbers and rings filling to their value (1 s).
 */
export const duration = {
  press: 100,
  fast: 180,
  base: 320,
  slow: 480,
  ring: 1000,
  /** Reduced motion: screens cross-fade instead of travelling. */
  reducedFade: 120,
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  out: Easing.bezier(0.05, 0.7, 0.1, 1),
  in: Easing.bezier(0.3, 0, 0.8, 0.15),
  /** Confirmations: stepper bump, save check, toast, segmented thumb. */
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
  /** Numbers counting up. */
  outCubic: Easing.out(Easing.cubic),
} as const;

/** Scale applied while a button is pressed (system.md, "Components"). */
export const pressScale = { button: 0.97, icon: 0.9, row: 0.985 } as const;

interface MotionValue {
  /** True when the system "reduce motion" setting is on: no travel, no scaling, numbers jump. */
  reduced: boolean;
}

const MotionContext = createContext<MotionValue>({ reduced: false });

interface MotionProviderProps {
  /** Forces the preference (tests, previews). By default it follows the system setting. */
  reduced?: boolean;
  children: ReactNode;
}

/**
 * Reads the system "reduce motion" setting once, then keeps following it. Children render only
 * after the setting is known, so a person who turned motion off never sees a number count up for
 * a frame before the preference arrives.
 */
export function MotionProvider({ reduced, children }: MotionProviderProps) {
  const [system, setSystem] = useState<boolean | null>(null);

  useEffect(() => {
    if (reduced !== undefined) return;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => active && setSystem(value),
      () => active && setSystem(false),
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystem);
    return () => {
      active = false;
      subscription.remove();
    };
  }, [reduced]);

  const value = reduced ?? system;
  if (value === null) return null;
  return <MotionContext.Provider value={{ reduced: value }}>{children}</MotionContext.Provider>;
}

export function useReducedMotion(): boolean {
  return useContext(MotionContext).reduced;
}

/**
 * The integer to display while a number counts to `to`. With reduced motion, or when `from` equals
 * `to`, it is `to` on the very first render. Otherwise it counts from `from` (first render) or from
 * the value currently shown (later changes) over `duration.ring` with ease-out cubic.
 */
export function useCountUp(to: number, from: number = to): number {
  const reduced = useReducedMotion();
  const value = useSharedValue(reduced ? to : from);
  const [shown, setShown] = useState(reduced ? to : from);

  useEffect(() => {
    if (reduced) {
      value.value = to;
      return;
    }
    value.value = withTiming(to, { duration: duration.ring, easing: easing.outCubic });
  }, [to, reduced, value]);

  useAnimatedReaction(
    () => Math.round(value.value),
    (current, previous) => {
      // `previous` is null on the first run: the state already holds the starting value.
      if (!reduced && previous !== null && current !== previous) runOnJS(setShown)(current);
    },
  );

  return reduced ? to : shown;
}
