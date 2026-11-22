import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ambient } from './Ambient';
import { AppText } from './AppText';
import { layout, spacing } from './tokens';
import { useTheme } from './useTheme';

interface ScreenFrameProps {
  children: ReactNode;
  /** Scrolls its content (default). Turn off for screens that manage their own scrolling. */
  scroll?: boolean;
  /** Room kept free at the bottom, e.g. for the floating dock. */
  bottomInset?: number;
  ambient?: 'blue' | 'warm';
  /** Pinned above the scrolling content (the wordmark header). */
  header?: ReactNode;
  /** Pinned below the scrolling content, above the keyboard (totals and the Save button, form actions). */
  footer?: ReactNode;
}

/** Screen background with the ambient tint, safe areas, and the shared side padding. */
export function ScreenFrame({ children, scroll = true, bottomInset = 0, ambient = 'blue', header, footer }: ScreenFrameProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Ambient tone={ambient} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView style={styles.safe} behavior="padding">
          {header}
          {scroll ? (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={{ paddingBottom: bottomInset }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={styles.flex}>{children}</View>
          )}
          {footer}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

interface ScreenFooterProps {
  children: ReactNode;
  onLayout?: (height: number) => void;
}

/** Pinned actions under a screen's content (the ScreenFrame footer): side padding, the system bar's inset, and 10 dp between buttons. */
export function ScreenFooter({ children, onLayout }: ScreenFooterProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      onLayout={onLayout ? (event) => onLayout(event.nativeEvent.layout.height) : undefined}
      style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.s4) }]}>
      {children}
    </View>
  );
}

interface ScreenProps {
  title: string;
  children?: ReactNode;
  bottomInset?: number;
}

/** A titled screen for simple pages (placeholders, settings). */
export function Screen({ title, children, bottomInset }: ScreenProps) {
  return (
    <ScreenFrame bottomInset={bottomInset}>
      <View style={styles.titled}>
        <AppText variant="titleLg" accessibilityRole="header">
          {title}
        </AppText>
        <View style={styles.body}>{children}</View>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  titled: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s6 },
  body: { paddingTop: spacing.s4, gap: spacing.s3 },
  footer: { paddingHorizontal: layout.screenMargin + spacing.s2, paddingTop: spacing.s3, gap: 10 },
});
