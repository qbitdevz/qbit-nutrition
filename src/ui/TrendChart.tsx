import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { AppText } from './AppText';
import { chartGeometry, type ChartPoint } from './chartGeometry';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { duration, easing, pressScale, useReducedMotion } from './motion';
import { fontFamily, layout, radius, spacing } from './tokens';
import { useTheme } from './useTheme';

export type { ChartPoint } from './chartGeometry';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const HEIGHT = 208;
/** The bottom margin holds the latest value when the line falls into a point near the axis, then the first and last dates. */
const PADDING = { top: 30, right: 22, bottom: 46, left: 44 };
/** Beyond this many points the dots are left out and only the line and the last value are drawn. */
const MAX_DOTS = 45;
/** Rows of the data list shown before "Show all". */
const COLLAPSED_ROWS = 5;

interface TrendChartProps {
  /** Oldest first. At least one. */
  points: readonly ChartPoint[];
  /** The axis: round bounds and the ticks to label. */
  scale: { min: number; max: number; ticks: readonly number[] };
  /** Number as text, with the decimals of the unit ("80.5"). */
  formatValue: (value: number) => string;
  /** Short date as text ("21 Nov"). */
  formatDate: (date: string) => string;
  unit: string;
  /** The chart read aloud: what it shows, from when to when, the change and the extremes. The drawing itself is hidden from screen readers. */
  summary: string;
  /** One list row read aloud ("21 Nov, 80.5 kg. Edit"). */
  rowLabel: (point: ChartPoint) => string;
  /** Opens the entry behind a point. */
  onSelectPoint?: (id: string) => void;
  /** Visible heading of the list of points. */
  listTitle: string;
  showAllLabel: string;
  showFewerLabel: string;
  testID?: string;
}

/**
 * A line chart of one measurement over time, drawn with SVG from the design tokens. It never relies
 * on colour: the axis is labelled, the first and last dates are written out, the latest value is
 * printed on its point, and every point is also a row in the list under the drawing, which is also
 * what a screen reader walks through (the drawing is hidden from it behind one summary sentence).
 * The line draws in over 480 ms; with reduced motion it is there on the first frame. A single point
 * is a dot with its value and no line.
 */
