import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  IllustrationSetStatus,
  IllustrationStyle,
  StoryStatus,
} from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
import type { Illustration, IllustrationSet } from '@masalim/validation';
import {
  colors,
  coverTints,
  fontFamilies,
  fontSizes,
  gradients,
  radius,
  spacing,
} from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { useJobProgress } from '../../../src/lib/job-stream';
import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { Chip } from '../../../src/components/Chip';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { SelectableCard } from '../../../src/components/SelectableCard';
import { CheckIcon } from '../../../src/components/icons';
import { ErrorState } from '../../../src/components/states';

/** Picker order mirrors the design's card order. */
const STYLE_ORDER: IllustrationStyle[] = [
  IllustrationStyle.WATERCOLOR,
  IllustrationStyle.SOFT_3D,
  IllustrationStyle.CLASSIC_STORYBOOK,
  IllustrationStyle.PASTEL,
  IllustrationStyle.HAND_DRAWN,
];

/**
 * Three vertical color stripes per style card (design: IllustrationStyle).
 * Tokens where they exist; the classic/pastel palettes are design literals
 * absent from the token set.
 */
const STYLE_STRIPES: Record<IllustrationStyle, readonly [string, string, string]> = {
  WATERCOLOR: [coverTints[1], colors.lavenderLight, colors.peach],
  SOFT_3D: [colors.peach, colors.gold, coverTints[2]],
  CLASSIC_STORYBOOK: ['#D4A574', '#8B6914', '#5C3D1E'],
  PASTEL: ['#F0C9D4', '#C9E0F0', '#D4F0C9'],
  HAND_DRAWN: [colors.foreground, colors.mutedForeground, colors.background],
};

const STYLE_EMOJIS: Record<IllustrationStyle, string> = {
  WATERCOLOR: '🎨',
  SOFT_3D: '🧸',
  CLASSIC_STORYBOOK: '📖',
  PASTEL: '🌸',
  HAND_DRAWN: '✏️',
};

const byCreatedAt = (a: Illustration, b: Illustration) => a.createdAt.localeCompare(b.createdAt);

interface AltTileProps {
  illustration: Illustration;
  /** Fixed square size; omit for a full-width square tile (single cover). */
  size?: number;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
  accessibilityLabel: string;
}

/**
 * One illustration alternative — SelectableCard pattern on an image: 2px border
 * (primary when selected) + check circle; spinner overlay while the selection
 * PATCH is in flight.
 */
