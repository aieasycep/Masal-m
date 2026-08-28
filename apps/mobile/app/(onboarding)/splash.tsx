import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors, fontFamilies, fontSizes, gradients, letterSpacing } from '@masalim/ui';
import { Starfield } from '../../src/components/Starfield';

/** Gentle vertical float (±6px), matching the design's `float` keyframes. */
function useFloatStyle(duration: number) {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withRepeat(
      withTiming(-6, { duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [duration, offset]);

  return useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
}

/** 52px open-book logo mark — paths copied from the design reference. */
function BookLogo() {
  return (
    <Svg width={52} height={52} viewBox="0 0 52 52" fill="none">
      <Path
        d="M26 10C22 6 14 5 6 8v28c8-3 16-2 20 2V10z"
        fill="rgba(255,220,150,0.6)"
        stroke="rgba(255,220,150,0.9)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M26 10C30 6 38 5 46 8v28c-8-3-16-2-20 2V10z"
        fill="rgba(176,156,224,0.5)"
        stroke="rgba(176,156,224,0.9)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Line x1={26} y1={10} x2={26} y2={40} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
      <Circle cx={14} cy={22} r={2} fill="rgba(255,220,150,0.9)" />
      <Circle cx={38} cy={18} r={1.5} fill="rgba(176,156,224,1)" />
      <Circle cx={38} cy={26} r={1} fill="rgba(255,255,255,0.7)" />
    </Svg>
  );
}

/** Splash — night sky, starfield, floating moon + book logo, tap to continue. */
export default function Splash() {
  const { t } = useTranslation();
  const moonFloatStyle = useFloatStyle(4000);
  const logoFloatStyle = useFloatStyle(3000);
  const hintPulse = useSharedValue(1);

  useEffect(() => {
    hintPulse.value = withRepeat(
      withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [hintPulse]);

  const hintPulseStyle = useAnimatedStyle(() => ({ opacity: hintPulse.value }));

  return (
    <Pressable
      style={styles.root}
      onPress={() => router.push('/(onboarding)/slides')}
      accessibilityRole="button"
      accessibilityLabel={t('splash.tapToStart')}
    >
      <LinearGradient
        colors={gradients.nightSky as unknown as [string, string, ...string[]]}
        locations={[0, 0.4, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Starfield />

      <Animated.View style={[styles.moon, moonFloatStyle]}>
        <View style={styles.moonHighlight} />
      </Animated.View>

      <View style={styles.center}>
        <Animated.View style={[styles.logoTileShadow, logoFloatStyle]}>
          <LinearGradient
            colors={['rgba(176,156,224,0.3)', 'rgba(124,92,191,0.4)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoTile}
          >
            <BookLogo />
          </LinearGradient>
        </Animated.View>

        <View style={styles.wordmarkGroup}>
          <Animated.Text entering={FadeInUp.duration(800)} style={styles.wordmark}>
            {t('common.appName')}
          </Animated.Text>
          <Animated.Text entering={FadeInUp.duration(800).delay(200)} style={styles.tagline}>
            {t('common.tagline').toLocaleUpperCase('tr')}
          </Animated.Text>
        </View>
      </View>

      <Animated.Text style={[styles.hint, hintPulseStyle]}>{t('splash.tapToStart')}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  moon: {
    position: 'absolute',
    top: 80,
    right: 60,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,220,150,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,220,150,0.3)',
  },
  moonHighlight: {
    position: 'absolute',
    top: 8,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,220,150,0.25)',
  },
  center: { alignItems: 'center', gap: 16, zIndex: 1 },
  logoTileShadow: { marginBottom: 8 },
  logoTile: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(176,156,224,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkGroup: { alignItems: 'center', gap: 6 },
  wordmark: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.wordmark,
    lineHeight: fontSizes.wordmark,
    color: colors.primaryForeground,
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: 'rgba(176,156,224,0.9)',
    letterSpacing: letterSpacing.wide,
  },
  hint: {
    position: 'absolute',
    bottom: 60,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
});
