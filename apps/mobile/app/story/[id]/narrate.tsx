import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import {
  AIJobStatus,
  DURATION_TARGETS,
  NarrationStatus,
  VoiceProfileStatus,
  type SystemVoiceCategory,
  type VoiceOwnerType,
} from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
import type {
  CreateNarrationInput,
  Narration,
  SystemVoice,
  VoiceProfile,
} from '@masalim/validation';
import { colors, fontFamilies, fontSizes, gradients, radius, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { useJobProgress } from '../../../src/lib/job-stream';
import { stopPreview, usePreviewPlayer } from '../../../src/lib/preview-player';
import { AudioPreviewButton } from '../../../src/components/AudioPreviewButton';
import { Avatar } from '../../../src/components/Avatar';
import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { PremiumSheet } from '../../../src/components/PremiumSheet';
import { SelectableCard } from '../../../src/components/SelectableCard';
import { storyThemeEmoji } from '../../../src/components/StorySheet';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
} from '../../../src/components/icons';
import { ErrorState } from '../../../src/components/states';

/** Parent voice avatars derive from the profile's owner type. */
const OWNER_EMOJIS: Record<VoiceOwnerType, string> = {
  MOTHER: '👩',
  FATHER: '👨',
  GRANDMOTHER: '👵',
  GRANDFATHER: '👴',
  OTHER: '🎙️',
};

/** System voices carry no emoji in the API — derive one from the category. */
const VOICE_CATEGORY_EMOJIS: Record<SystemVoiceCategory, string> = {
  CALM: '🌙',
  CHEERFUL: '⭐',
  FAIRYTALE: '🧚',
  ENERGETIC: '⚡',
};

type VoiceSelection = { type: 'parent' | 'system'; id: string };
type PreviewPlayer = ReturnType<typeof usePreviewPlayer>;

/** "6 dk" from a narration's duration in seconds (null while not READY). */
function durationMinutes(durationSeconds: number | null): number | null {
  if (durationSeconds == null) return null;
  return Math.max(1, Math.round(durationSeconds / 60));
}

/** Status pill on voice rows: Hazır (sage) / Hazırlanıyor… (dusty blue) / Hata (destructive). */
function StatusPill({ tone, label }: { tone: 'ready' | 'processing' | 'error'; label: string }) {
  return (
    <View style={[styles.pill, pillTones[tone]]}>
      <Text style={[styles.pillText, pillTextTones[tone]]}>{label}</Text>
    </View>
  );
}

/** One of the three staggered pulsing dots next to a processing parent voice. */
function PulsingDot({ index }: { index: number }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withDelay(
      index * 200,
      withRepeat(withTiming(0.25, { duration: 500, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [index, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.pulsingDot, style]} />;
}

/** Spinning dashed-arc medallion of the night generating view (design: spin-slow 3s). */
function SpinnerArc() {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 3000, easing: Easing.linear }), -1, false);
  }, [spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return (
    <Animated.View style={[styles.spinnerCircle, style]}>
      <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
        <Circle
          cx={12}
          cy={12}
          r={10}
          stroke={colors.lavender}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="40"
          strokeDashoffset="10"
        />
      </Svg>
    </Animated.View>
  );
}