export function TrendChart({ points, scale, formatValue, formatDate, unit, summary, rowLabel, onSelectPoint, listTitle, showAllLabel, showFewerLabel, testID }: TrendChartProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(340);
  const [expanded, setExpanded] = useState(false);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  const geometry = chartGeometry({ width, height: HEIGHT, padding: PADDING, points, scale });
  const showDots = points.length <= MAX_DOTS;
  const lastPoint = points[points.length - 1]!;
  const lastPlaced = geometry.points[geometry.points.length - 1]!;
  const labelAnchor = lastPlaced.x > width - 60 ? 'end' : lastPlaced.x < PADDING.left + 30 ? 'start' : 'middle';
  // The value goes on the side the line does not come from: below the dot when the line falls into it (the bottom margin always has room), above otherwise.
  const previousPlaced = geometry.points[geometry.points.length - 2];
  const falling = previousPlaced !== undefined && previousPlaced.y < lastPlaced.y;
  const labelY = falling ? lastPlaced.y + 22 : lastPlaced.y - 14;

  const draw = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      draw.value = 1;
      return;
    }
    draw.value = 0;
    draw.value = withTiming(1, { duration: duration.slow, easing: easing.out });
  }, [reduced, draw, points, geometry.length]);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: geometry.length * (1 - draw.value) }));
  const dotProps = useAnimatedProps(() => ({ opacity: draw.value < 0.6 ? 0 : (draw.value - 0.6) / 0.4 }));

  const rows = [...points].reverse();
  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <View style={styles.root} testID={testID}>
      <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={summary} style={styles.chart} testID="trend-chart">
        <Svg width={width} height={HEIGHT} aria-hidden>
          {scale.ticks.map((tick) => {
            const y = geometry.yOf(tick);
            return (
              <G key={tick}>
                <Line x1={geometry.plot.left} x2={geometry.plot.right} y1={y} y2={y} stroke={colors.border} strokeWidth={1} />
                <SvgText x={PADDING.left - 8} y={y + 4} fontSize={12} fontFamily={fontFamily.body500} fill={colors.textMuted} textAnchor="end">
                  {formatValue(tick)}
                </SvgText>
              </G>
            );
          })}
          <SvgText x={geometry.plot.left} y={HEIGHT - 8} fontSize={12} fontFamily={fontFamily.body500} fill={colors.textMuted} textAnchor="start">
            {formatDate(points[0]!.date)}
          </SvgText>
          {points.length > 1 ? (
            <SvgText x={geometry.plot.right} y={HEIGHT - 8} fontSize={12} fontFamily={fontFamily.body500} fill={colors.textMuted} textAnchor="end">
              {formatDate(lastPoint.date)}
            </SvgText>
          ) : null}
          {geometry.path ? (
            <AnimatedPath
              d={geometry.path}
              stroke={colors.primary}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={`${geometry.length} ${geometry.length}`}
              animatedProps={lineProps}
            />
          ) : null}
          <AnimatedG animatedProps={dotProps}>
            {(showDots ? geometry.points : [lastPlaced]).map((p) => (
              <Circle
                key={p.id}
                cx={p.x}
                cy={p.y}
                r={p === lastPlaced ? 6 : 4}
                fill={p === lastPlaced ? colors.primary : colors.surface}
                stroke={colors.primary}
                strokeWidth={2.5}
              />
            ))}
            {/* A halo in the page colour keeps the value readable where the line passes behind it. */}
            <SvgText x={lastPlaced.x} y={labelY} fontSize={14} fontFamily={fontFamily.display700} fill={colors.bg} stroke={colors.bg} strokeWidth={5} strokeLinejoin="round" textAnchor={labelAnchor} aria-hidden>
              {`${formatValue(lastPoint.value)} ${unit}`}
            </SvgText>
            <SvgText x={lastPlaced.x} y={labelY} fontSize={14} fontFamily={fontFamily.display700} fill={colors.text} textAnchor={labelAnchor}>
              {`${formatValue(lastPoint.value)} ${unit}`}
            </SvgText>
          </AnimatedG>
        </Svg>
      </View>

      <View style={styles.list} accessibilityLabel={listTitle}>
        <AppText variant="heading" accessibilityRole="header">
          {listTitle}
        </AppText>
        {visibleRows.map((point) => (
          <PressableScale
            key={point.id}
            accessibilityRole="button"
            accessibilityLabel={rowLabel(point)}
            onPress={onSelectPoint ? () => onSelectPoint(point.id) : undefined}
            disabled={!onSelectPoint}
            scale={pressScale.row}
            pressedStyle={{ backgroundColor: colors.surfaceHigh }}
            style={[styles.row, { backgroundColor: colors.surface }]}
            testID={`point-${point.id}`}>
            <AppText variant="bodyMd" tone="muted" style={styles.rowDate}>
              {formatDate(point.date)}
            </AppText>
            <AppText variant="itemName" style={styles.rowValue}>
              {formatValue(point.value)} <AppText variant="bodySm" tone="muted">{unit}</AppText>
            </AppText>
            {onSelectPoint ? <Icon name="pencil" size={20} color={colors.textMuted} /> : null}
          </PressableScale>
        ))}
        {rows.length > COLLAPSED_ROWS ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={expanded ? showFewerLabel : showAllLabel}
            onPress={() => setExpanded((value) => !value)}
            style={styles.toggle}>
            <AppText variant="button" tone="primary">
              {expanded ? showFewerLabel : showAllLabel}
            </AppText>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.s4 },
  chart: { height: HEIGHT },
  list: { gap: spacing.s2 },
  row: { minHeight: layout.touchTarget, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.s3, paddingHorizontal: spacing.s4, paddingVertical: spacing.s2 },
  rowDate: { flex: 1 },
  rowValue: { textAlign: 'right' },
  toggle: { minHeight: layout.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
});
