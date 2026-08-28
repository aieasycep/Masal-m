import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@masalim/ui';
import { usePrefersReducedMotion } from '../lib/motion';

interface StarfieldProps {
  /** Number of deterministic star dots (design uses 28). */
  count?: number;
}

interface StarProps {
  index: number;
}

/** One deterministic star dot with a gentle opacity pulse. */
function Star({ index }: StarProps) {
  const size = index % 3 === 0 ? 3 : 2;
  const baseOpacity = 0.4 + (index % 5) * 0.1;
  const top: DimensionValue = `${(index * 37 + 7) % 100}%`;
  const left: DimensionValue = `${(index * 53 + 11) % 100}%`;
  const pulse = useSharedValue(1);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withDelay(
      (index * 300) % 2000,
      withRepeat(
        withTiming(0.6, {
          duration: 1500 + (index % 4) * 500,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      ),
    );
  }, [index, pulse, reducedMotion]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: baseOpacity * pulse.value }));

  return (
    <Animated.View
      style={[
        styles.star,
        { width: size, height: size, borderRadius: size / 2, top, left },
        pulseStyle,
      ]}
    />
  );
}

/** Night-sky starfield overlay (splash, generating, recording screens). */
export function Starfield({ count = 28 }: StarfieldProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: count }, (_, index) => (
        <Star key={index} index={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  star: { position: 'absolute', backgroundColor: colors.card },
});
