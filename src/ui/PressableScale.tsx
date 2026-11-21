import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, easing, pressScale, useReducedMotion } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed; defaults to the button value of the motion tokens. */
  scale?: number;
  /** Extra style while pressed (a fill), so the touch is acknowledged even when nothing scales. */
  pressedStyle?: StyleProp<ViewStyle>;
}

/**
 * A pressable that shrinks slightly under the finger (100 ms). With reduced motion nothing scales;
 * callers still show a pressed fill so the touch is acknowledged.
 */
export function PressableScale({ scale = pressScale.button, style, pressedStyle, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  const current = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: current.value }] }));
  const to = (value: number) => {
    if (!reduced) current.set(withTiming(value, { duration: duration.press, easing: easing.standard }));
  };
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        setPressed(true);
        to(scale);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        to(1);
        onPressOut?.(event);
      }}
      style={[style, pressed ? pressedStyle : null, animated]}
    />
  );
}
