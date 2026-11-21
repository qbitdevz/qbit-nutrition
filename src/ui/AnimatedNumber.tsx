import { AppText, type TextVariant } from './AppText';
import { useCountUp } from './motion';

interface AnimatedNumberProps {
  value: number;
  /** Where the count starts on first render; defaults to `value` (no count). */
  from?: number;
  variant?: TextVariant;
  format: (n: number) => string;
}

/** A number that counts to its value (1 s, ease-out) and shows it at once with reduced motion. */
export function AnimatedNumber({ value, from, variant = 'numeral', format }: AnimatedNumberProps) {
  const shown = useCountUp(value, from ?? value);
  return <AppText variant={variant}>{format(shown)}</AppText>;
}
