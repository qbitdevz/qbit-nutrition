import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { layout, spacing } from './tokens';

interface TopBarProps {
  /** The screen title, as the page heading. Leave it out when the screen has its own large heading. */
  title?: string;
  /** Shows a back button when given; `backLabel` is its accessible name. */
  onBack?: () => void;
  backLabel?: string;
  /** Something small on the right: a count, a text button. */
  right?: ReactNode;
  /** Small line above the title ("Step 2 of 4"). */
  eyebrow?: string;
}

/**
 * The bar at the top of every screen that is not a tab: a round back button, the screen title as
 * the page heading, and an optional action. Keeps "where am I and how do I go back" in the same
 * place on every screen.
 */
export function TopBar({ title, onBack, backLabel, right, eyebrow }: TopBarProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>{onBack ? <IconButton icon="left" label={backLabel ?? title ?? ''} onPress={onBack} testID="top-back" /> : null}</View>
      <View style={styles.center}>
        {eyebrow ? (
          <AppText variant="caption" tone="muted" style={styles.eyebrow}>
            {eyebrow}
          </AppText>
        ) : null}
        {title ? (
          <AppText variant="dayTitle" accessibilityRole="header" numberOfLines={2} style={styles.title}>
            {title}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingHorizontal: spacing.s2, paddingTop: spacing.s1 },
  side: { minWidth: layout.touchTarget + spacing.s2, alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.s1 },
  eyebrow: { textAlign: 'center' },
  title: { textAlign: 'center' },
});