function AltTile({ illustration, size, busy, disabled, onSelect, accessibilityLabel }: AltTileProps) {
  return (
    <Pressable
      onPress={onSelect}
      disabled={disabled || busy || illustration.selected}
      accessibilityRole="radio"
      accessibilityState={{ selected: illustration.selected }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.altTile,
        size != null ? { width: size, height: size } : styles.altTileFull,
        illustration.selected ? styles.altTileSelected : styles.altTileUnselected,
      ]}
    >
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
    </Pressable>
  );
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
  const [regen, setRegen] = useState<{ jobId: string; rowKey: string } | null>(null);

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
      setRegen(null);
      void queryClient.invalidateQueries({ queryKey: ['illustrations', id] });
    }
  }, [regen, regenJob.status, regenJob.errorCode, id, queryClient, t]);

  const applyRequestError = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.code === ErrorCode.QUOTA_EXCEEDED) {
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
      setRegen({ jobId, rowKey });
    } catch (err) {
      if (err instanceof ApiError && err.code === ErrorCode.QUOTA_EXCEEDED) {
        setQuotaHit(true);
      } else if (err instanceof ApiError) {
        setRowError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof NetworkError) {
        setRowError(t('errors.OFFLINE'));
      } else {
        setRowError(t('errors.GENERIC'));
      }
    }
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

  const quotaBanner = quotaHit ? (
    <Animated.View entering={FadeInUp.duration(250)} style={styles.quotaBanner}>
      <Text style={styles.quotaText}>{t('subscription.quotaReachedIllustrations')}</Text>
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
            <View style={styles.stripes}>
              {STYLE_STRIPES[style].map((stripeColor, index) => (
                <View key={index} style={[styles.stripeBar, { backgroundColor: stripeColor }]} />
              ))}
            </View>
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

  const renderRegenControl = (rowKey: string, target: Illustration) => {
    if (regen?.rowKey === rowKey) {
      return <ActivityIndicator size="small" color={colors.primary} />;
    }
    return (
      <Pressable
        onPress={() => {
          void onRegenerate(rowKey, target);
        }}
        disabled={regen != null}
        accessibilityRole="button"
        accessibilityLabel={t('illustrate.regenerate')}
        style={({ pressed }) => [
          styles.regenButton,
          { opacity: regen != null ? 0.5 : pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={styles.regenLabel}>{t('illustrate.regenerate')}</Text>
      </Pressable>
    );
  };

  const renderReady = (set: IllustrationSet) => {
    const covers = set.illustrations.filter((item) => item.isCover).sort(byCreatedAt);
    const coverTarget = covers.find((item) => item.selected) ?? covers[0];
    const pageRows = sortedPages
      .map((page) => ({
        page,
        alternatives: set.illustrations
          .filter((item) => !item.isCover && item.storyPageId === page.id)
          .sort(byCreatedAt),
      }))
      .filter((row) => row.alternatives.length > 0);

    return (
      <Animated.View entering={FadeInUp.duration(300)}>
        <View style={styles.readyHeaderRow}>
          <Badge label={t(`illustrate.styles.${set.style}`)} />
        </View>
        {rowError != null ? <Text style={styles.inlineError}>{rowError}</Text> : null}

        {/* Cover */}
        {covers.length > 0 && coverTarget != null ? (
          <View style={styles.pageSection}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>{t('illustrate.progressCover')}</Text>
              {renderRegenControl('cover', coverTarget)}
            </View>
            {covers.length > 1 ? (
              <>
                <Text style={styles.altHelper}>{t('illustrate.chooseAlternative')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.altRowContent}
                >
                  {covers.map((illustration) => (
                    <AltTile
                      key={illustration.id}
                      illustration={illustration}
                      size={168}
                      busy={selectingId === illustration.id}
                      disabled={selectingId != null}
                      onSelect={() => {
                        void onSelectAlternative(illustration);
                      }}
                      accessibilityLabel={t('illustrate.progressCover')}
                    />
                  ))}
                </ScrollView>
              </>
            ) : (
              <AltTile
                illustration={coverTarget}
                busy={selectingId === coverTarget.id}
                disabled={selectingId != null}
                onSelect={() => {
                  void onSelectAlternative(coverTarget);
                }}
                accessibilityLabel={t('illustrate.progressCover')}
              />
            )}
          </View>
        ) : null}

        {/* Pages */}
        {pageRows.map(({ page, alternatives }) => {
          const target = alternatives.find((item) => item.selected) ?? alternatives[0];
          if (target == null) return null;
          return (
            <View key={page.id} style={styles.pageSection}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>
                  {t('illustrate.progressPage', { number: page.pageNumber })}
                </Text>
                {renderRegenControl(page.id, target)}
              </View>
              {alternatives.length > 1 ? (
                <Text style={styles.altHelper}>{t('illustrate.chooseAlternative')}</Text>
              ) : null}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.altRowContent}
              >
                {alternatives.map((illustration) => (
                  <AltTile
                    key={illustration.id}
                    illustration={illustration}
                    size={112}
                    busy={selectingId === illustration.id}
                    disabled={selectingId != null}
                    onSelect={() => {
                      void onSelectAlternative(illustration);
                    }}
                    accessibilityLabel={t('illustrate.progressPage', {
                      number: page.pageNumber,
                    })}
                  />
                ))}
              </ScrollView>
            </View>
          );
        })}
      </Animated.View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <ScreenHeader
          eyebrow={t('illustrate.eyebrow')}
          title={showPicker ? t('illustrate.pickerTitle') : t('illustrate.title')}
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
          { paddingBottom: showPicker ? 220 : Math.max(insets.bottom, 16) + spacing.xxl },
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
              : renderReady(activeSet)}
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
              leading={<Text style={styles.ctaEmoji}>🎨</Text>}
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
      ) : null}
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
  stripes: { width: 96, flexDirection: 'row', alignSelf: 'stretch' },
  stripeBar: { flex: 1 },
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

  // Ready set
  readyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  pageSection: { marginBottom: spacing.xl },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  rowTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  altHelper: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
  },
  altRowContent: { gap: spacing.xs },
  altTile: {
    borderRadius: radius.md,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  altTileFull: { width: '100%', aspectRatio: 1 },
  altTileSelected: { borderColor: colors.primary },
  altTileUnselected: { borderColor: colors.border },
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
  regenButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  regenLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
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
  ctaEmoji: { fontSize: fontSizes.xl },
  ctaCaption: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footerContent: { paddingHorizontal: spacing.pageX, paddingTop: spacing.xl, gap: spacing.xs },
});
