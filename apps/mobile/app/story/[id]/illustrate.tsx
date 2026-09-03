import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  AIJobStatus,
  ErrorCode,
  ILLUSTRATION_REGENERATE_CREDIT_COST,
  IllustrationSetStatus,
  IllustrationStyle,
  StoryStatus,
} from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
import type { Illustration, IllustrationSet } from '@masalim/validation';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  radius,
  shadows,
  spacing,
} from '@masalim/ui';
import { AppIcon } from '../../../src/components/AppIcon';
import { api } from '../../../src/lib/api';
import { openBookBuilderForStory } from '../../../src/lib/book-nav';
import { useJobProgress } from '../../../src/lib/job-stream';
import { useJobsStore } from '../../../src/stores/jobs';
import { Button } from '../../../src/components/Button';
import { Chip } from '../../../src/components/Chip';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { SelectableCard } from '../../../src/components/SelectableCard';
import { storyThemeEmoji } from '../../../src/components/StorySheet';
import { CheckIcon } from '../../../src/components/icons';
import { KeepScreenAwake } from '../../../src/components/KeepScreenAwake';
import { ErrorState } from '../../../src/components/states';
import classicSample from '../../../assets/style-samples/CLASSIC_STORYBOOK.webp';
import handDrawnSample from '../../../assets/style-samples/HAND_DRAWN.webp';
import pastelSample from '../../../assets/style-samples/PASTEL.webp';
import soft3dSample from '../../../assets/style-samples/SOFT_3D.webp';
import watercolorSample from '../../../assets/style-samples/WATERCOLOR.webp';

/** Picker order mirrors the design's card order. */
const STYLE_ORDER: IllustrationStyle[] = [
  IllustrationStyle.WATERCOLOR,
  IllustrationStyle.SOFT_3D,
  IllustrationStyle.CLASSIC_STORYBOOK,
  IllustrationStyle.PASTEL,
  IllustrationStyle.HAND_DRAWN,
];

/**
 * Real sample per style — the SAME hero and scene rendered in each medium
 * (generated once by the "Style Samples" workflow), so the picker shows the
 * difference instead of describing it.
 */
const STYLE_SAMPLES: Record<IllustrationStyle, ImageSourcePropType> = {
  WATERCOLOR: watercolorSample,
  SOFT_3D: soft3dSample,
  CLASSIC_STORYBOOK: classicSample,
  PASTEL: pastelSample,
  HAND_DRAWN: handDrawnSample,
};

const STYLE_EMOJIS: Record<IllustrationStyle, string> = {
  WATERCOLOR: '🎨',
  SOFT_3D: '🧸',
  CLASSIC_STORYBOOK: '📖',
  PASTEL: '🌸',
  HAND_DRAWN: '✏️',
};

const byCreatedAt = (a: Illustration, b: Illustration) => a.createdAt.localeCompare(b.createdAt);

/**
 * One READY-view unit: the cover or a story page that has illustrations.
 * `key` doubles as the regenerate rowKey ('cover' | story page id).
 */
interface ReadyUnit {
  key: string;
  /** "Kapak" / "Sayfa N" — strip caption + alternatives lead. */
  label: string;
  /** Line under the main preview: page excerpt (pages) / story title (cover). */
  caption: string | null;
  alternatives: Illustration[];
  /** Selected alternative (falls back to the oldest one). */
  selected: Illustration;
}

/** Last failed ready-view action, so the inline ErrorState can retry it. */
type ReadyRetry =
  | { kind: 'select'; illustration: Illustration }
  | { kind: 'regenerate'; rowKey: string; illustration: Illustration };

interface AltTileProps {
  illustration: Illustration;
  /** "Seçenek N" caption in the tile's white label bar. */
  label: string;
  /** Locally highlighted (pending pick, or the current selection). */
  highlighted: boolean;
  busy: boolean;
  onPress: () => void;
}

/**
 * One alternative in the 2-column grid (design Illustration/04): r20 tile with
 * a 3px primary border when highlighted, thumbnail on top, white caption bar.
 * The server-selected one keeps a check badge; spinner overlay while the
 * selection PATCH is in flight.
 */
