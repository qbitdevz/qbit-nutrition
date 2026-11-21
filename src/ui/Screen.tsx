import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
}

/** Screen background with the ambient tint, safe areas, and the shared side padding. */
export function ScreenFrame({ children, scroll = true, bottomInset = 0, ambient = 'blue', header }: ScreenFrameProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Ambient tone={ambient} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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
      </SafeAreaView>
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
});
