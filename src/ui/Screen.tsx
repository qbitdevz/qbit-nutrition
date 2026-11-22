import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { layout, ruleWeight, spacing, typography } from './tokens';
import { useTheme } from './useTheme';

type Props = { title: string; children?: ReactNode };

/** Screen frame: title over the heavy header rule (docs/05-design-system.md). */
export function Screen({ title, children }: Props) {
  const colors = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
        {title}
      </Text>
      <View style={[styles.rule, { backgroundColor: colors.rule }]} />
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: layout.screenMargin, paddingTop: spacing.lg },
  rule: { height: ruleWeight.header, marginTop: spacing.sm },
  body: { flex: 1, paddingTop: spacing.lg },
});
