import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, { Event, useIsPlaying, useTrackPlayerEvents } from 'react-native-track-player';
import type { ReactNode } from 'react';
import { NarrationStatus } from '@masalim/types';
import { ApiError } from '@masalim/api-client';
import type { Narration, StoryDetail } from '@masalim/validation';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  letterSpacing,
  night,
  radius,
  shadows,
  spacing,
} from '@masalim/ui';
import { api } from '../../../src/lib/api';
import {
  activePageNumber,
  activeWordIndexOnPage,
  wordStartSeconds,
} from '../../../src/lib/narration-sync';
import { useAppPrefs } from '../../../src/stores/app-prefs';
import { usePlayerStore } from '../../../src/stores/player';
import {
  jumpBack,
  jumpForward,
  loadNarration,
  narratorLabel,
  seekTo,
  setRate as setPlayerRate,
  setupPlayer,
  togglePlay,
  usePlayerProgress,
  usePositionPersistence,
} from '../../../src/lib/player';
import { KaraokeText } from '../../../src/components/KaraokeText';
import { Button } from '../../../src/components/Button';
import { Starfield } from '../../../src/components/Starfield';
import { Waveform } from '../../../src/components/Waveform';
import {
  ArrowLeftIcon,
  ClockIcon,
  FileTextIcon,
  KebabIcon,
  PauseIcon,
  PlayIcon,
  ShareIcon,
  Skip15Icon,
} from '../../../src/components/icons';

const RATES = [0.8, 1, 1.2, 1.5] as const;
const SLEEP_MINUTE_OPTIONS = [5, 10, 15, 30] as const;
const FADE_STEPS = 10;
const FADE_STEP_MS = 300;
const SLIDER_THUMB = 14;

type SleepTimerState =
  { kind: 'minutes'; minutes: number; endsAt: number } | { kind: 'endOfStory' } | null;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}


interface AmbientGlowProps {
  id: string;
  size: number;
  color: string;
  maxOpacity: number;
  style: StyleProp<ViewStyle>;
}

/** Soft radial glow (the design's ambient night lighting). */
function AmbientGlow({ id, size, color, maxOpacity, style }: AmbientGlowProps) {
  return (
    <View pointerEvents="none" style={[styles.glow, { width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={maxOpacity} />
            <Stop offset="70%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Night scaffold: bg + two ambient glows + starfield behind the content. */
function NightScreen({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <AmbientGlow
        id="playerGlowTop"
        size={400}
        color={colors.primary}
        maxOpacity={0.2}
        style={styles.glowTop}
      />
      <AmbientGlow
        id="playerGlowBottom"
        size={260}
        color={night.blue}
        maxOpacity={0.15}
        style={styles.glowBottom}
      />
      <Starfield count={24} />
      {children}
    </View>
  );
}

interface NightSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Night-styled bottom sheet (ConfirmSheet structure, dark palette). */
function NightSheet({ visible, onClose, title, children }: NightSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.sheetGrabber} />
        {title != null ? <Text style={styles.sheetTitle}>{title}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

interface SheetRowProps {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  active?: boolean;
}

function SheetRow({ label, onPress, icon, active = false }: SheetRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.sheetRow,
        active && styles.sheetRowActive,
        pressed && styles.pressedDim,
      ]}
    >
      {icon != null ? <View style={styles.sheetRowIcon}>{icon}</View> : null}
      <Text style={[styles.sheetRowLabel, active && styles.sheetRowLabelActive]}>{label}</Text>
    </Pressable>
  );
}

interface SeekSliderProps {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
}

/** Custom seek slider: 4px track, white 14px thumb, pan + tap to seek. */
function SeekSlider({ position, duration, onSeek }: SeekSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const dragFractionRef = useRef<number | null>(null);

  const updateDrag = (x: number) => {
    if (trackWidth <= 0) return;
    const fraction = Math.min(Math.max(x / trackWidth, 0), 1);
    dragFractionRef.current = fraction;
    setDragFraction(fraction);
  };

  const commitDrag = () => {
    const fraction = dragFractionRef.current;
    dragFractionRef.current = null;
    setDragFraction(null);
    if (fraction != null && duration > 0) onSeek(fraction * duration);
  };

  // Touch-down jumps the thumb, drag scrubs, release seeks. onFinalize also
  // covers plain taps (onBegin → release without pan activation).
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(1)
    .onBegin((event) => updateDrag(event.x))
    .onUpdate((event) => updateDrag(event.x))
    .onFinalize(() => commitDrag());

  const fraction = dragFraction ?? (duration > 0 ? Math.min(position / duration, 1) : 0);
  const shownSeconds = fraction * duration;
  const remaining = Math.max(0, duration - shownSeconds);

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          style={styles.sliderHit}
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: trackWidth * fraction }]} />
          </View>
          <View
            style={[
              styles.sliderThumb,
              { left: Math.max(0, trackWidth * fraction - SLIDER_THUMB / 2) },
            ]}
          />
        </View>
      </GestureDetector>
      <View style={styles.timesRow}>
        <Text style={styles.timeText}>{formatTime(shownSeconds)}</Text>
        <Text style={styles.timeText}>-{formatTime(remaining)}</Text>
      </View>
    </View>
  );
}

