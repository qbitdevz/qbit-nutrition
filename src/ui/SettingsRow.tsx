import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { pressScale } from './motion';
import { radius, spacing } from './tokens';
import { useTheme } from './useTheme';

interface SettingsRowProps {
  icon: IconName;
  title: string;
  /** What is set now ("Metric · Lose fat"), under the title. */
  detail?: string;
  onPress: () => void;
  testID?: string;
}

/** A row that opens a settings page: tile, title, current value, chevron. One 72 dp button. */
export function SettingsRow({ icon, title, detail, onPress, testID }: SettingsRowProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      onPress={onPress}
      scale={pressScale.row}
      pressedStyle={{ backgroundColor: colors.surfaceHigh }}
      testID={testID}
      style={[styles.row, { backgroundColor: colors.surface }]}>
      <View style={[styles.tile, { backgroundColor: colors.surfaceRaised }]}>
        <Icon name={icon} color={colors.primaryText} />
      </View>
      <View style={styles.text}>
        <AppText variant="itemName">{title}</AppText>
        {detail ? (
          <AppText variant="bodySm" tone="muted" numberOfLines={2}>
            {detail}
          </AppText>
        ) : null}
      </View>
      <Icon name="right" color={colors.textMuted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, minHeight: 72, paddingVertical: spacing.s2, paddingLeft: spacing.s2, paddingRight: spacing.s4, borderRadius: radius.lg },
  tile: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
});
