import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { ApiError } from '@masalim/api-client';
import { StoryStatus } from '@masalim/types';
import type { StoryPage } from '@masalim/validation';
import {
  colors,
  fontFamilies,
  fontSizes,
  letterSpacing,
  night,
  radius,
  spacing,
} from '@masalim/ui';
import { Button } from '../../../src/components/Button';
import { FeatureTour, type TourStep } from '../../../src/components/FeatureTour';
import { Starfield } from '../../../src/components/Starfield';
import { storyThemeEmoji } from '../../../src/components/StorySheet';
import { useActiveTrack, useIsPlaying } from 'react-native-track-player';
import { ChevronLeftIcon, ChevronRightIcon } from '../../../src/components/icons';
import { api } from '../../../src/lib/api';
import { activePageNumber } from '../../../src/lib/narration-sync';
import { usePlayerProgress } from '../../../src/lib/player';
import { registerTourTarget } from '../../../src/lib/tour-targets';
import { useAppPrefs } from '../../../src/stores/app-prefs';

type ReaderSlide = { key: string; kind: 'page'; page: StoryPage } | { key: 'end'; kind: 'end' };

/** Per-page night backdrops from the design (160deg gradients, cycled by page number). */
const PAGE_GRADIENTS: readonly [string, string][] = [
  [colors.purpleDarkest, '#3D2080'],
  [night.bg, '#1E3A5F'],
  [colors.purpleDeep, '#5A3FA8'],
  ['#0F2A1A', '#1A5235'],
  [colors.purpleDarkest, colors.purpleDeep],
];

/** End-of-story backdrop (design's closing night page). */
const END_GRADIENT: readonly [string, string] = [colors.purpleDarkest, colors.purpleDeep];

/** Static wave bars inside the header audio pill. */
const AUDIO_BAR_HEIGHTS = [6, 12, 8, 14] as const;

const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 0.3, y: 1 };

/** Night scaffold: full-bleed gradient + starfield behind the content. */
function NightScaffold({
  backdrop,
  children,
}: {
  backdrop: readonly [string, string, ...string[]];
  children: ReactNode;
}) {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={backdrop}
        start={GRADIENT_START}
        end={GRADIENT_END}
        style={StyleSheet.absoluteFill}
      />
      <Starfield count={20} />
      {children}
    </View>
  );
}

/** Circular translucent back button (design header, dark treatment). */
function BackButton({ label }: { label: string }) {
  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={styles.backButton}
    >
      <ChevronLeftIcon color="#FFFFFF" />
    </Pressable>
  );
}

/** Error/not-ready content styled for the night look (states beyond the design). */
function DarkState({
  emoji,
  title,
  ctaLabel,
  onCta,
}: {
  emoji: string;
  title: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View style={styles.stateWrap}>
      <Text style={styles.stateEmoji}>{emoji}</Text>
      <Text style={styles.stateTitle}>{title}</Text>
      <Button label={ctaLabel} onPress={onCta} style={styles.stateCta} compact />
    </View>
  );
}

/** Gentle vertical float on the illustration card (design's `float` keyframes). */
function FloatingCard({ children }: { children: ReactNode }) {
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [float]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value * -8 }],
  }));

  return <Animated.View style={floatStyle}>{children}</Animated.View>;
}

