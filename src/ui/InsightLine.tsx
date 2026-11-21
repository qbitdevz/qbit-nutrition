import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { spacing } from './tokens';
import { useTheme } from './useTheme';

interface InsightLineProps {
  text: string;
  icon?: IconName;
}

/** One neutral suggestion or notice on a tinted row: icon plus text, never colour alone. */
export function InsightLine({ text, icon = 'info' }: InsightLineProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.row, { backgroundColor: colors.primarySoft }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      testID="insight">
      <View style={styles.icon}>
        <Icon name={icon} color={colors.primaryText} />
      </View>
      <AppText variant="bodyMd" style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.s3,
    alignItems: 'flex-start',
    marginHorizontal: spacing.s4,
    paddingHorizontal: spacing.s4,
    paddingVertical: 14,
    borderRadius: 20,
  },
  icon: { marginTop: 1 },
  text: { flex: 1 },
});
