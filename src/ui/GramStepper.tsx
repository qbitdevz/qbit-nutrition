import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { pressScale } from './motion';
import { fontFamily, layout, radius, spacing } from './tokens';
import { useTheme } from './useTheme';

interface GramStepperProps {
  /** The grams as typed; the screen validates them. */
  value: string;
  onChangeText: (value: string) => void;
  /** Commit the typed value (leaving the field or pressing done). */
  onCommit: () => void;
  onStep: (direction: 1 | -1) => void;
  /** Accessible names: "Grams of Rice", "Decrease Rice", "Increase Rice". */
  inputLabel: string;
  decreaseLabel: string;
  increaseLabel: string;
  unit: string;
  decreaseDisabled?: boolean;
  invalid?: boolean;
  testID?: string;
}

/**
 * Gram stepper (design/system.md): minus, the grams, plus. Both buttons are 48 dp round and outlined
 * with the control-boundary colour; the number is an input, so the portion can also be typed.
 */
export function GramStepper({ value, onChangeText, onCommit, onStep, inputLabel, decreaseLabel, increaseLabel, unit, decreaseDisabled = false, invalid = false, testID }: GramStepperProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.row}>
      <StepButton icon="minus" label={decreaseLabel} disabled={decreaseDisabled} onPress={() => onStep(-1)} />
      <View style={[styles.field, { borderColor: invalid ? colors.warning : focused ? colors.primary : 'transparent', backgroundColor: colors.surfaceRaised }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onCommit();
          }}
          onSubmitEditing={onCommit}
          accessibilityLabel={inputLabel}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
          maxLength={7}
          selectionColor={colors.primary}
          testID={testID}
          style={[styles.input, { color: colors.text }]}
        />
        <AppText variant="bodySm" tone="muted" aria-hidden>
          {unit}
        </AppText>
      </View>
      <StepButton icon="plus" label={increaseLabel} onPress={() => onStep(1)} />
    </View>
  );
}

function StepButton({ icon, label, onPress, disabled = false }: { icon: 'minus' | 'plus'; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      scale={pressScale.icon}
      pressedStyle={{ backgroundColor: colors.surfaceHigh }}
      style={[styles.step, { borderColor: colors.borderStrong, opacity: disabled ? 0.4 : 1 }]}>
      <Icon name={icon} color={colors.text} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  step: { width: layout.touchTarget, height: layout.touchTarget, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  field: {
    width: 96,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.s3,
  },
  input: { width: 52, textAlign: 'right', fontFamily: fontFamily.display700, fontSize: 20, lineHeight: 24, padding: 0, outlineStyle: 'none' } as object,
});
