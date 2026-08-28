import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

interface WaveformProps {
  /** Number of bars (design shows 28). */
  bars?: number;
  /** Playback progress 0..1 — bars left of it are tinted with activeColor. */
  progress: number;
  activeColor: string;
  inactiveColor: string;
  /** Tallest bar height in px. */
  height?: number;
}

const BAR_WIDTH = 3;
const BAR_GAP = 3;
const MIN_BAR_HEIGHT = 6;

/**
 * Deterministic 0..1 "random" per bar index — a sine envelope (the design's
 * wave silhouette) mixed with an index-seeded hash so heights look organic
 * yet are stable across renders.
 */
function barUnit(index: number): number {
  const hash = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  const jitter = hash - Math.floor(hash);
  const wave = 0.5 + 0.5 * Math.sin(index * 0.8);
  return 0.45 * wave + 0.55 * jitter;
}

/** Decorative bar waveform doubling as a progress readout (night player). */
export function Waveform({
  bars = 28,
  progress,
  activeColor,
  inactiveColor,
  height = 28,
}: WaveformProps) {
  const heights = useMemo(
    () =>
      Array.from(
        { length: bars },
        (_, index) => MIN_BAR_HEIGHT + barUnit(index) * Math.max(0, height - MIN_BAR_HEIGHT),
      ),
    [bars, height],
  );
  const clamped = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={[styles.row, { height }]} pointerEvents="none">
      {heights.map((barHeight, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: barHeight,
              backgroundColor: index / bars < clamped ? activeColor : inactiveColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 2,
  },
});