/** Thin progress bar under the generating copy — driven only by the real job percent. */
function NightProgress({ percent }: { percent: number }) {
  const progressValue = useSharedValue(0);
  useEffect(() => {
    progressValue.value = withTiming(percent, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [percent, progressValue]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progressValue.value}%` }));
  return (
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
  );
}

/** Floating confetti dots of the done view (design ref: NarrationSelect success). */
function Confetti() {
  return (
    <>
      {[colors.gold, colors.coral, colors.sage, colors.lavender].map((color, index) => (
        <ConfettiDot key={color} color={color} index={index} />
      ))}
    </>
  );
}

function ConfettiDot({ color, index }: { color: string; index: number }) {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(
      withTiming(-10, { duration: 2000 + index * 400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [float, index]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confettiDot,
        { backgroundColor: color, top: `${20 + index * 14}%`, left: `${12 + index * 20}%` },
        style,
      ]}
    />
  );
}

interface NarrationRowProps {
  narration: Narration;
  onOpen: () => void;
  onRetry: () => void;
  retryDisabled: boolean;
}

/**
 * Existing narration row. READY → tappable (routes to the player) with a play
 * circle + duration + "Hazır" badge. QUEUED/PROCESSING → real job progress bar
 * (never fabricated). FAILED → error tint + retry with the same voice.
 */
function NarrationRow({ narration, onOpen, onRetry, retryDisabled }: NarrationRowProps) {
  const { t } = useTranslation();
  const inFlight =
    narration.status === NarrationStatus.QUEUED || narration.status === NarrationStatus.PROCESSING;
  const job = useJobProgress(inFlight ? (narration.jobId ?? undefined) : undefined);

  if (narration.status === NarrationStatus.READY) {
    const minutes = durationMinutes(narration.duration);
    return (
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={narration.narratorName}
        style={({ pressed }) => [styles.narrationRow, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={styles.playCircle}>
          <PlayIcon size={12} color={colors.primary} />
        </View>
        <View style={styles.narrationBody}>
          <Text style={styles.narrationName} numberOfLines={1}>
            {narration.narratorName}
          </Text>
          {minutes != null ? (
            <Text style={styles.narrationMeta}>{t('common.minutesShort', { count: minutes })}</Text>
          ) : null}
        </View>
        <Badge label={t('voice.statusReady')} variant="success" />
      </Pressable>
    );
  }

  if (narration.status === NarrationStatus.FAILED) {
    return (
      <View style={[styles.narrationRow, styles.narrationRowFailed]}>
        <Text style={styles.failedEmoji}>⚠️</Text>
        <View style={styles.narrationBody}>
          <Text style={styles.narrationName} numberOfLines={1}>
            {narration.narratorName}
          </Text>
          <Text style={styles.failedText}>{t('voice.statusFailed')}</Text>
        </View>
        <Pressable
          onPress={onRetry}
          disabled={retryDisabled}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
          style={({ pressed }) => [
            styles.retryButton,
            { opacity: retryDisabled ? 0.5 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.retryLabel}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  // QUEUED / PROCESSING — thin bar driven by the job's real milestones.
  const progress = Math.round(Math.min(Math.max(job.progress, 0), 100));
  return (
    <View style={styles.narrationRow}>
      <ActivityIndicator size="small" color={colors.primary} />
      <View style={styles.narrationBody}>
        <Text style={styles.narrationName} numberOfLines={1}>
          {narration.narratorName}
        </Text>
        <View style={styles.rowTrack}>
          <View style={[styles.rowFill, { width: `${progress}%` }]} />
        </View>
      </View>
      <Text style={styles.narrationMeta}>{t('voice.statusProcessing')}</Text>
    </View>
  );
}

interface ParentVoiceRowProps {
  voice: VoiceProfile;
  selected: boolean;
  existing: Narration | null;
  onSelect: () => void;
  onRetryVoice: () => void;
  preview: PreviewPlayer;
}

/**
 * Family voice row per the design: peach-gradient avatar when READY (muted
 * otherwise), name + status pill, per-status sub line, preview button; only
 * READY voices are selectable. FAILED voices deep-link into re-recording.
 */
function ParentVoiceRow({
  voice,
  selected,
  existing,
  onSelect,
  onRetryVoice,
  preview,
}: ParentVoiceRowProps) {
  const { t } = useTranslation();

  if (voice.status === VoiceProfileStatus.READY) {
    return (
      <SelectableCard
        glow
        selected={selected}
        showCheck={existing == null}
        onPress={onSelect}
        accessibilityLabel={voice.displayName}
        style={styles.voiceRow}
      >
        <Avatar emoji={OWNER_EMOJIS[voice.ownerType]} size={46} kind="parentVoice" />
        <View style={styles.voiceTextBlock}>
          <View style={styles.voiceNameRow}>
            <Text style={styles.voiceName} numberOfLines={1}>
              {voice.displayName}
            </Text>
            <StatusPill tone="ready" label={t('voice.statusReady')} />
          </View>
          <Text style={styles.voiceSub} numberOfLines={1}>
            {t(`voice.owners.${voice.ownerType}`)}
          </Text>
        </View>
        <AudioPreviewButton
          status={preview.statusFor(voice.id)}
          onPress={() =>
            preview.toggle(voice.id, () =>
              voice.previewUrl != null
                ? Promise.resolve(voice.previewUrl)
                : api.voices.preview(voice.id).then((r) => r.previewUrl),
            )
          }
        />
        {existing != null ? (
          <View style={styles.existingCheck}>
            <CheckIcon size={10} />
          </View>
        ) : null}
      </SelectableCard>
    );
  }

  if (voice.status === VoiceProfileStatus.FAILED) {
    return (
      <View style={styles.voiceRowStatic}>
        <View style={styles.mutedAvatar}>
          <Text style={styles.mutedAvatarEmoji}>{OWNER_EMOJIS[voice.ownerType]}</Text>
        </View>
        <View style={styles.voiceTextBlock}>
          <View style={styles.voiceNameRow}>
            <Text style={styles.voiceName} numberOfLines={1}>
              {voice.displayName}
            </Text>
            <StatusPill tone="error" label={t('narrate.statusError')} />
          </View>
          <Text style={styles.voiceSub}>{t('narrate.voiceFailedSub')}</Text>
          <Pressable
            onPress={onRetryVoice}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            hitSlop={8}
            style={({ pressed }) => [styles.retryLinkWrap, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.retryLink}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // RECORDING_UPLOADED / PROCESSING — not selectable, three pulsing dots.
  return (
    <View style={styles.voiceRowStatic}>
      <View style={styles.mutedAvatar}>
        <Text style={styles.mutedAvatarEmoji}>{OWNER_EMOJIS[voice.ownerType]}</Text>
      </View>
      <View style={styles.voiceTextBlock}>
        <View style={styles.voiceNameRow}>
          <Text style={styles.voiceName} numberOfLines={1}>
            {voice.displayName}
          </Text>
          <StatusPill tone="processing" label={t('wizard.voiceNotReady')} />
        </View>
        <Text style={styles.voiceSub}>{t('narrate.voiceProcessingSub')}</Text>
      </View>
      <View style={styles.dotsRow}>
        {[0, 1, 2].map((index) => (
          <PulsingDot key={index} index={index} />
        ))}
      </View>
    </View>
  );
}

interface SystemVoiceRowProps {
  voice: SystemVoice;
  selected: boolean;
  existing: Narration | null;
  onPress: () => void;
  preview: PreviewPlayer;
}

/** Storyteller row: lavender-gradient avatar, name (+ premium badge), description, preview. */
function SystemVoiceRow({ voice, selected, existing, onPress, preview }: SystemVoiceRowProps) {
  const { t } = useTranslation();
  return (
    <SelectableCard
      glow
      selected={selected}
      showCheck={existing == null}
      onPress={onPress}
      accessibilityLabel={voice.displayName}
      style={styles.voiceRow}
    >
      <Avatar emoji={VOICE_CATEGORY_EMOJIS[voice.category]} size={46} kind="systemVoice" />
      <View style={styles.voiceTextBlock}>
        <View style={styles.voiceNameRow}>
          <Text style={styles.voiceName} numberOfLines={1}>
            {voice.displayName}
          </Text>
          {voice.premiumOnly ? (
            <Badge label={t('wizard.premiumBadge')} variant="premium" uppercase />
          ) : null}
        </View>
        <Text style={styles.voiceSub} numberOfLines={1}>
          {voice.description}
        </Text>
      </View>
      <AudioPreviewButton
        status={preview.statusFor(voice.id)}
        onPress={() =>
          preview.toggle(voice.id, () =>
            voice.previewUrl != null
              ? Promise.resolve(voice.previewUrl)
              : api.voices.systemPreview(voice.id).then((r) => r.previewUrl),
          )
        }
      />
      {existing != null ? (
        <View style={styles.existingCheck}>
          <CheckIcon size={10} />
        </View>
      ) : null}
    </SelectableCard>
  );
}

/**
 * "Hikâyeyi kim anlatsın?" — re-voice an existing story: story info card,
 * family voices (with clone statuses), system storytellers, shared premium
 * gate sheet, and a full-bleed night generating/done takeover driven by the
 * real narration job. Completed narrations open in the player.
 */
export default function NarrateStory() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id, voiceId: preselectVoiceId } = useLocalSearchParams<{
    id: string;
    voiceId?: string;
  }>();
  const preview = usePreviewPlayer();

  const [selected, setSelected] = useState<VoiceSelection | null>(null);
  const [premiumGate, setPremiumGate] = useState<'voiceClone' | 'premiumVoice' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<{
    jobId: string;
    narrationId: string;
    narratorName: string;
  } | null>(null);
  const [done, setDone] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const enabled = id != null && id.length > 0;
  const narrationsQuery = useQuery({
    queryKey: ['narrations', id],
    queryFn: () => api.narrations.list(id),
    enabled,
  });
  const voicesQuery = useQuery({ queryKey: ['voices'], queryFn: () => api.voices.list() });
  const systemVoicesQuery = useQuery({
    queryKey: ['systemVoices'],
    queryFn: () => api.voices.system(),
  });
  const entitlementsQuery = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.subscription.entitlements(),
  });
  // Feeds the story info card (title, theme emoji, real duration target, child).
  const storyQuery = useQuery({
    queryKey: ['story', id],
    queryFn: () => api.stories.detail(id),
    enabled,
  });

  const narrations = narrationsQuery.data ?? [];
  const parentVoices = (voicesQuery.data ?? []).filter(
    (voice) => voice.status !== VoiceProfileStatus.DELETED,
  );
  const systemVoices = systemVoicesQuery.data ?? [];
  const canUsePremiumVoices = entitlementsQuery.data?.features.premium_system_voices === true;
  const canCloneVoice = entitlementsQuery.data?.features.parent_voice_clone;
  const story = storyQuery.data ?? null;

  const job = useJobProgress(activeJob?.jobId);

  // Preselect the narrator chosen in the wizard (route param) once the system
  // voices load — only when the user hasn't tapped a voice yet and the choice
  // is actually selectable under the current entitlements.
  useEffect(() => {
    if (
      selected != null ||
      preselectVoiceId == null ||
      preselectVoiceId.length === 0 ||
      systemVoicesQuery.data == null ||
      entitlementsQuery.data == null
    ) {
      return;
    }
    const match = systemVoicesQuery.data.find((voice) => voice.id === preselectVoiceId);
    if (match != null && (!match.premiumOnly || canUsePremiumVoices)) {
      setSelected({ type: 'system', id: match.id });
    }
  }, [selected, preselectVoiceId, systemVoicesQuery.data, entitlementsQuery.data, canUsePremiumVoices]);

  // Resolve the CTA-created job: success → done view (explicit CTA into the
  // player replaces the old auto-redirect); failure → inline error.
  useEffect(() => {
    if (activeJob == null || done) return;
    if (job.status === AIJobStatus.SUCCEEDED) {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ['narrations', id] });
      void queryClient.invalidateQueries({ queryKey: ['story', id] });
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
      return;
    }
    if (job.status === AIJobStatus.FAILED || job.status === AIJobStatus.CANCELLED) {
      setCreateError(
        job.errorCode != null
          ? t(`errors.${job.errorCode}`, { defaultValue: t('errors.GENERIC') })
          : t('errors.GENERIC'),
      );
      setActiveJob(null);
      void queryClient.invalidateQueries({ queryKey: ['narrations', id] });
    }
  }, [activeJob, done, job.status, job.errorCode, id, queryClient, t]);

  const openPlayer = (narrationId: string) => {
    router.push(`/story/${id}/player?narrationId=${narrationId}` as never);
  };

  const create = async (input: CreateNarrationInput) => {
    if (submitting || activeJob != null) return;
    setCreateError(null);
    setSubmitting(true);
    void stopPreview();
    try {
      const { narration, jobId } = await api.narrations.create(id, input);
      void queryClient.invalidateQueries({ queryKey: ['narrations', id] });
      if (jobId == null) {
        // Dedupe hit — this voice already narrated the current story version.
        if (narration.status === NarrationStatus.READY) {
          router.replace(`/story/${id}/player?narrationId=${narration.id}` as never);
        }
        return;
      }
      setDone(false);
      setActiveJob({ jobId, narrationId: narration.id, narratorName: narration.narratorName });
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof NetworkError) {
        setCreateError(t('errors.OFFLINE'));
      } else {
        setCreateError(t('errors.GENERIC'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onCreate = () => {
    if (selected == null) return;
    const input: CreateNarrationInput =
      selected.type === 'parent' ? { voiceProfileId: selected.id } : { systemVoiceId: selected.id };
    void create(input);
  };

  const retryNarration = (narration: Narration) => {
    // Re-POST with the exact voice the failed narration used.
    if (narration.voiceProfileId != null) {
      void create({ voiceProfileId: narration.voiceProfileId });
    } else if (narration.systemVoiceId != null) {
      void create({ systemVoiceId: narration.systemVoiceId });
    }
  };

  // A FAILED voice profile needs a fresh recording — voice studio recreate flow.
  const retryVoice = (voice: VoiceProfile) => {
    router.push(
      `/voice/create?recreateId=${encodeURIComponent(voice.id)}&ownerType=${encodeURIComponent(
        voice.ownerType,
      )}&displayName=${encodeURIComponent(voice.displayName)}` as never,
    );
  };

  // Premium gate (§36): the user learns BEFORE any work starts.
  const onCreateVoice = () => {
    if (canCloneVoice === false) {
      setPremiumGate('voiceClone');
      return;
    }
    router.push('/voice' as never);
  };

  // A voice with a READY narration for this story routes to it instead of re-creating.
  const readyByVoiceProfile = new Map<string, Narration>();
  const readyBySystemVoice = new Map<string, Narration>();
  for (const narration of narrations) {
    if (narration.status !== NarrationStatus.READY) continue;
    if (narration.voiceProfileId != null && !readyByVoiceProfile.has(narration.voiceProfileId)) {
      readyByVoiceProfile.set(narration.voiceProfileId, narration);
    }
    if (narration.systemVoiceId != null && !readyBySystemVoice.has(narration.systemVoiceId)) {
      readyBySystemVoice.set(narration.systemVoiceId, narration);
    }
  }

  const selectedName =
    selected == null
      ? null
      : selected.type === 'parent'
        ? (parentVoices.find((voice) => voice.id === selected.id)?.displayName ?? null)
        : (systemVoices.find((voice) => voice.id === selected.id)?.displayName ?? null);

  const isLoading = narrationsQuery.isPending || systemVoicesQuery.isPending;
  const isError = narrationsQuery.isError || systemVoicesQuery.isError;
  const busy = submitting || activeJob != null;

  // ——— Night takeovers while the narration job runs ———
  if (activeJob != null) {
    if (done) {
      return (
        <View style={styles.nightRoot}>
          <StatusBar style="light" />
          <LinearGradient
            colors={gradients.nightSky as unknown as [string, string, ...string[]]}
            locations={[0, 0.5, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Confetti />
          <View
            style={[
              styles.nightContent,
              { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) },
            ]}
          >
            <View style={styles.doneCircle}>
              <Text style={styles.doneEmoji}>🎉</Text>
            </View>
            <View style={styles.nightTextBlock}>
              <Text style={styles.doneTitle}>{t('narrate.doneTitle')}</Text>
              <Text style={styles.nightSub}>
                {t('narrate.doneSub', { name: activeJob.narratorName })}
              </Text>
            </View>
            <Button
              label={t('storyResult.listen')}
              onPress={() =>
                router.replace(
                  `/story/${id}/player?narrationId=${activeJob.narrationId}` as never,
                )
              }
              style={styles.nightCta}
            />
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={t('narrate.backToStory')}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={styles.nightSecondary}>{t('narrate.backToStory')}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    const percent = Math.round(Math.min(Math.max(job.progress, 0), 100));
    return (
      <View style={styles.nightRoot}>
        <StatusBar style="light" />
        <LinearGradient
          colors={gradients.nightSky as unknown as [string, string, ...string[]]}
          locations={[0, 0.5, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.nightContent,
            { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        >
          <SpinnerArc />
          <View style={styles.nightTextBlock}>
            <Text style={styles.generatingTitle}>{t('narrate.generatingTitle')}</Text>
            <Text style={styles.nightSub}>
              {t('narrate.generatingSub', { name: activeJob.narratorName })}
            </Text>
          </View>
          <NightProgress percent={percent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header — back + H1 over a lavender wash, then the story info card. */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + spacing.xs }]}>
        <LinearGradient
          colors={['rgba(176,156,224,0.12)', 'rgba(176,156,224,0)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <ChevronLeftIcon />
          </Pressable>
          <Text style={styles.heading}>{t('narrate.heading')}</Text>
        </View>
        {story != null ? (
          <View style={styles.storyCard}>
            <LinearGradient
              colors={[colors.lavenderLight, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.storyThumb}
            >
              <Text style={styles.storyThumbEmoji}>{storyThemeEmoji(story.themes)}</Text>
            </LinearGradient>
            <View style={styles.storyCardText}>
              <Text style={styles.storyTitle} numberOfLines={1}>
                {story.title}
              </Text>
              <Text style={styles.storyMeta} numberOfLines={1}>
                {t('narrate.storyMeta', {
                  minutes: DURATION_TARGETS[story.durationTarget].minutes,
                  name: story.childName ?? story.heroName,
                })}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      ) : isError ? (
        <ErrorState
          emoji="🌧️"
          title={t('errors.GENERIC')}
          ctaLabel={t('common.retry')}
          onCta={() => {
            void narrationsQuery.refetch();
            void systemVoicesQuery.refetch();
            void voicesQuery.refetch();
          }}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Existing narrations */}
          {narrations.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {t('narrate.current').toLocaleUpperCase('tr')}
              </Text>
              <View style={styles.narrationList}>
                {narrations.map((narration) => (
                  <NarrationRow
                    key={narration.id}
                    narration={narration}
                    onOpen={() => openPlayer(narration.id)}
                    onRetry={() => retryNarration(narration)}
                    retryDisabled={busy}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* Family voices */}
          <Text style={styles.sectionLabel}>
            {t('voice.familyVoices').toLocaleUpperCase('tr')}
          </Text>
          <View style={styles.voiceList}>
            {parentVoices.map((voice) => {
              const existing = readyByVoiceProfile.get(voice.id) ?? null;
              return (
                <ParentVoiceRow
                  key={voice.id}
                  voice={voice}
                  selected={selected?.type === 'parent' && selected.id === voice.id}
                  existing={existing}
                  onSelect={() => {
                    if (existing != null) {
                      openPlayer(existing.id);
                      return;
                    }
                    setSelected({ type: 'parent', id: voice.id });
                  }}
                  onRetryVoice={() => retryVoice(voice)}
                  preview={preview}
                />
              );
            })}

            {/* Dashed "Sesimi Oluştur" CTA — premium gated via the shared sheet. */}
            <Pressable
              onPress={onCreateVoice}
              accessibilityRole="button"
              accessibilityLabel={t('voice.emptyCta')}
              style={({ pressed }) => [styles.addVoiceCard, { opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={styles.mutedAvatar}>
                <Text style={styles.mutedAvatarEmoji}>🎙</Text>
              </View>
              <View style={styles.voiceTextBlock}>
                <Text style={styles.addVoiceTitle}>{t('voice.emptyCta')}</Text>
                <Text style={styles.voiceSub}>{t('narrate.createVoiceSub')}</Text>
              </View>
              <ChevronRightIcon color={colors.primary} />
            </Pressable>
          </View>

          {/* Storytellers */}
          <Text style={styles.sectionLabel}>
            {t('narrate.systemSection').toLocaleUpperCase('tr')}
          </Text>
          <View style={styles.voiceList}>
            {systemVoices.map((voice) => {
              const existing = readyBySystemVoice.get(voice.id) ?? null;
              const gated = voice.premiumOnly && !canUsePremiumVoices;
              return (
                <SystemVoiceRow
                  key={voice.id}
                  voice={voice}
                  selected={selected?.type === 'system' && selected.id === voice.id}
                  existing={existing}
                  onPress={() => {
                    if (existing != null) {
                      openPlayer(existing.id);
                      return;
                    }
                    if (gated) {
                      setPremiumGate('premiumVoice');
                      return;
                    }
                    setSelected({ type: 'system', id: voice.id });
                  }}
                  preview={preview}
                />
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Fixed bottom CTA over a cream scrim. */}
      {!isLoading && !isError ? (
        <View style={styles.footer} pointerEvents="box-none">
          <LinearGradient
            colors={['rgba(250,248,244,0)', colors.background]}
            locations={[0, 0.45]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View
            style={[styles.footerContent, { paddingBottom: Math.max(insets.bottom, 24) + 8 }]}
            pointerEvents="box-none"
          >
            {createError != null ? <Text style={styles.submitError}>{createError}</Text> : null}
            {selectedName != null ? (
              <Button
                label={t('narrate.createWithVoice', { name: selectedName })}
                onPress={onCreate}
                loading={submitting}
              />
            ) : (
              <View style={styles.ctaDisabled}>
                <Text style={styles.ctaDisabledText}>{t('narrate.selectVoice')}</Text>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {/* Shared premium gate sheet (voice clone / premium storyteller). */}
      <PremiumSheet
        visible={premiumGate != null}
        featureName={
          premiumGate === 'voiceClone'
            ? t('narrate.parentVoiceFeature')
            : t('subscription.features.premiumVoices')
        }
        description={
          premiumGate === 'voiceClone' ? t('narrate.parentVoiceFeatureDesc') : undefined
        }
        onUpgrade={() => {
          setPremiumGate(null);
          router.push('/subscription/paywall' as never);
        }}
        onDismiss={() => setPremiumGate(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.pageX,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.md },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    flex: 1,
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.foreground,
    letterSpacing: -0.2,
  },
  storyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  storyThumb: {
    width: 40,
    height: 50,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyThumbEmoji: { fontSize: 20 },
  storyCardText: { flex: 1, minWidth: 0, gap: 2 },
  storyTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  storyMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.pageX,
    paddingTop: spacing.lg,
    paddingBottom: 200,
  },
  section: { marginBottom: spacing.xl },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: 0.72,
    marginBottom: 10,
  },
  narrationList: { gap: spacing.xs },
  narrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  narrationRowFailed: {
    backgroundColor: 'rgba(224,84,84,0.06)',
    borderColor: 'rgba(224,84,84,0.3)',
  },
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.round,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  narrationBody: { flex: 1, minWidth: 0, gap: 4 },
  narrationName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  narrationMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  rowTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  rowFill: { height: '100%', borderRadius: 2, backgroundColor: colors.primary },
  failedEmoji: { fontSize: 18 },
  failedText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.destructive,
  },
  retryButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  voiceList: { gap: 10, marginBottom: spacing.xl },
  voiceRow: { paddingVertical: 14, paddingHorizontal: spacing.md, gap: 12 },
  voiceRowStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  mutedAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedAvatarEmoji: { fontSize: 22 },
  voiceTextBlock: { flex: 1, minWidth: 0, gap: 2 },
  voiceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceName: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.lg,
    color: colors.foreground,
    flexShrink: 1,
  },
  voiceSub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  retryLinkWrap: { alignSelf: 'flex-start', marginTop: 4 },
  retryLink: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pulsingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.dustyBlue },
  pill: { borderRadius: radius.xs, paddingVertical: 2, paddingHorizontal: 8 },
  pillText: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xxs },
  existingCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addVoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  addVoiceTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.primary,
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footerContent: { paddingHorizontal: spacing.pageX, paddingTop: spacing.xl, gap: spacing.xs },
  submitError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    textAlign: 'center',
  },
  ctaDisabled: {
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabledText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.mutedForeground,
  },
  // ——— Night takeover (generating / done) ———
  nightRoot: { flex: 1, backgroundColor: colors.purpleDarkest },
  nightContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.pageXWide,
  },
  spinnerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(176,156,224,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(176,156,224,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nightTextBlock: { alignItems: 'center', gap: spacing.xs },
  generatingTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    color: colors.primaryForeground,
    textAlign: 'center',
  },
  nightSub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: 'rgba(176,156,224,0.75)',
    textAlign: 'center',
    lineHeight: 21,
  },
  nightTrack: {
    alignSelf: 'stretch',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  nightFill: { height: '100%', borderRadius: 2, overflow: 'hidden' },
  doneCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(141,184,154,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(141,184,154,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneEmoji: { fontSize: 40 },
  doneTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h1,
    color: colors.primaryForeground,
    textAlign: 'center',
  },
  nightCta: { alignSelf: 'stretch' },
  nightSecondary: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: 'rgba(255,255,255,0.55)',
  },
  confettiDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
});

const pillTones = StyleSheet.create({
  ready: { backgroundColor: 'rgba(141,184,154,0.15)' },
  processing: { backgroundColor: 'rgba(123,167,201,0.15)' },
  error: { backgroundColor: 'rgba(224,84,84,0.1)' },
});

const pillTextTones = StyleSheet.create({
  ready: { color: colors.sage },
  processing: { color: colors.dustyBlue },
  error: { color: colors.destructive },
});
