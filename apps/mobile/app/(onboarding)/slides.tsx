import { useEffect, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { colors, fontFamilies, fontSizes, letterSpacing, spacing } from '@masalim/ui';
import { Button } from '../../src/components/Button';
import { useAppPrefs } from '../../src/stores/app-prefs';

/** Slide 1 — parent reading to child in an armchair. */
function ReadingIllustration() {
  return (
    <Svg width={220} height={180} viewBox="0 0 220 180" fill="none">
      <Ellipse cx={110} cy={160} rx={80} ry={12} fill="rgba(176,156,224,0.15)" />
      <Rect x={50} y={100} width={120} height={60} rx={20} fill={colors.secondary} />
      <Rect x={36} y={90} width={28} height={70} rx={14} fill={colors.lavenderLight} />
      <Rect x={156} y={90} width={28} height={70} rx={14} fill={colors.lavenderLight} />
      <Circle cx={95} cy={80} r={20} fill={colors.peach} />
      <Rect x={70} y={98} width={50} height={48} rx={16} fill={colors.primary} />
      <Circle cx={138} cy={90} r={16} fill={colors.peach} />
      <Rect x={118} y={104} width={40} height={38} rx={12} fill={colors.coral} />
      <Rect
        x={78}
        y={112}
        width={44}
        height={32}
        rx={6}
        fill={colors.cream}
        stroke={colors.lavender}
        strokeWidth={1.5}
      />
      <Line x1={100} y1={112} x2={100} y2={144} stroke={colors.lavender} strokeWidth={1} />
      <Circle cx={170} cy={40} r={3} fill={colors.gold} />
      <Circle cx={55} cy={55} r={2} fill={colors.lavender} />
      <Circle cx={185} cy={75} r={2} fill={colors.coral} />
      <Path d="M158 25l2 5 5 1-4 4 1 5-4-3-4 3 1-5-4-4 5-1z" fill={colors.gold} />
    </Svg>
  );
}

/** Slide 2 — personalized story card with name badge. */
function StoryCardIllustration() {
  return (
    <Svg width={220} height={180} viewBox="0 0 220 180" fill="none">
      <Rect
        x={30}
        y={20}
        width={160}
        height={140}
        rx={20}
        fill={colors.card}
        stroke={colors.secondary}
        strokeWidth={1.5}
      />
      <Rect x={30} y={20} width={160} height={72} rx={20} fill={colors.secondary} />
      <Rect x={30} y={72} width={160} height={20} fill={colors.secondary} />
      <Circle cx={110} cy={55} r={25} fill={colors.lavenderLight} />
      <Circle cx={110} cy={45} r={12} fill={colors.peach} />
      <Path d="M90 68c0-11 9-18 20-18s20 7 20 18" fill={colors.primary} />
      <Rect x={50} y={108} width={120} height={8} rx={4} fill={colors.secondary} />
      <Rect x={50} y={122} width={80} height={6} rx={3} fill={colors.muted} />
      <Rect x={55} y={136} width={60} height={16} rx={8} fill={colors.primary} />
      <SvgText
        x={85}
        y={148}
        textAnchor="middle"
        fill={colors.primaryForeground}
        fontSize={9}
        fontFamily={fontFamilies.bodyBold}
        fontWeight="700"
      >
        {"Ege'nin Masalı"}
      </SvgText>
      <Circle cx={48} cy={30} r={3} fill={colors.gold} />
      <Circle cx={178} cy={150} r={2} fill={colors.coral} />
      <Path d="M175 28l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill={colors.gold} opacity={0.7} />
    </Svg>
  );
}

/** Slide 3 — mic, sound waves and heart. */
function VoiceIllustration() {
  return (
    <Svg width={220} height={180} viewBox="0 0 220 180" fill="none">
      <Rect
        x={70}
        y={70}
        width={80}
        height={80}
        rx={16}
        fill={colors.card}
        stroke={colors.secondary}
        strokeWidth={1.5}
      />
      <Path
        d="M90 90C95 85 105 85 110 90C115 95 125 95 130 90"
        stroke={colors.primary}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M82 100C90 90 110 90 118 100C126 110 146 110 154 100"
        stroke={colors.lavender}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
      <Rect x={100} y={108} width={20} height={28} rx={10} fill={colors.coral} />
      <Path
        d="M92 124c0 10 8 16 18 16s18-6 18-16"
        stroke={colors.coral}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      <Line x1={110} y1={140} x2={110} y2={148} stroke={colors.coral} strokeWidth={2} strokeLinecap="round" />
      <Rect x={45} y={95} width={6} height={20} rx={3} fill={colors.lavender} opacity={0.4} />
      <Rect x={36} y={100} width={6} height={10} rx={3} fill={colors.lavender} opacity={0.3} />
      <Rect x={163} y={95} width={6} height={20} rx={3} fill={colors.lavender} opacity={0.4} />
      <Rect x={172} y={100} width={6} height={10} rx={3} fill={colors.lavender} opacity={0.3} />
      <Path
        d="M108 78c0 0-8-6-8-12 0-4 3-6 6-6 1.5 0 3 0.8 4 2 1-1.2 2.5-2 4-2 3 0 6 2 6 6 0 6-12 12-12 12z"
        fill={colors.coral}
      />
    </Svg>
  );
}

/** Slide 4 — physical book mockup. */
function BookIllustration() {
  return (
    <Svg width={220} height={180} viewBox="0 0 220 180" fill="none">
      <Rect x={55} y={30} width={100} height={130} rx={8} fill={colors.primary} />
      <Rect
        x={65}
        y={25}
        width={100}
        height={130}
        rx={8}
        fill={colors.card}
        stroke={colors.secondary}
        strokeWidth={1.5}
      />
      <Rect x={65} y={25} width={100} height={72} rx={8} fill={colors.secondary} />
      <Rect x={65} y={81} width={100} height={16} fill={colors.secondary} />
      <Circle cx={115} cy={56} r={20} fill={colors.lavenderLight} />
      <Circle cx={115} cy={47} r={10} fill={colors.peach} />
      <Path d="M98 68c0-9 8-15 17-15s17 6 17 15" fill={colors.primary} />
      <Circle cx={102} cy={38} r={2} fill={colors.gold} />
      <Circle cx={128} cy={35} r={1.5} fill={colors.gold} />
      <Rect x={78} y={104} width={74} height={8} rx={4} fill={colors.secondary} />
      <Rect x={84} y={118} width={62} height={6} rx={3} fill={colors.muted} />
      <Rect x={55} y={30} width={10} height={130} rx={4} fill={colors.secondaryForeground} />
      <Rect x={150} y={30} width={15} height={130} rx={8} fill="rgba(255,255,255,0.15)" />
    </Svg>
  );
}

interface Slide {
  titleKey: string;
  bodyKey: string;
  Illustration: ComponentType;
}

const slides = [
  {
    titleKey: 'onboarding.slide1Title',
    bodyKey: 'onboarding.slide1Body',
    Illustration: ReadingIllustration,
  },
  {
    titleKey: 'onboarding.slide2Title',
    bodyKey: 'onboarding.slide2Body',
    Illustration: StoryCardIllustration,
  },
  {
    titleKey: 'onboarding.slide3Title',
    bodyKey: 'onboarding.slide3Body',
    Illustration: VoiceIllustration,
  },
  {
    titleKey: 'onboarding.slide4Title',
    bodyKey: 'onboarding.slide4Body',
    Illustration: BookIllustration,
  },
] as const satisfies readonly Slide[];

interface DotProps {
  active: boolean;
  label: string;
  onPress: () => void;
}

/** Pagination dot: active dot animates to a 24px pill. */
function Dot({ active, label, onPress }: DotProps) {
  const width = useSharedValue(active ? 24 : 8);

  useEffect(() => {
    width.value = withTiming(active ? 24 : 8, { duration: 250 });
  }, [active, width]);

  const widthStyle = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={8}
    >
      <Animated.View style={[styles.dot, active ? styles.dotActive : styles.dotInactive, widthStyle]} />
    </Pressable>
  );
}

