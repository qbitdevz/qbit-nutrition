import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { fontFamily, layout, spacing, typography } from './tokens';
import { useTheme } from './useTheme';

interface WordmarkProps {
  name: string;
  /** Spoken name of the mark, e.g. "Qbit Nutrition by qbitdev". */
  label: string;
}

/**
 * "Qbit Nutrition" set in the brand gradient, with "by qbitdev" under it. Drawn with SVG text
 * because React Native cannot clip a gradient to glyphs without an extra native module. It is a
 * brand mark, so it does not follow the system font scale.
 */
export function Wordmark({ name, label }: WordmarkProps) {
  const { colors } = useTheme();
  const { fontSize, lineHeight } = typography.wordmark;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={label}>
      <Svg width={168} height={lineHeight + 2} aria-hidden>
        <Defs>
          <LinearGradient id="wordmark" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.wordmark[0]} />
            <Stop offset="0.55" stopColor={colors.wordmark[1]} />
            <Stop offset="1" stopColor={colors.wordmark[2]} />
          </LinearGradient>
        </Defs>
        <SvgText x="0" y={lineHeight - 5} fill="url(#wordmark)" fontFamily={fontFamily.display700} fontSize={fontSize} letterSpacing={-0.2}>
          {name}
        </SvgText>
      </Svg>
      <AppText variant="caption" tone="muted" style={styles.by} aria-hidden>
        by qbitdev
      </AppText>
    </View>
  );
}

interface WordmarkHeaderProps extends WordmarkProps {
  settingsLabel: string;
  onSettings: () => void;
}

/** The Today header: the wordmark on the left, Settings on the right (docs/04 navigation map). */
export function WordmarkHeader({ name, label, settingsLabel, onSettings }: WordmarkHeaderProps) {
  return (
    <View style={styles.header}>
      <Wordmark name={name} label={label} />
      <IconButton icon="settings" label={settingsLabel} onPress={onSettings} testID="open-settings" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: layout.screenMargin + spacing.s2,
    paddingRight: spacing.s3,
    paddingTop: spacing.s2,
    minHeight: 64,
  },
  by: { marginTop: -2 },
});