/** Render page text with quoted dialogue emphasized in gold (design's highlight). */
function renderPageText(text: string): ReactNode {
  const parts = text.split(/(["“][^"”]+["”])/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => {
    const quote = /^(["“])([^"”]+)(["”])$/.exec(part);
    if (quote == null) return part;
    return (
      <Text key={index}>
        {quote[1]}
        <Text style={styles.pageTextHighlight}>{quote[2]}</Text>
        {quote[3]}
      </Text>
    );
  });
}

/** Digital storybook reader: one horizontally-paged night spread per story page. */
export default function Reader() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [slideIndex, setSlideIndex] = useState(0);
  const listRef = useRef<FlatList<ReaderSlide>>(null);

  const storyQuery = useQuery({
    queryKey: ['story', id],
    queryFn: () => api.stories.detail(id),
    enabled: id != null && id.length > 0,
  });
  const story = storyQuery.data;

  // ── Auto-follow ("sesli slayt"): while a narration of THIS story is playing,
  // pages turn with the audio via the narration timings. A manual page change
  // hands control back to the reader; the chip re-engages it.
  const narrationsQuery = useQuery({
    queryKey: ['narrations', id],
    queryFn: () => api.narrations.list(id),
    enabled: id != null && id.length > 0,
  });
  const [follow, setFollow] = useState(true);
  const seenFollowTour = useAppPrefs((state) => state.seenTours.readerFollow === true);
  const markTourSeen = useAppPrefs((state) => state.markTourSeen);
  const [tourVisible, setTourVisible] = useState(false);
  const activeTrack = useActiveTrack();
  const { playing } = useIsPlaying();
  const { position } = usePlayerProgress(500);
  const playingNarration = useMemo(() => {
    const trackId = activeTrack?.id;
    if (trackId == null) return null;
    return (
      (narrationsQuery.data ?? []).find(
        (item) => item.id === trackId && item.timings != null && item.timings.length > 0,
      ) ?? null
    );
  }, [activeTrack?.id, narrationsQuery.data]);
  const syncing = playing === true && playingNarration != null;
  // A freshly loaded narration starts a new listening session — follow again.
  const activeTrackId = activeTrack?.id ?? null;
  useEffect(() => {
    setFollow(true);
  }, [activeTrackId]);

  // One-time hint the first time the auto-follow chip appears.
  useEffect(() => {
    if (seenFollowTour || tourVisible || !syncing) return;
    const timer = setTimeout(() => setTourVisible(true), 900);
    return () => clearTimeout(timer);
  }, [seenFollowTour, tourVisible, syncing]);

  const followTourSteps: TourStep[] = [
    {
      targetKey: 'reader.follow',
      title: t('tour.readerFollowTitle'),
      body: t('tour.readerFollowBody'),
    },
  ];

  useEffect(() => {
    if (!follow || !syncing || story == null) return;
    const timings = playingNarration.timings ?? [];
    const pageNumber = activePageNumber(timings, position);
    if (pageNumber == null) return;
    const sorted = [...story.pages].sort((a, b) => a.pageNumber - b.pageNumber);
    const index = sorted.findIndex((page) => page.pageNumber === pageNumber);
    if (index < 0 || index === slideIndex) return;
    listRef.current?.scrollToIndex({ index, animated: true });
    setSlideIndex(index);
  }, [follow, syncing, playingNarration, position, story, slideIndex]);

  const paddingTop = Math.max(insets.top, 20) + 8;

  if (storyQuery.isLoading) {
    return (
      <NightScaffold backdrop={END_GRADIENT}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.lavender} />
        </View>
      </NightScaffold>
    );
  }

  if (storyQuery.isError || story == null) {
    const errorTitle =
      storyQuery.error instanceof ApiError
        ? t(`errors.${storyQuery.error.code}`, { defaultValue: t('errors.GENERIC') })
        : t('errors.GENERIC');
    return (
      <NightScaffold backdrop={END_GRADIENT}>
        <View style={[styles.headerRow, { paddingTop }]}>
          <BackButton label={t('common.back')} />
        </View>
        <DarkState
          emoji="🌧️"
          title={errorTitle}
          ctaLabel={t('common.retry')}
          onCta={() => void storyQuery.refetch()}
        />
      </NightScaffold>
    );
  }

  const pages = [...story.pages].sort((a, b) => a.pageNumber - b.pageNumber);

  if (story.status !== StoryStatus.READY || pages.length === 0) {
    return (
      <NightScaffold backdrop={END_GRADIENT}>
        <View style={[styles.headerRow, { paddingTop }]}>
          <BackButton label={t('common.back')} />
        </View>
        <DarkState
          emoji="📖"
          title={t('errors.STORY_NOT_READY')}
          ctaLabel={t('common.back')}
          onCta={() => router.back()}
        />
      </NightScaffold>
    );
  }

  const slides: ReaderSlide[] = [
    ...pages.map((page) => ({ key: page.id, kind: 'page' as const, page })),
    { key: 'end', kind: 'end' as const },
  ];

  const activeSlide = slides[Math.min(slideIndex, slides.length - 1)];
  const backdrop =
    activeSlide?.kind === 'page'
      ? (PAGE_GRADIENTS[
          (((activeSlide.page.pageNumber - 1) % PAGE_GRADIENTS.length) + PAGE_GRADIENTS.length) %
            PAGE_GRADIENTS.length
        ] ?? END_GRADIENT)
      : END_GRADIENT;
  const displayPage = Math.min(slideIndex + 1, pages.length);
  const activeDot = Math.min(slideIndex, pages.length - 1);

  const goToSlide = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), slides.length - 1);
    if (syncing) setFollow(false);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
    setSlideIndex(clamped);
  };

  // Only a real finger drag hands control back to the reader — programmatic
  // scrolls never fire onScrollBeginDrag, while Android fires momentum-end for
  // them too (sometimes twice), so momentum-end must not be treated as a swipe.
  const onScrollBeginDrag = () => {
    if (syncing) setFollow(false);
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setSlideIndex(Math.min(Math.max(index, 0), slides.length - 1));
  };

  const renderSlide = ({ item, index }: { item: ReaderSlide; index: number }) => {
    if (item.kind === 'end') {
      return (
        <View style={[styles.slide, { width }]}>
          <View style={styles.endWrap}>
            <Text style={styles.endStar}>⭐</Text>
            <Text style={styles.endTitle}>{t('reader.theEnd')}</Text>
            <Button
              label={t('common.done')}
              onPress={() => router.back()}
              style={styles.endButton}
              compact
            />
          </View>
        </View>
      );
    }

    const { page } = item;
    const isFirst = index === 0;
    return (
      <View style={[styles.slide, { width }]}>
        <View style={styles.illustrationArea}>
          <FloatingCard>
            <View style={styles.illustrationCard}>
              <View style={styles.illustrationClip}>
                {page.illustrationUrl != null ? (
                  <Image
                    source={{ uri: page.illustrationUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Text style={styles.illustrationEmoji}>{storyThemeEmoji(story.themes)}</Text>
                )}
              </View>
            </View>
          </FloatingCard>
        </View>
        <View style={[styles.textPanel, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
          <ScrollView
            style={[styles.textScroll, { maxHeight: Math.round(height * 0.3) }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.pageText}>{renderPageText(page.text)}</Text>
          </ScrollView>
          <View style={styles.pageNavRow}>
            <Pressable
              onPress={() => goToSlide(index - 1)}
              disabled={isFirst}
              accessibilityRole="button"
              accessibilityLabel={t('reader.previous')}
              accessibilityState={{ disabled: isFirst }}
              style={[styles.navButton, styles.navButtonPrev, isFirst && styles.navButtonDisabled]}
            >
              <ChevronLeftIcon
                size={16}
                color={isFirst ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)'}
              />
              <Text style={[styles.navLabel, isFirst && styles.navLabelDisabled]}>
                {t('reader.previous')}
              </Text>
            </Pressable>
            <Text style={styles.navCounter}>
              {t('reader.pageOf', { current: index + 1, total: pages.length })}
            </Text>
            <Pressable
              onPress={() => goToSlide(index + 1)}
              accessibilityRole="button"
              accessibilityLabel={t('reader.next')}
              style={[styles.navButton, styles.navButtonNext]}
            >
              <Text style={[styles.navLabel, styles.navLabelNext]}>{t('reader.next')}</Text>
              <ChevronRightIcon size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  return (
    <NightScaffold backdrop={backdrop}>
      <View style={[styles.headerRow, { paddingTop }]}>
        <BackButton label={t('common.back')} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {story.title.toLocaleUpperCase('tr')}
          </Text>
          <Text style={styles.headerPage}>
            {t('reader.pageLabel', { current: displayPage, total: pages.length })}
          </Text>
        </View>
        {story.latestNarration != null ? (
          <Pressable
            onPress={() => router.push(`/story/${story.id}/player` as never)}
            accessibilityRole="button"
            accessibilityLabel={t('player.narratedBy', {
              name: story.latestNarration.narratorName,
            })}
            style={styles.audioPill}
          >
            <View style={styles.audioBars}>
              {AUDIO_BAR_HEIGHTS.map((barHeight, barIndex) => (
                <View key={barIndex} style={[styles.audioBar, { height: barHeight }]} />
              ))}
            </View>
            <Text style={styles.audioPillText}>{`🎙 ${story.latestNarration.narratorName}`}</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      <View style={styles.dotsRow}>
        {pages.map((page, index) => (
          <Pressable
            key={page.id}
            onPress={() => goToSlide(index)}
            accessibilityRole="button"
            accessibilityLabel={t('reader.pageLabel', { current: index + 1, total: pages.length })}
            hitSlop={10}
            style={[styles.dot, index === activeDot && styles.dotActive]}
          />
        ))}
      </View>
      {syncing || (playingNarration != null && !follow) ? (
        <View style={styles.followRow}>
          <Pressable
            ref={(view) => registerTourTarget('reader.follow', view)}
            onPress={() => setFollow((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ selected: follow }}
            accessibilityLabel={t('reader.autoFollow')}
            style={[styles.followChip, follow && styles.followChipOn]}
          >
            <Text style={[styles.followChipText, follow && styles.followChipTextOn]}>
              {follow ? `🎵 ${t('reader.autoFollowOn')}` : `✋ ${t('reader.autoFollowOff')}`}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <FeatureTour
        steps={followTourSteps}
        visible={tourVisible}
        onDone={() => {
          setTourVisible(false);
          markTourSeen('readerFollow');
        }}
      />
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.key}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={onScrollBeginDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />
    </NightScaffold>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.purpleDarkest },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: letterSpacing.eyebrow,
  },
  headerPage: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  headerSpacer: { width: 40 },
  audioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.chip,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  audioBars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 16 },
  audioBar: { width: 3, borderRadius: 2, backgroundColor: colors.lavender },
  audioPillText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.8)',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
  },
  followRow: { alignItems: 'center', paddingTop: spacing.sm },
  followChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  followChipOn: {
    borderColor: 'rgba(176,156,224,0.7)',
    backgroundColor: 'rgba(176,156,224,0.22)',
  },
  followChipText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  followChipTextOn: { color: '#FFFFFF' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: { width: 24, backgroundColor: 'rgba(255,255,255,0.9)' },
  slide: { justifyContent: 'flex-end' },
  illustrationArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.pageXWide,
  },
  illustrationCard: {
    width: 220,
    height: 220,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 12,
  },
  illustrationClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationEmoji: { fontSize: 100, lineHeight: 120 },
  textPanel: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: spacing.xl,
    paddingHorizontal: 28,
    minHeight: 200,
  },
  textScroll: { flexGrow: 0, marginBottom: spacing.xl },
  pageText: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.xxl,
    lineHeight: 31,
    color: 'rgba(255,255,255,0.92)',
  },
  pageTextHighlight: { fontFamily: fontFamilies.display, color: colors.gold },
  pageNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.chip,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  navButtonPrev: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  navButtonNext: {
    backgroundColor: 'rgba(176,156,224,0.3)',
    borderColor: 'rgba(176,156,224,0.4)',
  },
  navButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  navLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: 'rgba(255,255,255,0.8)',
  },
  navLabelDisabled: { color: 'rgba(255,255,255,0.25)' },
  navLabelNext: { color: '#FFFFFF' },
  navCounter: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.45)',
  },
  endWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.pageXWide,
  },
  endStar: { fontSize: 56 },
  endTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
  },
  endButton: { alignSelf: 'stretch', marginTop: spacing.lg },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.pageXWide,
  },
  stateEmoji: { fontSize: 48, marginBottom: spacing.md },
  stateTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  stateCta: { alignSelf: 'stretch' },
});