/**
 * Night audio player. Loads the narration into RNTP (background playback —
 * the player is deliberately NOT reset on unmount), restores the saved
 * position, and keeps the continue-listening position persisted.
 */
export default function StoryPlayer() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id, narrationId } = useLocalSearchParams<{ id: string; narrationId?: string }>();

  const storyQuery = useQuery({
    queryKey: ['story', id],
    queryFn: () => api.stories.detail(id),
    enabled: id != null && id.length > 0,
  });
  const narrationsQuery = useQuery({
    queryKey: ['narrations', id],
    queryFn: () => api.narrations.list(id),
    enabled: id != null && id.length > 0,
  });
  const story = storyQuery.data;

  const readyNarrations = useMemo(() => {
    const items = narrationsQuery.data ?? [];
    return items.filter((item) => item.status === NarrationStatus.READY && item.audioUrl != null);
  }, [narrationsQuery.data]);

  // Pick: explicit param → saved playback position → newest READY.
  const narration = useMemo(() => {
    if (readyNarrations.length === 0) return null;
    const fromParam = readyNarrations.find((item) => item.id === narrationId);
    if (fromParam != null) return fromParam;
    const positionNarrationId = story?.playbackPosition?.narrationId;
    const fromPosition = readyNarrations.find((item) => item.id === positionNarrationId);
    if (fromPosition != null) return fromPosition;
    return [...readyNarrations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }, [readyNarrations, narrationId, story]);

  const pages = useMemo(
    () => (story != null ? [...story.pages].sort((a, b) => a.pageNumber - b.pageNumber) : []),
    [story],
  );

  // Seed from the "Ses ve Oynatma" default; in-session changes stay local.
  const defaultPlaybackRate = useAppPrefs((state) => state.defaultPlaybackRate);
  const autoFollowPage = useAppPrefs((state) => state.autoFollowPage);
  const initialRate = (RATES as readonly number[]).includes(defaultPlaybackRate)
    ? defaultPlaybackRate
    : 1;
  const [rate, setRateState] = useState<number>(initialRate);
  const rateRef = useRef(initialRate);
  const [showText, setShowText] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timerSheetOpen, setTimerSheetOpen] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<SleepTimerState>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedNarrationId, setLoadedNarrationId] = useState<string | null>(null);

  const loadedNarrationIdRef = useRef<string | null>(null);
  const sleepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTokenRef = useRef(0);
  const textScrollRef = useRef<ScrollView>(null);
  const paragraphYRef = useRef<Record<number, number>>({});

  const { playing } = useIsPlaying();
  const isPlaying = playing === true;
  // 250ms ticks so the karaoke word highlight keeps up with speech.
  const { position, duration: liveDuration } = usePlayerProgress(250);

  usePositionPersistence(id, loadedNarrationId ?? undefined);

  // Cover floats ±8px only while playing.
  const float = useSharedValue(0);
  useEffect(() => {
    if (isPlaying) {
      float.value = withRepeat(
        withTiming(-8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(float);
      float.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) });
    }
  }, [isPlaying, float]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  // Setup → load → restore position → apply remembered rate → play.
  const startLoad = useCallback(async (storyValue: StoryDetail, narrationValue: Narration) => {
    try {
      setLoadFailed(false);
      await setupPlayer();
      await loadNarration({
        narration: narrationValue,
        story: storyValue,
        artworkUrl: storyValue.coverImageUrl ?? undefined,
      });
      setLoadedNarrationId(narrationValue.id);
      // Mirror the loaded narration for the mini player (RNTP tracks carry no storyId).
      usePlayerStore.getState().setNowPlaying({
        storyId: storyValue.id,
        narrationId: narrationValue.id,
        title: storyValue.title,
        subtitle: narratorLabel(narrationValue),
        artworkUrl: storyValue.coverImageUrl ?? null,
      });
      const saved = storyValue.playbackPosition;
      if (saved != null && saved.narrationId === narrationValue.id && saved.positionSeconds > 1) {
        await seekTo(saved.positionSeconds);
      }
      await setPlayerRate(rateRef.current);
      await TrackPlayer.play();
    } catch {
      loadedNarrationIdRef.current = null;
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (story == null || narration == null) return;
    if (loadedNarrationIdRef.current === narration.id) return;
    loadedNarrationIdRef.current = narration.id;
    void startLoad(story, narration);
  }, [story, narration, startLoad]);

  // End of story: pause, rewind to the start, clear an end-of-story timer.
  useTrackPlayerEvents([Event.PlaybackQueueEnded], () => {
    void TrackPlayer.pause()
      .then(() => seekTo(0))
      .catch(() => {});
    setSleepTimer((current) => (current?.kind === 'endOfStory' ? null : current));
  });

  // 1s ticker for the sleep-timer pill countdown.
  useEffect(() => {
    if (sleepTimer?.kind !== 'minutes') return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [sleepTimer]);

  // Fade volume to zero over ~3s, pause, restore volume.
  const runSleepFade = useCallback(async () => {
    const token = ++fadeTokenRef.current;
    try {
      for (let step = FADE_STEPS - 1; step >= 1; step -= 1) {
        await TrackPlayer.setVolume(step / FADE_STEPS);
        await delay(FADE_STEP_MS);
        if (fadeTokenRef.current !== token) return;
      }
      await TrackPlayer.pause();
      await TrackPlayer.setVolume(1);
    } catch {
      // Best-effort fade — the player may have been reset mid-fade.
    }
  }, []);

  const selectSleepOption = (option: number | 'end' | 'off') => {
    if (sleepTimeoutRef.current != null) {
      clearTimeout(sleepTimeoutRef.current);
      sleepTimeoutRef.current = null;
    }
    fadeTokenRef.current += 1;
    void TrackPlayer.setVolume(1).catch(() => {});
    if (option === 'off') {
      setSleepTimer(null);
    } else if (option === 'end') {
      setSleepTimer({ kind: 'endOfStory' });
    } else {
      setNow(Date.now());
      setSleepTimer({ kind: 'minutes', minutes: option, endsAt: Date.now() + option * 60_000 });
      sleepTimeoutRef.current = setTimeout(() => {
        sleepTimeoutRef.current = null;
        setSleepTimer(null);
        void runSleepFade();
      }, option * 60_000);
    }
    setTimerSheetOpen(false);
  };

  // Unmount: clear timers/fades, restore volume. NO TrackPlayer.reset() —
  // background playback continuing is the whole point.
  useEffect(
    () => () => {
      if (sleepTimeoutRef.current != null) clearTimeout(sleepTimeoutRef.current);
      fadeTokenRef.current += 1;
      void TrackPlayer.setVolume(1).catch(() => {});
    },
    [],
  );

  // Text panel highlight: timing window containing the position → pageNumber.
  const activePage = useMemo(() => {
    const timings = narration?.timings;
    if (timings == null || timings.length === 0) return null;
    return activePageNumber(timings, position);
  }, [narration, position]);

  useEffect(() => {
    // "Sonraki sayfaya otomatik geç" pref gates the follow-along scroll.
    if (!showText || !autoFollowPage || activePage == null) return;
    const y = paragraphYRef.current[activePage];
    if (y != null) {
      textScrollRef.current?.scrollTo({ y: Math.max(0, y - 32), animated: true });
    }
  }, [showText, autoFollowPage, activePage]);

  const selectRate = (value: number) => {
    setRateState(value);
    rateRef.current = value;
    void setPlayerRate(value).catch(() => {});
  };

  const share = () => {
    if (story == null) return;
    setMenuOpen(false);
    void Share.share({
      title: story.title,
      message: `${story.title}\n\n${story.summary ?? ''}`.trim(),
    }).catch(() => {
      // Share sheet dismissed/unavailable — nothing to surface.
    });
  };

  // ---- Render states -------------------------------------------------------

  if (storyQuery.isPending || narrationsQuery.isPending) {
    return (
      <NightScreen>
        <View style={styles.centerFill}>
          <ActivityIndicator color={night.purple} accessibilityLabel={t('common.loading')} />
        </View>
      </NightScreen>
    );
  }

  if (storyQuery.isError || narrationsQuery.isError || story == null || loadFailed) {
    const error = storyQuery.error ?? narrationsQuery.error;
    const message = loadFailed
      ? t('errors.GENERIC')
      : error instanceof ApiError
        ? t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') })
        : t('errors.OFFLINE');
    return (
      <NightScreen>
        <View style={styles.centerFill}>
          <Text style={styles.stateEmoji}>🌧️</Text>
          <Text style={styles.stateTitle}>{message}</Text>
          <View style={styles.stateButtons}>
            <Button
              label={t('common.retry')}
              onPress={() => {
                if (loadFailed && story != null && narration != null) {
                  loadedNarrationIdRef.current = narration.id;
                  void startLoad(story, narration);
                  return;
                }
                void storyQuery.refetch();
                void narrationsQuery.refetch();
              }}
            />
            <Button label={t('common.back')} variant="ghostDark" onPress={() => router.back()} />
          </View>
        </View>
      </NightScreen>
    );
  }

  if (narration == null) {
    // Entry points gate on a READY narration, so this should be unreachable.
    return (
      <NightScreen>
        <View style={styles.centerFill}>
          <Text style={styles.stateEmoji}>🎙</Text>
          <Text style={styles.stateTitle}>{t('errors.VOICE_NOT_READY')}</Text>
          <View style={styles.stateButtons}>
            <Button label={t('common.back')} variant="ghostDark" onPress={() => router.back()} />
          </View>
        </View>
      </NightScreen>
    );
  }

  const duration = liveDuration > 0 ? liveDuration : (narration.duration ?? 0);
  const progressFraction = duration > 0 ? Math.min(position / duration, 1) : 0;
  const sleepActive = sleepTimer != null;
  const sleepLabel =
    sleepTimer == null
      ? t('player.sleepTimer')
      : sleepTimer.kind === 'endOfStory'
        ? t('player.sleepTimerEndOfStory')
        : formatTime((sleepTimer.endsAt - now) / 1000);

  return (
    <NightScreen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 20) + 8,
            paddingBottom: Math.max(insets.bottom, 16) + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: back — eyebrow — kebab */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressedDim]}
          >
            <ArrowLeftIcon color={night.text} />
          </Pressable>
          <Text style={styles.eyebrow}>{t('player.nowPlaying').toLocaleUpperCase('tr')}</Text>
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressedDim]}
          >
            <KebabIcon color={night.text} size={18} />
          </Pressable>
        </View>

        {/* Floating cover */}
        <View style={styles.coverSection}>
          <Animated.View style={[styles.coverWrap, floatStyle]}>
            <View style={styles.cover}>
              {story.coverImageUrl != null ? (
                <Image
                  source={{ uri: story.coverImageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <>
                  <LinearGradient
                    colors={gradients.playerCover as unknown as [string, string, ...string[]]}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.coverEmoji}>⭐</Text>
                </>
              )}
            </View>
          </Animated.View>
        </View>

        {/* Title + narrator */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{story.title}</Text>
          <View style={styles.narratorRow}>
            <Text style={styles.narratorEmoji}>🎙</Text>
            <Text style={styles.narratorText}>{narratorLabel(narration)}</Text>
          </View>
        </View>

        {/* Waveform progress */}
        <View style={styles.waveformWrap}>
          <Waveform
            bars={28}
            progress={progressFraction}
            activeColor="rgba(176,156,224,0.8)"
            inactiveColor="rgba(255,255,255,0.15)"
            height={28}
          />
        </View>

        {/* Seek slider + times */}
        <View style={styles.sliderSection}>
          <SeekSlider
            position={position}
            duration={duration}
            onSeek={(seconds) => {
              void seekTo(seconds);
            }}
          />
        </View>

        {/* Transport */}
        <View style={styles.transport}>
          <Pressable
            onPress={() => {
              void jumpBack();
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [pressed && styles.pressedDim]}
          >
            <Skip15Icon direction="back" color={night.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              void togglePlay();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.playButtonShadow, pressed && styles.pressedDim]}
          >
            <LinearGradient
              colors={gradients.primaryCta as unknown as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playButton}
            >
              {isPlaying ? (
                <PauseIcon size={26} />
              ) : (
                <View style={styles.playIconNudge}>
                  <PlayIcon size={26} />
                </View>
              )}
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={() => {
              void jumpForward();
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [pressed && styles.pressedDim]}
          >
            <Skip15Icon direction="forward" color={night.text} />
          </Pressable>
        </View>

        {/* Speed chips + sleep timer pill */}
        <View style={styles.chipsRow}>
          {RATES.map((value) => {
            const active = rate === value;
            return (
              <Pressable
                key={value}
                onPress={() => selectRate(value)}
                accessibilityRole="button"
                accessibilityLabel={`${t('player.speed')} ${value}x`}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{value}x</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setTimerSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('player.sleepTimer')}
            style={[styles.chip, styles.timerPill, sleepActive && styles.chipActive]}
          >
            <ClockIcon size={14} color={sleepActive ? night.purple : night.muted} />
            <Text style={[styles.chipText, sleepActive && styles.chipTextActive]}>
              {sleepLabel}
            </Text>
          </Pressable>
        </View>

        {/* Show text → full reader (design wiring: onShowText → StoryReader).
            The inline sing-along panel below stays reachable via the kebab menu. */}
        <View style={styles.showTextRow}>
          <Pressable
            onPress={() => router.push(`/story/${story.id}/reader` as never)}
            accessibilityRole="button"
            accessibilityLabel={t('player.showText')}
            style={({ pressed }) => [styles.showTextButton, pressed && styles.pressedDim]}
          >
            <FileTextIcon size={16} color={night.muted} />
            <Text style={styles.showTextLabel}>{t('player.showText')}</Text>
          </Pressable>
        </View>

        {/* Story text panel — highlights the paragraph in the timing window. */}
        {showText ? (
          <View style={styles.textPanel}>
            <ScrollView
              ref={textScrollRef}
              style={styles.textPanelScroll}
              contentContainerStyle={styles.textPanelContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {pages.map((page) => {
                const highlighted = activePage === page.pageNumber;
                return (
                  <View
                    key={page.id}
                    onLayout={(event) => {
                      paragraphYRef.current[page.pageNumber] = event.nativeEvent.layout.y;
                    }}
                    style={[styles.paragraph, highlighted && styles.paragraphActive]}
                  >
                    <KaraokeText
                      text={page.text}
                      activeIndex={
                        highlighted
                          ? activeWordIndexOnPage(narration?.wordTimings, position, page.pageNumber)
                          : null
                      }
                      style={[styles.paragraphText, highlighted && styles.paragraphTextActive]}
                      activeStyle={styles.wordActive}
                      readStyle={styles.wordRead}
                      onWordPress={(index) => {
                        const seconds = wordStartSeconds(narration?.wordTimings, page.pageNumber, index);
                        if (seconds != null) void seekTo(seconds).catch(() => {});
                      }}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {/* Kebab menu */}
      <NightSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <SheetRow
          icon={<FileTextIcon size={18} color={night.text} />}
          label={showText ? t('player.hideText') : t('player.showText')}
          onPress={() => {
            setShowText((value) => !value);
            setMenuOpen(false);
          }}
        />
        <SheetRow
          icon={<ClockIcon size={18} color={night.text} />}
          label={t('player.sleepTimer')}
          onPress={() => {
            setMenuOpen(false);
            setTimerSheetOpen(true);
          }}
        />
        <SheetRow
          icon={<ShareIcon size={18} color={night.text} />}
          label={t('storyResult.share')}
          onPress={share}
        />
      </NightSheet>

      {/* Sleep timer options */}
      <NightSheet
        visible={timerSheetOpen}
        onClose={() => setTimerSheetOpen(false)}
        title={t('player.sleepTimer')}
      >
        {SLEEP_MINUTE_OPTIONS.map((minutes) => (
          <SheetRow
            key={minutes}
            label={t('player.sleepTimerMinutes', { count: minutes })}
            active={sleepTimer?.kind === 'minutes' && sleepTimer.minutes === minutes}
            onPress={() => selectSleepOption(minutes)}
          />
        ))}
        <SheetRow
          label={t('player.sleepTimerEndOfStory')}
          active={sleepTimer?.kind === 'endOfStory'}
          onPress={() => selectSleepOption('end')}
        />
        <SheetRow
          label={t('player.sleepTimerOff')}
          active={sleepTimer == null}
          onPress={() => selectSleepOption('off')}
        />
      </NightSheet>
    </NightScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bg },
  glow: { position: 'absolute' },
  glowTop: { top: -100, left: '50%', marginLeft: -200 },
  glowBottom: { bottom: 100, right: -80 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.pageXWide,
  },
  stateEmoji: { fontSize: 44, marginBottom: spacing.md },
  stateTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: night.text,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: spacing.xl,
  },
  stateButtons: { alignSelf: 'stretch', gap: spacing.xs },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.pageX,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.xs,
    color: night.muted,
    letterSpacing: letterSpacing.eyebrow,
  },
  coverSection: { alignItems: 'center', paddingTop: spacing.xxxl, paddingBottom: 36 },
  coverWrap: { borderRadius: radius.cover, ...shadows.playerCover },
  cover: {
    width: 220,
    height: 220,
    borderRadius: radius.cover,
    borderWidth: 1,
    borderColor: 'rgba(176,156,224,0.15)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.card,
  },
  coverEmoji: { fontSize: 88 },
  titleBlock: { paddingHorizontal: spacing.pageXWide, alignItems: 'center' },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    lineHeight: 29,
    letterSpacing: -0.3,
    color: night.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  narratorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  narratorEmoji: { fontSize: fontSizes.base },
  narratorText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: night.purple,
  },
  waveformWrap: { paddingTop: spacing.xl },
  sliderSection: { paddingHorizontal: spacing.pageXWide, paddingTop: spacing.lg },
  sliderHit: { height: 28, justifyContent: 'center' },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  sliderFill: { height: 4, borderRadius: 2, backgroundColor: night.purple },
  sliderThumb: {
    position: 'absolute',
    top: 7,
    width: SLIDER_THUMB,
    height: SLIDER_THUMB,
    borderRadius: SLIDER_THUMB / 2,
    backgroundColor: colors.card,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  timesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: night.muted,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxl,
    paddingTop: 28,
  },
  playButtonShadow: {
    borderRadius: 36,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 8,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconNudge: { marginLeft: 3 },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.pageXWide,
    paddingTop: spacing.xl,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'rgba(176,156,224,0.2)',
    borderColor: 'rgba(176,156,224,0.5)',
  },
  chipText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: night.muted,
  },
  chipTextActive: { color: night.purple },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  showTextRow: { alignItems: 'center', paddingTop: spacing.lg },
  showTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.chip,
  },
  showTextLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: night.muted,
  },
  textPanel: {
    marginTop: spacing.md,
    marginHorizontal: spacing.pageX,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: night.card,
    overflow: 'hidden',
  },
  textPanelScroll: { maxHeight: 260 },
  textPanelContent: { padding: spacing.md, gap: spacing.xs },
  paragraph: { borderRadius: radius.sm, padding: 10 },
  paragraphActive: { backgroundColor: 'rgba(155,127,212,0.18)' },
  paragraphText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    lineHeight: 24,
    color: night.text,
    opacity: 0.75,
  },
  paragraphTextActive: { color: colors.card, opacity: 1 },
  wordActive: { color: night.highlight, fontFamily: fontFamilies.bodyBold },
  wordRead: { color: night.text },
  pressedDim: { opacity: 0.7 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,8,16,0.55)' },
  sheet: {
    backgroundColor: night.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.pageX,
    paddingTop: 12,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: night.text,
    marginBottom: spacing.sm,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  sheetRowActive: { backgroundColor: 'rgba(155,127,212,0.15)' },
  sheetRowIcon: { width: 22, alignItems: 'center' },
  sheetRowLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: night.text,
  },
  sheetRowLabelActive: { color: night.purple },
});
