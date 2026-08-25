import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';

/** Shimmering skeleton block (`State/Loading` list/card variants). */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.45 + pulse.value * 0.4 }));
  return <Animated.View style={[styles.skeleton, style, animated]} />;
}

/** One list-row skeleton matching the library/orders card geometry. */
function SkeletonRow() {
  return (
    <View style={styles.rowCard}>
      <Skeleton style={styles.rowThumb} />
      <View style={styles.rowBody}>
        <Skeleton style={{ width: '70%', height: 14 }} />
        <Skeleton style={{ width: '50%', height: 12 }} />
        <Skeleton style={{ width: '40%', height: 10 }} />
      </View>
    </View>
  );
}

interface LoadingStateProps {
  variant?: 'page' | 'list';
  label?: string;
  rows?: number;
}

/**
 * `State/Loading` from the final design. `page`: centered spinner + optional
 * label; `list`: shimmering skeleton cards (default 3). Generation-style night
 * loaders stay screen-local (they carry real job progress).
 */
export function LoadingState({ variant = 'page', label, rows = 3 }: LoadingStateProps) {
  if (variant === 'list') {
    return (
      <View style={styles.listRoot}>
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.pageRoot}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={styles.pageLabel}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
  },
  pageRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: spacing.md,
  },
  pageLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
  listRoot: { gap: spacing.sm, paddingHorizontal: spacing.pageX },
  rowCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  rowThumb: { width: 72, height: 90, borderRadius: radius.chip },
  rowBody: { flex: 1, gap: 10, justifyContent: 'center' },
});
