import Svg, { Circle, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Icon set — paths match the inline SVGs of the design reference (lucide-compatible). */

export function ChevronLeftIcon({ size = 18, color = '#2C2825', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 16, color = '#8A7D72', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CheckIcon({ size = 12, color = '#FFFFFF', strokeWidth = 3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="20 6 9 17 4 12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PlayIcon({ size = 12, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="5 3 19 12 5 21 5 3" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ size = 24, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={4} width={4} height={16} rx={1} fill={color} />
      <Rect x={14} y={4} width={4} height={16} rx={1} fill={color} />
    </Svg>
  );
}

export function ShareIcon({ size = 16, color = '#FFFFFF', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={18} cy={5} r={3} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={6} cy={12} r={3} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={18} cy={19} r={3} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function SearchIcon({ size = 16, color = '#8A7D72', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={8} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function KebabIcon({ size = 14, color = '#8A7D72' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={5} r={1.6} fill={color} />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
      <Circle cx={12} cy={19} r={1.6} fill={color} />
    </Svg>
  );
}

export function MicIcon({ size = 32, color = '#FFFFFF', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={9} y={2} width={6} height={12} rx={3} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5 10v2a7 7 0 0 0 14 0v-2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={12} y1={19} x2={12} y2={22} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function ArrowLeftIcon({ size = 18, color = '#E8E0D4', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M12 19l-7-7 7-7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Skip15Icon({ direction, size = 28, color = '#E8E0D4' }: IconProps & { direction: 'back' | 'forward' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {direction === 'back' ? (
        <>
          <Polyline points="1 4 1 10 7 10" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Polyline points="23 4 23 10 17 10" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      <SvgText x={12} y={16} fontSize={7} fontWeight="700" fill={color} textAnchor="middle">
        15
      </SvgText>
    </Svg>
  );
}

export function ClockIcon({ size = 14, color = '#6B7A94', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={strokeWidth} />
      <Polyline points="12 6 12 12 16 14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function FileTextIcon({ size = 16, color = '#6B7A94', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Polyline points="14 2 14 8 20 8" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Line x1={8} y1={13} x2={16} y2={13} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={8} y1={17} x2={13} y2={17} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function HomeIcon({ size = 22, color = '#8A7D72', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'}>
      <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 21V12h6v9" stroke={filled ? '#FFFFFF' : color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function BookIcon({ size = 22, color = '#8A7D72', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'}>
      <Path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PlusCircleIcon({ size = 26, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
      <Line x1={12} y1={8} x2={12} y2={16} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={8} y1={12} x2={16} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function PencilIcon({ size = 14, color = '#8A7D72', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function UserIcon({ size = 22, color = '#8A7D72', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'}>
      <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={7} r={4} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}
