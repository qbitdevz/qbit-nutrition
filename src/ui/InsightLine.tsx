import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { spacing } from './tokens';
import { useTheme } from './useTheme';

interface InsightLineProps {
  text: string;
  icon?: IconName;
  /** One follow-up action under the text ("Set up targets"). */
  actionLabel?: string;
  onAction?: () => void;
}

/** One neutral suggestion or notice on a tinted row: icon plus text, never colour alone. */
export function InsightLine({ text, icon = 'info', actionLabel, onAction }: InsightLineProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.primarySoft }]} testID="insight">
      <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={text}>
        <View style={styles.icon}>
          <Icon name={icon} color={colors.primaryText} />
        </View>
        <AppText variant="bodyMd" style={styles.text}>
          {text}
        </AppText>
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} variant="ghost" block={false} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.s4,
    paddingHorizontal: spacing.s4,
    paddingVertical: 14,
    borderRadius: 20,
    gap: spacing.s1,
    alignItems: 'flex-start',
  },
  row: { flexDirection: 'row', gap: spacing.s3, alignItems: 'flex-start', alignSelf: 'stretch' },
  icon: { marginTop: 1 },
  text: { flex: 1 },
});
