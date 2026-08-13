import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AIJobStatus, DURATION_TARGETS, NarrationStatus, StoryStatus } from '@masalim/types';
import { ApiError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, gradients, radius, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { useJobProgress } from '../../../src/lib/job-stream';
import { Button } from '../../../src/components/Button';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { Starfield } from '../../../src/components/Starfield';
import { ChevronLeftIcon, PlayIcon, ShareIcon } from '../../../src/components/icons';
import { EmptyState, ErrorState } from '../../../src/components/states';

/** Fallback cover emoji per story theme (used when no cover illustration exists yet). */
const THEME_EMOJI: Record<string, string> = {
  ADVENTURE: '🗺️',
  SLEEP: '🌙',
  FRIENDSHIP: '🤗',
  COURAGE: '🦁',
  ANIMALS: '🐻',
  SPACE: '🚀',
  FAIRY_TALE: '🏰',
  EMOTIONS: '💛',
  EDUCATIONAL: '📚',
  FANTASY: '🦄',
  SEA: '🐬',
  NATURE: '🌲',
  IMAGINATION: '✨',
};

/** Confetti accents floating over the cover hero (per the design reference). */
const CONFETTI: { color: string; top: `${number}%`; left: `${number}%`; duration: number }[] = [
  { color: colors.gold, top: '30%', left: '15%', duration: 2000 },
  { color: colors.coral, top: '45%', left: '62%', duration: 2500 },
  { color: colors.sage, top: '60%', left: '35%', duration: 3000 },
  { color: colors.lavender, top: '75%', left: '46%', duration: 3500 },
];

/** Gentle vertical float (±6px), same pattern as the splash screen. */
function useFloatStyle(duration: number, delay = 0) {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withDelay(
      delay,
      withRepeat(withTiming(-6, { duration, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [duration, delay, offset]);

  return useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
}

function ConfettiDot({ index }: { index: number }) {
  const dot = CONFETTI[index];
  const floatStyle = useFloatStyle(dot?.duration ?? 2000, index * 300);
  if (dot == null) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confettiDot,
        { backgroundColor: dot.color, top: dot.top, left: dot.left },
        floatStyle,
      ]}
    />
  );
}

/**
 * Story result — cover hero + actions. With a READY narration the primary CTA
 * is "Dinlemeye Başla" (player); otherwise "Oku" stays primary and the action
 * grid gains a "Seslendir" tile. NOTE (phase deviation): the Görselleştir/
 * Kitap Yap tiles arrive with the illustration/book phases.
 */
export default function StoryResult() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const coverFloatStyle = useFloatStyle(4000);

  const storyQuery = useQuery({
    queryKey: ['story', id],
    queryFn: () => api.stories.detail(id),
    enabled: id != null && id.length > 0,
  });
  const story = storyQuery.data;

  const narrationsQuery = useQuery({
    queryKey: ['narrations', id],
    queryFn: () => api.narrations.list(id),
    enabled: id != null && id.length > 0,
  });
  const narrations = narrationsQuery.data ?? [];
  const readyNarration =
    narrations.find((narration) => narration.status === NarrationStatus.READY) ?? null;
  const processingNarration =
    narrations.find(
      (narration) =>
        narration.status === NarrationStatus.QUEUED ||
        narration.status === NarrationStatus.PROCESSING,
    ) ?? null;
  // Real progress for an in-flight narration; no-op when there is none.
  const narrationJob = useJobProgress(processingNarration?.jobId ?? undefined);

  // When the in-flight narration finishes, refresh so the listen CTA appears.
  useEffect(() => {
    if (
      narrationJob.status === AIJobStatus.SUCCEEDED ||
      narrationJob.status === AIJobStatus.FAILED ||
      narrationJob.status === AIJobStatus.CANCELLED
    ) {
      void queryClient.invalidateQueries({ queryKey: ['narrations', id] });
      void queryClient.invalidateQueries({ queryKey: ['story', id] });
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
    }
  }, [narrationJob.status, queryClient, id]);

  if (storyQuery.isPending) {
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

  if (story.status === StoryStatus.GENERATING) {
    return (
      <View style={[styles.stateFill, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <ScreenHeader />
        <EmptyState
          emoji="🪄"
          title={t('generating.subtitleGeneric')}
          body={t('errors.STORY_NOT_READY')}
          ctaLabel={t('common.back')}
          onCta={() => router.back()}
        />
      </View>
    );
  }

  const firstPageText = [...story.pages].sort((a, b) => a.pageNumber - b.pageNumber)[0]?.text;
  const excerpt = firstPageText ?? story.summary ?? '';
  const themeEmoji = THEME_EMOJI[story.themes[0] ?? ''] ?? '⭐';
  const themeLabels = story.themes
    .slice(0, 2)
    .map((theme) => t(`wizard.themes.${theme}`))
    .join(' · ');
  const durationLabel = t('common.minutes', {
    count: DURATION_TARGETS[story.durationTarget].minutes,
  });

  const openReader = () => router.push(`/story/${story.id}/reader` as never);
  const openPlayer = () => router.push(`/story/${story.id}/player` as never);
  const openNarrate = () => router.push(`/story/${story.id}/narrate` as never);
  const openEdit = () => router.push(`/story/${story.id}/edit` as never);
  const share = () => {
    void Share.share({
      title: story.title,
      message: `${story.title}\n\n${story.summary ?? firstPageText ?? ''}`,
    }).catch(() => {
      // Share sheet dismissed/unavailable — nothing to surface.
    });
  };

  const actions = [
    { key: 'read', emoji: '📖', label: t('storyResult.read'), onPress: openReader },
    { key: 'narrate', emoji: '🎙', label: t('narrate.create'), onPress: openNarrate },
    { key: 'edit', emoji: '✏️', label: t('storyResult.edit'), onPress: openEdit },
    { key: 'share', emoji: '🔗', label: t('storyResult.share'), onPress: share },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Cover hero */}
      <View style={styles.hero}>
        <LinearGradient
          colors={gradients.storyCover as unknown as [string, string, ...string[]]}
          locations={[0, 0.6, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Starfield count={16} />
        {CONFETTI.map((dot, index) => (
          <ConfettiDot key={dot.color} index={index} />
        ))}

        <Animated.View style={[styles.coverTile, coverFloatStyle]}>
          {story.coverImageUrl != null ? (
            <Image
              source={{ uri: story.coverImageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text style={styles.coverEmoji}>{themeEmoji}</Text>
          )}
        </Animated.View>

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[styles.heroButton, { top: insets.top + 8, left: spacing.lg }]}
        >
          <ChevronLeftIcon color={colors.primaryForeground} />
        </Pressable>
        <Pressable
          onPress={share}
          accessibilityRole="button"
          accessibilityLabel={t('storyResult.share')}
          style={[styles.heroButton, { top: insets.top + 8, right: spacing.lg }]}
        >
          <ShareIcon />
        </Pressable>
      </View>

      {/* Info */}
      <Animated.View entering={FadeInUp.duration(500)} style={styles.content}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {(story.childName != null
              ? t('storyResult.preparedFor', { name: story.childName })
              : t('storyResult.generalStory')
            ).toLocaleUpperCase('tr')}
          </Text>
        </View>

        <Text style={styles.title}>{story.title}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaIcon}>⏱</Text>
            <Text style={styles.metaText}>{durationLabel}</Text>
          </View>
          {themeLabels.length > 0 ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>{themeEmoji}</Text>
              <Text style={styles.metaText}>{themeLabels}</Text>
            </View>
          ) : null}
        </View>

        {/* Primary CTA — listen when a narration is READY, read otherwise. */}
        {readyNarration != null ? (
          <Button
            label={t('storyResult.listen')}
            leading={<PlayIcon size={18} color={colors.primaryForeground} />}
            onPress={openPlayer}
          />
        ) : (
          <Button
            label={t('storyResult.read')}
            leading={<Text style={styles.ctaEmoji}>📖</Text>}
            onPress={openReader}
          />
        )}

        {processingNarration != null ? (
          <Text style={styles.preparingText}>
            {narrationJob.progress > 0
              ? `${t('storyResult.narrationPreparing')} %${Math.round(
                  Math.min(Math.max(narrationJob.progress, 0), 100),
                )}`
              : t('storyResult.narrationPreparing')}
          </Text>
        ) : null}

        <View style={styles.actionGrid}>
          {actions.map((action) => (
            <Pressable
              key={action.key}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={({ pressed }) => [styles.actionTile, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.actionEmoji}>{action.emoji}</Text>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {excerpt.length > 0 ? (
          <View style={styles.excerptCard}>
            <Text style={styles.excerptTitle}>
              {t('storyResult.excerptTitle').toLocaleUpperCase('tr')}
            </Text>
            <Text style={styles.excerptText} numberOfLines={4}>
              “{excerpt}”
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </ScrollView>
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
  hero: {
    height: 360,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroButton: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverTile: {
    width: 160,
    height: 160,
    borderRadius: radius.cover,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 60,
    elevation: 10,
  },
  coverEmoji: { fontSize: 72 },
  confettiDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  content: { paddingHorizontal: spacing.pageX, paddingTop: 28 },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124,92,191,0.1)',
    borderRadius: radius.lg,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: spacing.sm,
  },
  pillText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
    letterSpacing: 0.7,
  },
  title: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.displayLg,
    lineHeight: 36,
    letterSpacing: -0.3,
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: 28 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaIcon: { fontSize: fontSizes.base },
  metaText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  ctaEmoji: { fontSize: 20 },
  preparingText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actionGrid: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionEmoji: { fontSize: 22 },
  actionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  excerptCard: {
    marginTop: 28,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  excerptTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  excerptText: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.lg,
    lineHeight: 25,
    color: colors.foreground,
  },
});