function AltTile({ illustration, label, highlighted, busy, onPress }: AltTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="radio"
      accessibilityState={{ selected: highlighted }}
      accessibilityLabel={label}
      style={[styles.altTile, highlighted ? styles.altTileSelected : styles.altTileUnselected]}
    >
      <View style={styles.altImageBox}>
        <Image
          source={{ uri: illustration.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
        {illustration.selected ? (
          <View style={styles.altCheck}>
            <CheckIcon />
          </View>
        ) : null}
        {busy ? (
          <View style={styles.altBusyOverlay}>
            <ActivityIndicator color={colors.primaryForeground} />
          </View>
        ) : null}
      </View>
      <View style={styles.altLabelBar}>
        <Text style={[styles.altLabel, highlighted ? styles.altLabelActive : null]}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** Rotating ring for the regenerating overlay (design Illustration/05). */
function RingSpinner() {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1, false);
  }, [spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return <Animated.View style={[styles.ring, spinStyle]} />;
}

interface GeneratingNightProps {
  title: string;
  stepLabel: string;
  /** Cover + page labels, in generation order. */
  labels: string[];
  /** Index of the item currently being generated. */
  currentIndex: number;
  /** Job finished — every row shows as done. */
  done: boolean;
  /** REAL backend percent (SSE / set milestones). */
  percent: number;
}

/**
 * Night-mode generation panel per the design: spinning palette medallion,
 * per-page checklist (done ✓ / pulsing current / dimmed pending) and a
 * purple→gold progress bar driven only by the real job percent.
 */
function GeneratingNight({
  title,
  stepLabel,
  labels,
  currentIndex,
  done,
  percent,
}: GeneratingNightProps) {
  // Design: spin-slow 4s linear on the palette, pulse-soft 1s on the current dot.
  const spin = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 4000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(
      withTiming(0.35, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [spin, pulse]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // Bar width animates to the real backend value only.
  const progressValue = useSharedValue(0);
  useEffect(() => {
    progressValue.value = withTiming(percent, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [percent, progressValue]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progressValue.value}%` }));

  return (
    <View style={styles.nightPanel}>
      <Animated.View style={[styles.palette, spinStyle]}>
        <Text style={styles.paletteEmoji}>🎨</Text>
      </Animated.View>

      <View style={styles.nightTextBlock}>
        <Text style={styles.nightTitle}>{title}</Text>
        <Text style={styles.nightStep}>{stepLabel}</Text>
      </View>

      <View style={styles.checklist}>
        {labels.map((label, index) => {
          const isDone = done || index < currentIndex;
          const isCurrent = !done && index === currentIndex;
          return (
            <View
              key={label}
              style={[styles.checkRow, !isDone && !isCurrent ? styles.checkRowPending : null]}
            >
              <View
                style={[
                  styles.checkCircle,
                  isDone
                    ? styles.checkCircleDone
                    : isCurrent
                      ? styles.checkCircleCurrent
                      : styles.checkCirclePending,
                ]}
              >
                {isDone ? (
                  <CheckIcon />
                ) : isCurrent ? (
                  <Animated.View style={[styles.currentDot, pulseStyle]} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.checkLabel,
                  isDone
                    ? styles.checkLabelDone
                    : isCurrent
                      ? styles.checkLabelCurrent
                      : styles.checkLabelPending,
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.nightTrack}>
        <Animated.View style={[styles.nightFill, fillStyle]}>
          <LinearGradient
            colors={gradients.generatingProgress as unknown as [string, string]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Story illustration flow: pick a style → watch real per-image generation
 * progress → review the READY set (cover + per-page alternatives, selection,
 * per-row regenerate). Multiple sets (one per style) switch via chips.
 */
export default function IllustrateStory() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const enabled = id != null && id.length > 0;

  const [selectedStyle, setSelectedStyle] = useState<IllustrationStyle | null>(null);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [pickingNewStyle, setPickingNewStyle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quotaHit, setQuotaHit] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [regen, setRegen] = useState<{
    jobId: string;
    rowKey: string;
    target: Illustration;
  } | null>(null);
  /** Focused unit in the READY view ('cover' | story page id). */
  const [focusedKey, setFocusedKey] = useState('cover');
  const [altsOpen, setAltsOpen] = useState(false);
  /** Pending pick in the alternatives view (null = keep server selection highlighted). */
  const [altPick, setAltPick] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<ReadyRetry | null>(null);
  /** Regenerate is a credit spend — the sheet confirms it before anything is queued. */
  const [regenConfirm, setRegenConfirm] = useState<{
    rowKey: string;
    illustration: Illustration;
  } | null>(null);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const storyQuery = useQuery({
    queryKey: ['story', id],
    queryFn: () => api.stories.detail(id),
    enabled,
  });
  const story = storyQuery.data;

  const setsQuery = useQuery({
    queryKey: ['illustrations', id],
    queryFn: () => api.illustrations.list(id),
    enabled,
    // Refresh thumbnails/step captions while a set is generating (SSE covers
    // the percent; the illustrations array itself only grows via refetch).
    refetchInterval: (query) => {
      const data = query.state.data;
      const inFlight = data?.some(
        (set) =>
          set.status === IllustrationSetStatus.QUEUED ||
          set.status === IllustrationSetStatus.GENERATING,
      );
      return inFlight === true ? 3000 : false;
    },
  });

  /** Newest set first; the switcher defaults to the latest one. */
  const sets = useMemo(
    () => [...(setsQuery.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [setsQuery.data],
  );
  const activeSet = sets.find((set) => set.id === activeSetId) ?? sets[0] ?? null;
  const showPicker = pickingNewStyle || activeSet == null;
  const isGenerating =
    !showPicker &&
    activeSet != null &&
    regen == null &&
    (activeSet.status === IllustrationSetStatus.QUEUED ||
      activeSet.status === IllustrationSetStatus.GENERATING);

  // Real progress for the displayed set's generation job.
  const genJob = useJobProgress(isGenerating ? (activeSet.jobId ?? undefined) : undefined);
  // Real progress for a per-row regenerate job (one at a time).
  const regenJob = useJobProgress(regen?.jobId);

  // Set generation finished (or failed) → refresh set/story/list thumbnails.
  useEffect(() => {
    if (
      genJob.status === AIJobStatus.SUCCEEDED ||
      genJob.status === AIJobStatus.FAILED ||
      genJob.status === AIJobStatus.CANCELLED
    ) {
      void queryClient.invalidateQueries({ queryKey: ['illustrations', id] });
      void queryClient.invalidateQueries({ queryKey: ['story', id] });
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
    }
  }, [genJob.status, id, queryClient]);

  // Regenerate finished → the new alternative appears via invalidation.
  useEffect(() => {
    if (regen == null) return;
    if (regenJob.status === AIJobStatus.SUCCEEDED) {
      setRegen(null);
      void queryClient.invalidateQueries({ queryKey: ['illustrations', id] });
      void queryClient.invalidateQueries({ queryKey: ['story', id] });
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
    } else if (
      regenJob.status === AIJobStatus.FAILED ||
      regenJob.status === AIJobStatus.CANCELLED
    ) {
      setRowError(
        regenJob.errorCode != null
          ? t(`errors.${regenJob.errorCode}`, { defaultValue: t('errors.GENERIC') })
          : t('errors.GENERIC'),
      );
      setLastFailed({ kind: 'regenerate', rowKey: regen.rowKey, illustration: regen.target });
      setRegen(null);
      void queryClient.invalidateQueries({ queryKey: ['illustrations', id] });
    }
  }, [regen, regenJob.status, regenJob.errorCode, id, queryClient, t]);

  // Switching the displayed set closes the alternatives view (units changed).
  const activeSetKey = activeSet?.id ?? null;
  useEffect(() => {
    setAltsOpen(false);
    setAltPick(null);
  }, [activeSetKey]);

  const applyRequestError = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.code === ErrorCode.QUOTA_EXCEEDED || err.code === ErrorCode.INSUFFICIENT_CREDITS) {
        setQuotaHit(true);
        return;
      }
      setCreateError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
    } else if (err instanceof NetworkError) {
      setCreateError(t('errors.OFFLINE'));
    } else {
      setCreateError(t('errors.GENERIC'));
    }
  };

  const create = async (style: IllustrationStyle) => {
    if (submitting) return;
    setQuotaHit(false);
    setCreateError(null);
    setRowError(null);
    setSubmitting(true);
    try {
      const { set } = await api.illustrations.create(id, { style });
      // Seed the cache so the new set renders before the refetch lands.
      queryClient.setQueryData<IllustrationSet[]>(['illustrations', id], (old) => [
        set,
        ...(old ?? []).filter((existing) => existing.id !== set.id),
      ]);
      void queryClient.invalidateQueries({ queryKey: ['illustrations', id] });
      setActiveSetId(set.id);
      setPickingNewStyle(false);
      setSelectedStyle(null);
    } catch (err) {
      applyRequestError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const onSelectAlternative = async (illustration: Illustration) => {
    if (selectingId != null || illustration.selected) return;
    setRowError(null);
    setSelectingId(illustration.id);
    try {
      await api.illustrations.select(illustration.id);
      // Cover/page selection changes list thumbnails elsewhere too.
      await queryClient.invalidateQueries({ queryKey: ['illustrations', id] });
      void queryClient.invalidateQueries({ queryKey: ['story', id] });
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
    } catch (err) {
      setLastFailed({ kind: 'select', illustration });
      if (err instanceof ApiError) {
        setRowError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof NetworkError) {
        setRowError(t('errors.OFFLINE'));
      } else {
        setRowError(t('errors.GENERIC'));
      }
    } finally {
      setSelectingId(null);
    }
  };

  const onRegenerate = async (rowKey: string, illustration: Illustration) => {
    if (regen != null) return;
    setQuotaHit(false);
    setRowError(null);
    try {
      const { jobId } = await api.illustrations.regenerate(illustration.id);
      setRegen({ jobId, rowKey, target: illustration });
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === ErrorCode.QUOTA_EXCEEDED || err.code === ErrorCode.INSUFFICIENT_CREDITS)
      ) {
        // Regenerate costs a credit — the wallet is where this gets fixed.
        setQuotaHit(true);
        router.push('/subscription/quota' as never);
        return;
      }
      setLastFailed({ kind: 'regenerate', rowKey, illustration });
      if (err instanceof ApiError) {
        setRowError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof NetworkError) {
        setRowError(t('errors.OFFLINE'));
      } else {
        setRowError(t('errors.GENERIC'));
      }
    }
  };

  /** Inline ErrorState retry — re-runs whichever ready-view action failed. */
  const retryFailed = () => {
    if (lastFailed == null) {
      setRowError(null);
      return;
    }
    if (lastFailed.kind === 'select') {
      void onSelectAlternative(lastFailed.illustration);
    } else {
      // A failed attempt was refunded; retrying spends again → confirm again.
      setRowError(null);
      setRegenConfirm({ rowKey: lastFailed.rowKey, illustration: lastFailed.illustration });
    }
  };

  const closeAlts = () => {
    setAltsOpen(false);
    setAltPick(null);
  };

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (storyQuery.isPending || setsQuery.isPending) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (storyQuery.isError || story == null) {
    const error = storyQuery.error;
    const message =
      error instanceof ApiError
        ? t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') })
        : t('errors.OFFLINE');
    return (
      <View style={[styles.stateFill, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <ScreenHeader />
        <ErrorState
          emoji="🌧️"
          title={message}
          ctaLabel={t('common.retry')}
          onCta={() => {
            void storyQuery.refetch();
          }}
        />
      </View>
    );
  }

  if (story.status !== StoryStatus.READY) {
    return (
      <View style={[styles.stateFill, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <ScreenHeader />
        <ErrorState
          emoji="🪄"
          title={t('errors.STORY_NOT_READY')}
          ctaLabel={t('common.back')}
          onCta={() => router.back()}
        />
      </View>
    );
  }

  if (setsQuery.isError) {
    return (
      <View style={[styles.stateFill, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <ScreenHeader eyebrow={t('illustrate.eyebrow')} title={t('illustrate.title')} />
        <ErrorState
          emoji="🌧️"
          title={t('errors.GENERIC')}
          ctaLabel={t('common.retry')}
          onCta={() => {
            void setsQuery.refetch();
          }}
        />
      </View>
    );
  }

  // ── Derived view data ──────────────────────────────────────────────────────

  const sortedPages = [...story.pages].sort((a, b) => a.pageNumber - b.pageNumber);

  // READY-view units: cover + each page that has illustrations, from real data.
  const readySet =
    activeSet != null && activeSet.status === IllustrationSetStatus.READY ? activeSet : null;
  const readyUnits: ReadyUnit[] = [];
  if (readySet != null) {
    const pushUnit = (
      key: string,
      label: string,
      caption: string | null,
      alternatives: Illustration[],
    ) => {
      const selected = alternatives.find((item) => item.selected) ?? alternatives[0];
      if (selected == null) return;
      readyUnits.push({ key, label, caption, alternatives, selected });
    };
    pushUnit(
      'cover',
      t('illustrate.progressCover'),
      story.title,
      readySet.illustrations.filter((item) => item.isCover).sort(byCreatedAt),
    );
    for (const page of sortedPages) {
      pushUnit(
        page.id,
        t('illustrate.progressPage', { number: page.pageNumber }),
        page.text,
        readySet.illustrations
          .filter((item) => !item.isCover && item.storyPageId === page.id)
          .sort(byCreatedAt),
      );
    }
  }
  const focusedUnit = readyUnits.find((unit) => unit.key === focusedKey) ?? readyUnits[0] ?? null;
  const showAlts = altsOpen && focusedUnit != null;
  const themeEmoji = storyThemeEmoji(story.themes);

  /** Bottom CTA: reuse-or-create the story's book, then open the builder. */
  const openBook = async () => {
    if (bookLoading) return;
    setBookError(null);
    setBookLoading(true);
    try {
      await openBookBuilderForStory(queryClient, story.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setBookError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof NetworkError) {
        setBookError(t('errors.OFFLINE'));
      } else {
        setBookError(t('errors.GENERIC'));
      }
    } finally {
      setBookLoading(false);
    }
  };

  /** "Bu Görseli Seç": commit the highlighted alternative, then return to ready. */
  const confirmAlternative = async () => {
    if (focusedUnit == null || selectingId != null) return;
    const highlightedId = altPick ?? focusedUnit.selected.id;
    const target = focusedUnit.alternatives.find((item) => item.id === highlightedId);
    if (target != null && !target.selected) {
      // On failure rowError is set and the ready view shows the inline ErrorState.
      await onSelectAlternative(target);
    }
    closeAlts();
  };

  const quotaBanner = quotaHit ? (
    <Animated.View entering={FadeInUp.duration(250)}>
      <Pressable
        onPress={() => router.push('/subscription/quota' as never)}
        accessibilityRole="button"
        accessibilityLabel={t('quotaBanner.getCredits')}
        style={({ pressed }) => [styles.quotaBanner, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={styles.quotaText}>{t('subscription.quotaReachedIllustrations')}</Text>
        <Text style={styles.quotaLink}>{t('quotaBanner.getCredits')} →</Text>
      </Pressable>
    </Animated.View>
  ) : null;

  const styleSwitcher =
    sets.length > 0 ? (
      <View style={styles.switcherRow}>
        {sets.map((set) => (
          <Chip
            key={set.id}
            label={t(`illustrate.styles.${set.style}`)}
            selected={!pickingNewStyle && set.id === activeSet?.id}
            onPress={() => {
              setPickingNewStyle(false);
              setActiveSetId(set.id);
            }}
          />
        ))}
        <Chip
          label="+"
          selected={pickingNewStyle}
          onPress={() => {
            setPickingNewStyle(true);
          }}
        />
      </View>
    ) : null;

  // ── Generating: full-bleed night takeover (design: IllustrationStyle) ─────

  if (isGenerating && activeSet != null) {
    const total = Math.max(activeSet.progress.total, 1);
    const completed = Math.min(Math.max(activeSet.progress.completed, 0), total);
    // Bar is the job's real percent; before the first event, fall back to the
    // set's completed/total ratio (also real backend milestones).
    const percent =
      genJob.status != null
        ? Math.round(Math.min(Math.max(genJob.progress, 0), 100))
        : Math.round((completed / total) * 100);
    const done = genJob.status === AIJobStatus.SUCCEEDED;
    const currentIndex = Math.min(completed, total - 1);
    const labels = Array.from({ length: total }, (_, index) =>
      index === 0 ? t('illustrate.progressCover') : t('illustrate.progressPage', { number: index }),
    );
    const stepLabel = done
      ? t('illustrate.done')
      : t('illustrate.generatingStep', { label: labels[currentIndex] ?? '' });

    return (
      <View style={styles.nightRoot}>
        <KeepScreenAwake />
        <LinearGradient
          colors={gradients.nightSky as unknown as [string, string, ...string[]]}
          locations={[0, 0.5, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
          <ScreenHeader eyebrow={t('illustrate.eyebrow')} dark />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.nightScrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + spacing.xxl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {styleSwitcher}
          {quotaBanner}
          <Animated.View entering={FadeInUp.duration(300)} style={styles.nightCenter}>
            <GeneratingNight
              title={t('illustrate.generatingTitle')}
              stepLabel={stepLabel}
              labels={labels}
              currentIndex={currentIndex}
              done={done}
              percent={percent}
            />
            {!done && activeSet.jobId != null ? (
              <Pressable
                onPress={() => {
                  useJobsStore.getState().track({
                    jobId: activeSet.jobId as string,
                    kind: 'illustration',
                    storyId: id,
                    title: story.title,
                    route: `/story/${id}/illustrate`,
                  });
                  router.back();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('jobs.background')}
                hitSlop={8}
                style={({ pressed }) => [styles.backgroundLink, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.backgroundLinkText}>{t('jobs.background')}</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  // ── Picker / ready / failed (cream) ────────────────────────────────────────

  const renderPicker = () => (
    <View style={styles.styleList}>
      {STYLE_ORDER.map((style) => {
        const selected = selectedStyle === style;
        return (
          <SelectableCard
            key={style}
            selected={selected}
            glow
            showCheck={false}
            onPress={() => setSelectedStyle(style)}
            style={styles.styleCard}
            accessibilityLabel={t(`illustrate.styles.${style}`)}
          >
            <Image
              source={STYLE_SAMPLES[style]}
              style={styles.sample}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.styleInfo}>
              <Text style={styles.styleEmoji}>{STYLE_EMOJIS[style]}</Text>
              <View style={styles.styleTextBlock}>
                <Text style={styles.styleName}>{t(`illustrate.styles.${style}`)}</Text>
                <Text style={styles.styleDesc}>{t(`illustrate.styleDescriptions.${style}`)}</Text>
              </View>
              {selected ? (
                <View style={styles.styleCheck}>
                  <CheckIcon />
                </View>
              ) : null}
            </View>
          </SelectableCard>
        );
      })}
    </View>
  );

  const renderFailed = (set: IllustrationSet) => (
    <View>
      {createError != null ? <Text style={styles.inlineError}>{createError}</Text> : null}
      <ErrorState
        emoji="🌧️"
        title={t('errors.GENERIC')}
        body={t('illustrate.generatingBody')}
        ctaLabel={t('common.retry')}
        onCta={() => {
          void create(set.style);
        }}
      />
    </View>
  );

  /**
   * READY view (design Illustration/03): thumbnail strip of units, large
   * preview of the focused unit's selected illustration, regenerate/
   * alternatives action row. A failed action swaps the whole block for the
   * shared illustration ErrorState with a retry.
   */
  const renderReady = () => {
    if (focusedUnit == null) return null;
    if (rowError != null) {
      return <ErrorState kind="illustration" body={rowError} onRetry={retryFailed} />;
    }
    const regenActive = regen != null && regen.rowKey === focusedUnit.key;
    const regenPercent = Math.round(Math.min(Math.max(regenJob.progress, 0), 100));
    const regenWidth = `${regenPercent}%` as const;

    return (
      <Animated.View entering={FadeInUp.duration(300)}>
        {/* Thumbnail strip — one 64×80 tile per unit */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.strip}
          contentContainerStyle={styles.stripContent}
        >
          {readyUnits.map((unit) => {
            const active = unit.key === focusedUnit.key;
            return (
              <Pressable
                key={unit.key}
                onPress={() => setFocusedKey(unit.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={unit.label}
                style={styles.stripItem}
              >
                <View style={[styles.stripTile, active ? styles.stripTileActive : null]}>
                  {unit.selected.imageUrl.length > 0 ? (
                    <Image
                      source={{ uri: unit.selected.imageUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <LinearGradient
                      colors={gradients.playerCover as unknown as [string, string]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[StyleSheet.absoluteFill, styles.tileFallback]}
                    >
                      <Text style={styles.stripEmoji}>{themeEmoji}</Text>
                    </LinearGradient>
                  )}
                </View>
                <Text style={[styles.stripLabel, active ? styles.stripLabelActive : null]}>
                  {unit.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Main preview — regenerating keeps the old image under a dark overlay */}
        <View style={[styles.preview, shadows.cardMedium]}>
          {focusedUnit.selected.imageUrl.length > 0 ? (
            <Image
              source={{ uri: focusedUnit.selected.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <LinearGradient
              colors={gradients.playerCover as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.tileFallback]}
            >
              <Text style={styles.previewEmoji}>{themeEmoji}</Text>
            </LinearGradient>
          )}
          {regenActive ? (
            <View style={styles.regenOverlay}>
              <RingSpinner />
              <Text style={styles.regenOverlayText}>{t('illustrate.regeneratingLabel')}</Text>
              <Text style={styles.regenReassurance}>
                {t('illustrate.regeneratingReassurance')}
              </Text>
            </View>
          ) : null}
        </View>

        {regenActive ? (
          <View style={styles.regenBarBlock}>
            <View style={styles.regenTrack}>
              <View style={[styles.regenFill, { width: regenWidth }]}>
                <LinearGradient
                  colors={gradients.progress as unknown as [string, string]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            </View>
            <Text style={styles.regenPercentText}>%{regenPercent}</Text>
          </View>
        ) : focusedUnit.caption != null && focusedUnit.caption.length > 0 ? (
          <Text style={styles.previewCaption} numberOfLines={2}>
            {focusedUnit.caption}
          </Text>
        ) : null}

        {/* Action row */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              setRegenConfirm({ rowKey: focusedUnit.key, illustration: focusedUnit.selected });
            }}
            disabled={regen != null}
            accessibilityRole="button"
            accessibilityLabel={t('illustrate.regenerate')}
            style={({ pressed }) => [
              styles.actionButton,
              { opacity: regen != null ? 0.5 : pressed ? 0.7 : 1 },
            ]}
          >
            <View style={styles.actionMain}>
              <AppIcon name="retry" size={18} color={colors.foreground} />
              <Text style={styles.actionLabel} numberOfLines={2}>
                {t('illustrate.regenerateAction')}
              </Text>
            </View>
            {/* Transparent pricing: every regenerate is a metered render. */}
            <View style={styles.costChip}>
              <Text style={styles.costChipText}>
                {t('credits.regenerateCost', { count: ILLUSTRATION_REGENERATE_CREDIT_COST })}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => {
              setAltPick(null);
              setAltsOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('illustrate.chooseAlternative')}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.actionMain}>
              <AppIcon name="image" size={18} color={colors.foreground} />
              <Text style={styles.actionLabel} numberOfLines={2}>
                {t('illustrate.alternatives')}
              </Text>
            </View>
          </Pressable>
        </View>
      </Animated.View>
    );
  };

  /**
   * Alternatives view (design Illustration/04): lead line + 2-column grid of
   * the focused unit's real alternatives; the bottom CTA commits the pick via
   * the existing select mutation.
   */
  const renderAlternatives = () => {
    if (focusedUnit == null) return null;
    const highlightedId = altPick ?? focusedUnit.selected.id;
    return (
      <Animated.View entering={FadeInUp.duration(300)}>
        <Text style={styles.altLead}>
          {t('illustrate.alternativesLead', {
            unit: focusedUnit.label,
            style:
              readySet != null ? t(`illustrate.styles.${readySet.style}`).toLocaleLowerCase('tr') : '',
            count: focusedUnit.alternatives.length,
          })}
        </Text>
        <View style={styles.altGrid}>
          {focusedUnit.alternatives.map((illustration, index) => (
            <AltTile
              key={illustration.id}
              illustration={illustration}
              label={t('illustrate.alternativeOption', {
                letter: String.fromCharCode(65 + index),
              })}
              highlighted={illustration.id === highlightedId}
              busy={selectingId === illustration.id}
              onPress={() => setAltPick(illustration.id)}
            />
          ))}
        </View>
      </Animated.View>
    );
  };

  const readyFooter = !showPicker && readySet != null && focusedUnit != null && rowError == null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <ScreenHeader
          eyebrow={t('illustrate.eyebrow')}
          title={
            showPicker
              ? t('illustrate.pickerTitle')
              : showAlts
                ? t('illustrate.alternativesTitle')
                : readySet != null
                  ? t('illustrate.readyTitle')
                  : t('illustrate.title')
          }
          onBack={showAlts ? closeAlts : undefined}
        />
        {showPicker ? (
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>{t('illustrate.pickerHint')}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: showPicker
              ? 220
              : readyFooter
                ? 180
                : Math.max(insets.bottom, 16) + spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {styleSwitcher}
        {!showPicker ? quotaBanner : null}
        {showPicker
          ? renderPicker()
          : activeSet == null
            ? null
            : activeSet.status === IllustrationSetStatus.FAILED
              ? renderFailed(activeSet)
              : showAlts
                ? renderAlternatives()
                : renderReady()}
      </ScrollView>

      {/* Fixed bottom CTA over a cream scrim (wizard pattern) — picker only. */}
      {showPicker ? (
        <View style={styles.footer} pointerEvents="box-none">
          <LinearGradient
            colors={['rgba(250,248,244,0)', colors.background]}
            locations={[0, 0.3]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View
            style={[styles.footerContent, { paddingBottom: Math.max(insets.bottom, 24) + 8 }]}
            pointerEvents="box-none"
          >
            {quotaBanner}
            {createError != null ? <Text style={styles.submitError}>{createError}</Text> : null}
            <Button
              label={t('illustrate.generate')}
              leading={<AppIcon name="palette" size={18} color={colors.primaryForeground} />}
              onPress={() => {
                if (selectedStyle != null) void create(selectedStyle);
              }}
              disabled={selectedStyle == null}
              loading={submitting}
            />
            <Text style={styles.ctaCaption}>
              {t('illustrate.generateCaption', { count: sortedPages.length + 1 })}
            </Text>
          </View>
        </View>
      ) : readyFooter ? (
        // Ready: "Kitabı Oluştur" (or the alternatives' "Bu Görseli Seç") CTA.
        <View style={styles.footer} pointerEvents="box-none">
          <LinearGradient
            colors={['rgba(250,248,244,0)', colors.background]}
            locations={[0, 0.3]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View
            style={[styles.footerContent, { paddingBottom: Math.max(insets.bottom, 24) + 8 }]}
            pointerEvents="box-none"
          >
            {showAlts ? (
              <Button
                label={t('illustrate.selectImage')}
                onPress={() => {
                  void confirmAlternative();
                }}
                loading={selectingId != null}
              />
            ) : (
              <>
                {bookError != null ? <Text style={styles.submitError}>{bookError}</Text> : null}
                <Button
                  label={t('illustrate.makeBook')}
                  onPress={() => {
                    void openBook();
                  }}
                  loading={bookLoading}
                />
              </>
            )}
          </View>
        </View>
      ) : null}

      <ConfirmSheet
        visible={regenConfirm != null}
        title={t('illustrate.regenerateConfirmTitle')}
        body={t('illustrate.regenerateConfirmBody', { count: ILLUSTRATION_REGENERATE_CREDIT_COST })}
        confirmLabel={t('illustrate.regenerateConfirmCta')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          const target = regenConfirm;
          setRegenConfirm(null);
          if (target != null) void onRegenerate(target.rowKey, target.illustration);
        }}
        onCancel={() => setRegenConfirm(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  stateFill: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.pageX,
  },
  header: { paddingHorizontal: spacing.pageX },
  hintCard: {
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(124,92,191,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,191,0.15)',
    marginBottom: spacing.xl,
  },
  hintText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.foreground,
    lineHeight: 20,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.pageX },
  switcherRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },

  // Style picker (design: full-width stripe cards)
  styleList: { gap: spacing.sm },
  styleCard: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    gap: 0,
    alignItems: 'stretch',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  sample: { width: 112, alignSelf: 'stretch', backgroundColor: colors.muted },
  styleInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
  },
  styleEmoji: { fontSize: 32 },
  styleTextBlock: { flex: 1 },
  styleName: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.xxl,
    color: colors.foreground,
    marginBottom: 2,
  },
  styleDesc: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  styleCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Generating (night takeover)
  nightRoot: { flex: 1, backgroundColor: colors.purpleDarkest },
  nightScrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.pageXWide,
    paddingTop: spacing.xs,
  },
  nightCenter: { flexGrow: 1, justifyContent: 'center' },
  backgroundLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: spacing.lg },
  backgroundLinkText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: 'rgba(255,255,255,0.7)',
  },
  nightPanel: { alignItems: 'center', gap: 28, paddingVertical: spacing.xxxl },
  palette: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(176,156,224,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(176,156,224,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteEmoji: { fontSize: 44 },
  nightTextBlock: { alignItems: 'center' },
  nightTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    color: colors.primaryForeground,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  nightStep: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: 'rgba(176,156,224,0.8)',
    textAlign: 'center',
  },
  checklist: { alignSelf: 'stretch', gap: spacing.xs },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkRowPending: { opacity: 0.35 },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDone: {
    backgroundColor: 'rgba(141,184,154,0.3)',
    borderColor: 'rgba(141,184,154,0.6)',
  },
  checkCircleCurrent: {
    backgroundColor: 'rgba(176,156,224,0.3)',
    borderColor: 'rgba(176,156,224,0.6)',
  },
  checkCirclePending: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  currentDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.lavender },
  checkLabel: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.base },
  checkLabelDone: { color: colors.sage },
  checkLabelCurrent: { color: colors.lavender },
  checkLabelPending: { color: 'rgba(255,255,255,0.4)' },
  nightTrack: {
    alignSelf: 'stretch',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  nightFill: { height: '100%', borderRadius: 2, overflow: 'hidden' },

  // Ready set (design Illustration/03)
  strip: { marginBottom: spacing.md, marginHorizontal: -spacing.pageX },
  stripContent: { gap: 10, paddingHorizontal: spacing.pageX },
  stripItem: { width: 64 },
  stripTile: {
    width: 64,
    height: 80,
    borderRadius: radius.chip,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  stripTileActive: { borderColor: colors.primary },
  stripEmoji: { fontSize: 26 },
  stripLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xxs,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: 5,
  },
  stripLabelActive: { color: colors.primary },
  tileFallback: { alignItems: 'center', justifyContent: 'center' },
  preview: {
    height: 300,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  previewEmoji: { fontSize: 80 },
  previewCaption: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  // Column: [icon + label] over the optional cost chip. A single row overflowed
  // the half-width button once the "1 kredi" chip joined the label (icon spilled
  // past the left edge, chip clipped on the right).
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionMain: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionLabel: {
    flexShrink: 1,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    textAlign: 'center',
  },
  costChip: {
    backgroundColor: colors.secondary,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  costChipText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.secondaryForeground,
  },

  // Regenerating overlay (design Illustration/05)
  regenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13,27,46,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  regenOverlayText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: 'rgba(255,255,255,0.8)',
  },
  regenReassurance: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.64)',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  ring: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: 'rgba(155,127,212,0.3)',
    borderTopColor: colors.purpleSoft,
  },
  regenBarBlock: { marginTop: spacing.sm },
  regenTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  regenFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  regenPercentText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Alternatives (design Illustration/04)
  altLead: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    marginBottom: 18,
  },
  altGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  altTile: {
    flexBasis: '46%',
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  altTileSelected: { borderColor: colors.primary },
  altTileUnselected: { borderColor: 'transparent' },
  altImageBox: { height: 140, backgroundColor: colors.muted },
  altLabelBar: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
  },
  altLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
  },
  altLabelActive: { color: colors.primary },
  altCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altBusyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(44,40,37,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Shared feedback
  quotaBanner: {
    backgroundColor: colors.secondary,
    borderRadius: radius.base,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  quotaText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.secondaryForeground,
    textAlign: 'center',
    lineHeight: 19,
  },
  quotaLink: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 4,
  },
  inlineError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginBottom: spacing.sm,
  },
  submitError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    textAlign: 'center',
  },
  ctaCaption: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footerContent: { paddingHorizontal: spacing.pageX, paddingTop: spacing.xl, gap: spacing.xs },
});
