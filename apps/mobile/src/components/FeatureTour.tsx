import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Mask, Rect } from 'react-native-svg';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { measureTourTarget, type TourRect } from '../lib/tour-targets';
import { Button } from './Button';

export interface TourStep {
  /** Registered spotlight target (src/lib/tour-targets). */
  targetKey: string;
  title: string;
  body: string;
}

interface FeatureTourProps {
  steps: TourStep[];
  visible: boolean;
  /** Fired once, on finishing the last step OR skipping. */
  onDone: () => void;
}

const HOLE_PADDING = 8;
const CARD_GAP = 14;
const CARD_HEIGHT_GUESS = 190;

/**
 * First-run spotlight tour: dims the screen with an SVG-masked scrim, cuts a
 * rounded hole around the current step's target and explains it in a card.
 * Steps whose target cannot be measured (not rendered) are skipped silently.
 */
export function FeatureTour({ steps, visible, onDone }: FeatureTourProps) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const [stepIndex, setStepIndex] = useState(0);
  const [hole, setHole] = useState<TourRect | null>(null);

  const step = steps[stepIndex];

  const advance = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      onDone();
    } else {
      setStepIndex(stepIndex + 1);
    }
  }, [stepIndex, steps.length, onDone]);

  // Measure the current target; unmeasurable or off-screen → skip the step.
  useEffect(() => {
    if (!visible || step == null) return;
    let cancelled = false;
    void measureTourTarget(step.targetKey).then((rect) => {
      if (cancelled) return;
      const offScreen = rect != null && (rect.y >= height - 60 || rect.y + rect.height <= 0);
      if (rect == null || offScreen) {
        advance();
      } else {
        setHole(rect);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, step, advance, height]);

  useEffect(() => {
    if (!visible) {
      setStepIndex(0);
      setHole(null);
    }
  }, [visible]);

  if (!visible || step == null || hole == null) return null;

  const holeX = Math.max(0, hole.x - HOLE_PADDING);
  const holeY = Math.max(0, hole.y - HOLE_PADDING);
  const holeW = Math.min(width - holeX, hole.width + HOLE_PADDING * 2);
  const holeH = hole.height + HOLE_PADDING * 2;

  // Card below the hole when there is room, else above it.
  const belowTop = holeY + holeH + CARD_GAP;
  const cardTop =
    belowTop + CARD_HEIGHT_GUESS <= height
      ? belowTop
      : Math.max(spacing.lg, holeY - CARD_GAP - CARD_HEIGHT_GUESS);
  const isLast = stepIndex >= steps.length - 1;

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onDone}>
      <View style={styles.root}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Mask id="tourHole">
            <Rect width={width} height={height} fill="#FFFFFF" />
            <Rect x={holeX} y={holeY} width={holeW} height={holeH} rx={radius.lg} fill="#000000" />
          </Mask>
          <Rect width={width} height={height} fill="rgba(13,27,46,0.85)" mask="url(#tourHole)" />
        </Svg>
        {/* Tapping anywhere outside the card also advances. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={advance}
          accessibilityLabel={t(isLast ? 'tour.done' : 'tour.next')}
        />
        <Animated.View
          key={`tour-card-${stepIndex}`}
          entering={FadeIn.duration(250)}
          style={[styles.card, { top: cardTop, left: spacing.lg, right: spacing.lg }]}
        >
          <Text style={styles.title} accessibilityRole="header">
            {step.title}
          </Text>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.dotsRow}>
            {steps.map((item, index) => (
              <View
                key={item.targetKey}
                style={[styles.dot, index === stepIndex && styles.dotActive]}
              />
            ))}
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={onDone}
              accessibilityRole="button"
              accessibilityLabel={t('tour.skip')}
              style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.skipLabel}>{t('tour.skip')}</Text>
            </Pressable>
            <Button
              label={t(isLast ? 'tour.done' : 'tour.next')}
              onPress={advance}
              compact
              style={styles.nextButton}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    position: 'absolute',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.cardMedium,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.xl,
    color: colors.foreground,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    lineHeight: 22,
    color: colors.mutedForeground,
  },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 20, backgroundColor: colors.primary },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  skipButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  skipLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  nextButton: { minWidth: 120 },
});
