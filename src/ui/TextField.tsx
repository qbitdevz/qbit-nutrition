import { useState } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions, type ReturnKeyTypeOptions } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { fontFamily, layout, radius, spacing } from './tokens';
import { useTheme } from './useTheme';

export interface TextFieldProps {
  /** Visible label and accessible name of the input. */
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Validate here as well as on submit, so a mistake shows when the person leaves the field. */
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  /** A specific message ("Height must be between 50 and 260 cm."); the field is outlined in the warning colour while it is set. */
  error?: string | null;
  /** Outlines the field as having a problem without a message of its own (a message shared by a group of fields, see FieldMessage). */
  invalid?: boolean;
  hint?: string;
  /** The unit shown inside the field ("kg"). */
  suffix?: string;
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  maxLength?: number;
  placeholder?: string;
  autoFocus?: boolean;
  /** Turns off automatic capitalization (addresses, identifiers, keys). */
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /**
   * A write-only secret (an API key): masked while typed, never offered to autofill or the keyboard's
   * dictionary, and no spell-check. The caller keeps the value out of anything it shows afterwards.
   */
  secret?: boolean;
  /** Hides the visible label (the accessible name stays); for fields whose context is already visible. */
  labelHidden?: boolean;
  testID?: string;
}

/**
 * A labelled text input: label above, unit inside, hint or specific error below. The outline uses
 * the control-boundary colour (3:1), turns blue when focused and amber with an icon and text when it
 * has an error; the error is never shown by colour alone. Values are kept as typed: validation
 * never clears or clamps them.
 */
export function TextField({
  label,
  value,
  onChangeText,
  onBlur,
  onSubmitEditing,
  error,
  invalid = false,
  hint,
  suffix,
  keyboardType,
  returnKeyType,
  maxLength,
  placeholder,
  autoFocus,
  autoCapitalize,
  secret = false,
  labelHidden = false,
  testID,
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const hasProblem = Boolean(error) || invalid;
  const borderColor = hasProblem ? colors.warning : focused ? colors.primary : colors.borderStrong;
  return (
    <View style={styles.root}>
      {labelHidden ? null : (
        <AppText variant="bodyMd" tone="muted" style={styles.label} aria-hidden>
          {label}
        </AppText>
      )}
      <View style={[styles.box, { backgroundColor: colors.surfaceRaised, borderColor, borderWidth: focused || hasProblem ? 2 : 1.5 }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          maxLength={maxLength}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize={autoCapitalize ?? (secret ? 'none' : undefined)}
          secureTextEntry={secret || undefined}
          autoComplete={secret ? 'off' : undefined}
          importantForAutofill={secret ? 'no' : undefined}
          spellCheck={secret ? false : undefined}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          testID={testID}
          style={[styles.input, { color: colors.text }]}
        />
        {suffix ? (
          <AppText variant="bodyMd" tone="muted" aria-hidden>
            {suffix}
          </AppText>
        ) : null}
      </View>
      {error ? (
        <FieldMessage message={error} />
      ) : hint ? (
        <AppText variant="bodySm" tone="muted" style={styles.hint}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.s1 },
  label: { paddingLeft: spacing.s2 },
  box: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.s3,
    fontFamily: fontFamily.body500,
    fontSize: 17,
    lineHeight: 22,
    // The web preview draws its own focus outline; the border colour above already shows focus.
    outlineStyle: 'none',
  } as object,
  message: { flexDirection: 'row', gap: spacing.s2, alignItems: 'flex-start', paddingHorizontal: spacing.s2, paddingTop: 2 },
  messageText: { flex: 1 },
  hint: { paddingHorizontal: spacing.s2 },
});

/** The specific problem under a field or a group of fields: warning icon plus text, announced when it appears. */
export function FieldMessage({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.message} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name="alert" size={18} color={colors.warning} />
      <AppText variant="bodySm" tone="warning" style={styles.messageText}>
        {message}
      </AppText>
    </View>
  );
}
