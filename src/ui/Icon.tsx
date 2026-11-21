import Svg, { Circle, Path } from 'react-native-svg';

/** Line icons from the Orbit artboard (24 px grid, 2 px round strokes). Decorative: hidden from screen readers. */
const ICONS = {
  scan: ['M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', { circle: [12, 12.5, 3.5] }],
  today: [{ circle: [12, 12, 8.5] }, 'M12 3.5V12h8.5'],
  progress: ['M4 4v15.5h16M8 15l4-4.5 3 3L20 7'],
  settings: ['M4 7h9M19 7h1M4 17h1M11 17h9', { circle: [16, 7, 2.5] }, { circle: [8, 17, 2.5] }],
  left: ['M15 5l-7 7 7 7'],
  right: ['M9 5l7 7-7 7'],
  minus: ['M6 12h12'],
  plus: ['M12 6v12M6 12h12'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  x: ['M6 6l12 12M18 6L6 18'],
  alert: ['M12 4l9 16H3z', 'M12 10v4M12 17.2v.1'],
  info: [{ circle: [12, 12, 9] }, 'M12 11v5M12 8v.1'],
  sparkle: ['M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z'],
  retake: ['M4 12a8 8 0 1 1 2.4 5.7M4 19v-4.5h4.5'],
  pencil: ['M5 19l1-4 9-9 3 3-9 9zM14 7l3 3'],
  swap: ['M5 8h13l-3-3M19 16H6l3 3'],
  clock: [{ circle: [12, 12, 9] }, 'M12 7v5l3 2'],
  plate: [{ circle: [12, 12, 8.5] }, { circle: [12, 12, 4.5] }],
  search: [{ circle: [11, 11, 6.5] }, 'M16 16l4.5 4.5'],
  star: ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'],
  trash: ['M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10 11v5M14 11v5'],
  copy: ['M9 9h10v11H9z', 'M5 15V4h10'],
  bolt: ['M13 3L5.5 13.5H11L10 21l7.5-10.5H12z'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', { circle: [15.5, 9, 1.4] }],
} as const;

export type IconName = keyof typeof ICONS;

type Piece = string | { circle: readonly [number, number, number] };

interface IconProps {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
  /** Fills the shape with the colour too (a selected star). */
  filled?: boolean;
}

export function Icon({ name, color, size = 24, strokeWidth = 2, filled = false }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden>
      {(ICONS[name] as readonly Piece[]).map((piece, index) =>
        typeof piece === 'string' ? (
          <Path key={index} d={piece} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill={filled ? color : 'none'} />
        ) : (
          <Circle key={index} cx={piece.circle[0]} cy={piece.circle[1]} r={piece.circle[2]} stroke={color} strokeWidth={strokeWidth} />
        ),
      )}
    </Svg>
  );
}
