import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AIJobStatus, ErrorCode } from '@masalim/types';
import { ApiError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, gradients, radius, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { useJobProgress } from '../../../src/lib/job-stream';
import { Button } from '../../../src/components/Button';
import { Starfield } from '../../../src/components/Starfield';

const MESSAGE_ROTATE_MS = 2_500;
const READY_BEAT_MS = 800;

/** 80px open-book illustration — paths copied from the design reference (StoryGenerating). */
function GeneratingBook() {
  return (
    <Svg width={80} height={80} viewBox="0 0 80 80" fill="none">
      <Path
        d="M40 14C35 9 23 8 12 11v38c11-3 21-2 28 2V14z"
        fill="rgba(255,220,150,0.5)"
        stroke="rgba(255,220,150,0.8)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M40 14C45 9 57 8 68 11v38c-11-3-21-2-28 2V14z"
        fill="rgba(176,156,224,0.4)"
        stroke="rgba(176,156,224,0.8)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Line x1={40} y1={14} x2={40} y2={53} stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} />
      <Circle cx={24} cy={30} r={2.5} fill="rgba(255,220,150,0.9)" />
      <Circle cx={56} cy={26} r={2} fill="rgba(176,156,224,1)" />
      <Path
        d="M53 36l1.5 3.5 3.5 0.5-2.5 2.5 0.5 3.5-3-1.5-3 1.5 0.5-3.5-2.5-2.5 3.5-0.5z"
        fill="rgba(255,220,150,0.8)"
      />
    </Svg>
  );
}

/**
 * Story generation progress — full-bleed night mode. Progress reflects the
 * REAL backend job value (SSE + polling fallback); leaving the screen is fine,
 * the job keeps running server-side.
 */
export default function StoryGenerating() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { jobId, storyId } = useLocalSearchParams<{ jobId: string; storyId?: string }>();

  const { status, progress, errorCode } = useJobProgress(jobId);
  const inProgress =
    status == null || status === AIJobStatus.QUEUED || status === AIJobStatus.RUNNING;
  const failed = status === AIJobStatus.FAILED || status === AIJobStatus.CANCELLED;
  const moderationRejected = errorCode === ErrorCode.MODERATION_REJECTED;

  const storyQuery = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => api.stories.detail(storyId as string),
    enabled: storyId != null && storyId.length > 0,
  });
  const story = storyQuery.data;

  // Rotating status messages (copy lives in generating.messages).
  const rawMessages = t('generating.messages', { returnObjects: true });
  const messages: string[] = Array.isArray(rawMessages) ? (rawMessages as string[]) : [];
  const [messageIndex, setMessageIndex] = useState(0);
  useEffect(() => {
    if (!inProgress || messages.length === 0) return;
    const interval = setInterval(() => {
      setMessageIndex((index) => index + 1);
    }, MESSAGE_ROTATE_MS);
    return () => clearInterval(interval);
  }, [inProgress, messages.length]);

  // Floating glass book card (±6px, 3s) with an orbiting gold dot (4s revolution).
  const float = useSharedValue(0);
  const orbit = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(
      withTiming(-6, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    orbit.value = withRepeat(withTiming(360, { duration: 4000, easing: Easing.linear }), -1, false);
  }, [float, orbit]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbit.value}deg` }] }));

  // Progress bar width animates to the real backend value only.
  const progressValue = useSharedValue(0);
  useEffect(() => {
    progressValue.value = withTiming(progress, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, progressValue]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progressValue.value}%` }));

  // SUCCEEDED → invalidate caches, hold the "ready" beat, then open the result.
  useEffect(() => {
    if (status !== AIJobStatus.SUCCEEDED) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = async () => {
      let targetId = storyId != null && storyId.length > 0 ? storyId : undefined;
      if (targetId == null) {
        try {
          targetId = (await api.jobs.get(jobId)).entityId ?? undefined;
        } catch {
          // Fall through — we still leave this screen below.
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['stories'] });
      if (targetId != null) {
        await queryClient.invalidateQueries({ queryKey: ['story', targetId] });
      }
      if (cancelled) return;
      const target = targetId;
      timer = setTimeout(() => {
        if (cancelled) return;
        if (target != null) {
          router.replace(`/story/${target}` as never);
        } else {
          router.back();
        }
      }, READY_BEAT_MS);
    };

    void finish();
    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
  }, [status, storyId, jobId, queryClient]);

  // Retry after failure: re-queue generation and swap in the new job id.
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryMutation = useMutation({
    mutationFn: async () => {
      let targetId = storyId != null && storyId.length > 0 ? storyId : undefined;
      if (targetId == null) {
        targetId = (await api.jobs.get(jobId)).entityId ?? undefined;
      }
      if (targetId == null) {
        throw new ApiError(ErrorCode.NOT_FOUND, 'Story for job not found', 404);
      }
      const { jobId: newJobId } = await api.stories.generate(targetId);
      return { newJobId, targetId };
    },
    onSuccess: ({ newJobId, targetId }) => {
      router.replace(`/story/generating/${newJobId}?storyId=${targetId}` as never);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setRetryError(t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') }));
      } else {
        setRetryError(t('errors.OFFLINE'));
      }
    },
  });

  const subtitleSource =
    story != null ? (story.title.trim().length > 0 ? story.title : story.heroName) : null;
  const subtitle =
    subtitleSource != null
      ? t('generating.subtitle', { title: subtitleSource })
      : t('generating.subtitleGeneric');

  const message =
    status === AIJobStatus.SUCCEEDED
      ? t('generating.ready')
      : (messages[messageIndex % Math.max(messages.length, 1)] ?? '');

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={gradients.nightSky as unknown as [string, string, ...string[]]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Starfield count={20} />

      {failed ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorEmoji}>🌧️</Text>
          <Text style={styles.errorTitle}>
            {moderationRejected
              ? t('errors.MODERATION_REJECTED')
              : t('errors.STORY_GENERATION_FAILED')}
          </Text>
          {retryError != null ? <Text style={styles.retryError}>{retryError}</Text> : null}
          <View style={styles.errorButtons}>
            {!moderationRejected ? (
              <Button
                label={t('common.retry')}
                onPress={() => {
                  setRetryError(null);
                  retryMutation.mutate();
                }}
                loading={retryMutation.isPending}
              />
            ) : null}
            <Button label={t('common.back')} variant="ghostDark" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <>
          <Animated.View style={[styles.bookCard, floatStyle]}>
            <GeneratingBook />
            <Animated.View style={[styles.orbit, orbitStyle]} pointerEvents="none">
              <View style={styles.orbitDot} />
            </Animated.View>
          </Animated.View>

          <View style={styles.messageBlock}>
            <Animated.Text
              key={message}
              entering={FadeInUp.duration(400)}
              style={styles.message}
              numberOfLines={2}
            >
              {message}
            </Animated.Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, fillStyle]}>
                <LinearGradient
                  colors={gradients.generatingProgress as unknown as [string, string]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
          </View>
        </>
      )}

      <Text style={[styles.backgroundNote, { bottom: Math.max(insets.bottom, 24) + 36 }]}>
        {t('generating.backgroundNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.pageXWide,
    overflow: 'hidden',
  },
  bookCard: {
    width: 140,
    height: 140,
    borderRadius: radius.logo,
    backgroundColor: 'rgba(176,156,224,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(176,156,224,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxxl,
  },
  orbit: {
    position: 'absolute',
    top: -5,
    left: -5,
    width: 150,
    height: 150,
  },
  orbitDot: {
    position: 'absolute',
    top: -5,
    left: 70,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gold,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 6,
  },
  messageBlock: { alignItems: 'center', marginBottom: spacing.xxxl },
  message: {
    minHeight: 60,
    fontFamily: fontFamilies.displayMedium,
    fontSize: fontSizes.h3,
    lineHeight: 30,
    color: colors.primaryForeground,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: 'rgba(176,156,224,0.7)',
    textAlign: 'center',
  },
  progressWrap: { width: '100%', maxWidth: 280 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  errorBlock: { alignItems: 'center', alignSelf: 'stretch' },
  errorEmoji: { fontSize: 48, marginBottom: spacing.md },
  errorTitle: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: fontSizes.h3,
    lineHeight: 30,
    color: colors.primaryForeground,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  retryError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.coral,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  errorButtons: { alignSelf: 'stretch', maxWidth: 320, width: '100%', gap: spacing.sm },
  backgroundNote: {
    position: 'absolute',
    paddingHorizontal: spacing.pageXWide,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
});