/** Onboarding slides — 4 illustrated value-prop screens with skip/CTA. */
export default function Slides() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(0);

  const slide = slides[current] ?? slides[0];
  const isLast = current === slides.length - 1;
  const Illustration = slide.Illustration;

  const complete = () => {
    useAppPrefs.getState().setHasSeenOnboarding(true);
    router.replace('/(auth)/welcome');
  };

  const next = () => {
    if (isLast) {
      complete();
    } else {
      setCurrent((value) => value + 1);
    }
  };

  return (
    <View style={styles.root}>
      <Svg width={240} height={240} style={styles.glow} pointerEvents="none">
        <Defs>
          <RadialGradient id="onboardingGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.lavender} stopOpacity={0.2} />
            <Stop offset="70%" stopColor={colors.lavender} stopOpacity={0} />
            <Stop offset="100%" stopColor={colors.lavender} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={120} cy={120} r={120} fill="url(#onboardingGlow)" />
      </Svg>

      <View style={[styles.skipRow, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <View style={styles.skipSlot}>
          {!isLast ? (
            <Pressable
              onPress={complete}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.skip')}
              hitSlop={8}
              style={styles.skipButton}
            >
              <Text style={styles.skipLabel}>{t('onboarding.skip')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Animated.View
        key={`illustration-${current}`}
        entering={FadeIn.duration(400)}
        style={styles.illustration}
      >
        <Illustration />
      </Animated.View>

      <Animated.View key={`text-${current}`} entering={FadeInUp.duration(500)} style={styles.content}>
        <Text style={styles.headline}>{t(slide.titleKey)}</Text>
        <Text style={styles.sub}>{t(slide.bodyKey)}</Text>
      </Animated.View>

      <View style={[styles.bottom, { bottom: Math.max(insets.bottom, 16) + 32 }]}>
        <View style={styles.dots}>
          {slides.map((item, index) => (
            <Dot
              key={item.titleKey}
              active={index === current}
              label={t(item.titleKey)}
              onPress={() => setCurrent(index)}
            />
          ))}
        </View>
        <Button
          label={isLast ? t('onboarding.start') : t('common.continue')}
          onPress={next}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  glow: { position: 'absolute', top: -80, right: -60 },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.pageX,
  },
  skipSlot: { height: 36, justifyContent: 'center' },
  skipButton: { paddingVertical: spacing.xs },
  skipLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
  illustration: { alignItems: 'center', marginTop: spacing.xl },
  content: { paddingHorizontal: spacing.pageXWide, paddingTop: spacing.xxl },
  headline: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.displayXl,
    lineHeight: Math.round(fontSizes.displayXl * 1.2),
    color: colors.foreground,
    letterSpacing: letterSpacing.tight,
    marginBottom: spacing.md,
  },
  sub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xl,
    lineHeight: Math.round(fontSizes.xl * 1.6),
    color: colors.mutedForeground,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.pageXWide,
    alignItems: 'center',
    gap: spacing.lg,
  },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: colors.primary },
  dotInactive: { backgroundColor: colors.border },
  cta: { alignSelf: 'stretch' },
});
