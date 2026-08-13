import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  AIJobStatus,
  NarrationStatus,
  VoiceProfileStatus,
  type SystemVoiceCategory,
  type VoiceOwnerType,
} from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
import type { CreateNarrationInput, Narration } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, gradients, radius, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { useJobProgress } from '../../../src/lib/job-stream';
import { Avatar } from '../../../src/components/Avatar';
import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { SelectableCard } from '../../../src/components/SelectableCard';
import { CheckIcon, PlayIcon } from '../../../src/components/icons';
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

/** "6 dk" from a narration's duration in seconds (null while not READY). */
function durationMinutes(durationSeconds: number | null): number | null {
  if (durationSeconds == null) return null;
  return Math.max(1, Math.round(durationSeconds / 60));
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

/**
 * "Hikâyeyi Seslendir" — re-voice an existing story: shows current narrations,
 * a parent + system voice picker (wizard step 5 design language, cream), and a
 * create CTA with real job progress. Completed narrations open in the player.
 */
export default function NarrateStory() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [selected, setSelected] = useState<VoiceSelection | null>(null);
  const [premiumHintId, setPremiumHintId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<{ jobId: string; narrationId: string } | null>(null);
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

  const narrations = narrationsQuery.data ?? [];
  const parentVoices = (voicesQuery.data ?? []).filter(
    (voice) => voice.status === VoiceProfileStatus.READY,
  );
  const systemVoices = systemVoicesQuery.data ?? [];
  const canUsePremiumVoices = entitlementsQuery.data?.features.premium_system_voices === true;

  const job = useJobProgress(activeJob?.jobId);

  // Resolve the CTA-created job: done beat → player; failure → inline error.
  useEffect(() => {
    if (activeJob == null) return;
    if (job.status === AIJobStatus.SUCCEEDED) {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ['narrations', id] });
      void queryClient.invalidateQueries({ queryKey: ['story', id] });
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
      const timer = setTimeout(() => {
        router.replace(`/story/${id}/player?narrationId=${activeJob.narrationId}` as never);
      }, 900);
      return () => clearTimeout(timer);
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
  }, [activeJob, job.status, job.errorCode, id, queryClient, t]);

  const openPlayer = (narrationId: string) => {
    router.push(`/story/${id}/player?narrationId=${narrationId}` as never);
  };

  const create = async (input: CreateNarrationInput) => {
    if (submitting || activeJob != null) return;
    setCreateError(null);
    setSubmitting(true);
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
      setActiveJob({ jobId, narrationId: narration.id });
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

  const isLoading = narrationsQuery.isPending || systemVoicesQuery.isPending;
  const isError = narrationsQuery.isError || systemVoicesQuery.isError;
  const busy = submitting || activeJob != null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <ScreenHeader title={t('narrate.title')} />
        <Text style={styles.subtitle}>{t('narrate.subtitle')}</Text>
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

          {/* Voice picker — parent voices first, system voices below. */}
          <View style={styles.cardList}>
            {!voicesQuery.isPending && parentVoices.length === 0 ? (
              <Pressable
                onPress={() => router.push('/voice' as never)}
                accessibilityRole="button"
                accessibilityLabel={t('voice.emptyCta')}
                style={({ pressed }) => [styles.emptyVoiceCard, { opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={styles.emptyVoiceCircle}>
                  <Text style={styles.emptyVoiceEmoji}>🎙️</Text>
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={styles.emptyVoiceTitle}>{t('voice.emptyTitle')}</Text>
                  <Text style={styles.emptyVoiceCta}>{t('voice.emptyCta')}</Text>
                </View>
              </Pressable>
            ) : null}

            {parentVoices.map((voice) => {
              const existing = readyByVoiceProfile.get(voice.id) ?? null;
              return (
                <SelectableCard
                  key={voice.id}
                  glow
                  selected={selected?.type === 'parent' && selected.id === voice.id}
                  showCheck={existing == null}
                  onPress={() => {
                    if (existing != null) {
                      openPlayer(existing.id);
                      return;
                    }
                    setPremiumHintId(null);
                    setSelected({ type: 'parent', id: voice.id });
                  }}
                  accessibilityLabel={voice.displayName}
                >
                  <Avatar emoji={OWNER_EMOJIS[voice.ownerType]} size={44} kind="parentVoice" />
                  <View style={styles.cardTextBlock}>
                    <View style={styles.voiceNameRow}>
                      <Text style={styles.voiceName}>{voice.displayName}</Text>
                      <Badge label={t('wizard.personalBadge')} variant="personal" />
                    </View>
                  </View>
                  {existing != null ? (
                    <View style={styles.existingCheck}>
                      <CheckIcon size={10} />
                    </View>
                  ) : null}
                </SelectableCard>
              );
            })}

            {systemVoices.map((voice) => {
              const existing = readyBySystemVoice.get(voice.id) ?? null;
              const gated = voice.premiumOnly && !canUsePremiumVoices;
              return (
                <View key={voice.id}>
                  <SelectableCard
                    glow
                    selected={selected?.type === 'system' && selected.id === voice.id}
                    showCheck={existing == null}
                    onPress={() => {
                      if (existing != null) {
                        openPlayer(existing.id);
                        return;
                      }
                      if (gated) {
                        setPremiumHintId(voice.id);
                        return;
                      }
                      setPremiumHintId(null);
                      setSelected({ type: 'system', id: voice.id });
                    }}
                    accessibilityLabel={voice.displayName}
                  >
                    <Avatar
                      emoji={VOICE_CATEGORY_EMOJIS[voice.category]}
                      size={44}
                      kind="systemVoice"
                    />
                    <View style={styles.cardTextBlock}>
                      <View style={styles.voiceNameRow}>
                        <Text style={styles.voiceName}>{voice.displayName}</Text>
                        {voice.premiumOnly ? (
                          <Badge label={t('wizard.premiumBadge')} variant="premium" uppercase />
                        ) : null}
                      </View>
                      <Text style={styles.voiceDescription}>{voice.description}</Text>
                    </View>
                    {existing != null ? (
                      <View style={styles.existingCheck}>
                        <CheckIcon size={10} />
                      </View>
                    ) : null}
                  </SelectableCard>
                  {gated && premiumHintId === voice.id ? (
                    <Animated.Text entering={FadeInUp.duration(250)} style={styles.premiumHint}>
                      {t('errors.ENTITLEMENT_REQUIRED')}
                    </Animated.Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Fixed bottom CTA over a cream scrim (wizard pattern). */}
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
            {activeJob != null ? (
              done ? (
                <Animated.Text entering={FadeInUp.duration(250)} style={styles.doneText}>
                  {t('narrate.done')}
                </Animated.Text>
              ) : (
                <View style={styles.creatingBlock}>
                  <Text style={styles.creatingText}>{t('narrate.creating')}</Text>
                  <View style={styles.footerTrack}>
                    <LinearGradient
                      colors={gradients.progress as unknown as [string, string]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={[
                        styles.footerFill,
                        { width: `${Math.round(Math.min(Math.max(job.progress, 0), 100))}%` },
                      ]}
                    />
                  </View>
                </View>
              )
            ) : (
              <Button
                label={t('narrate.create')}
                onPress={onCreate}
                disabled={selected == null}
                loading={submitting}
              />
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.pageX },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    marginTop: -8,
    marginBottom: spacing.sm,
  },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.pageX, paddingBottom: 200 },
  section: { marginBottom: spacing.xl },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: 0.72,
    marginBottom: spacing.sm,
  },
  narrationList: { gap: spacing.xs },
  narrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.base,
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
  cardList: { gap: 10 },
  cardTextBlock: { flex: 1, gap: 2 },
  voiceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  voiceDescription: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  existingCheck: {
    marginLeft: 'auto',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumHint: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
    marginTop: 6,
    marginLeft: 4,
  },
  emptyVoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  emptyVoiceCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyVoiceEmoji: { fontSize: 20 },
  emptyVoiceTitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  emptyVoiceCta: {
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
  creatingBlock: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  creatingText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    textAlign: 'center',
  },
  footerTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  footerFill: { height: '100%', borderRadius: 2 },
  doneText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.primary,
    textAlign: 'center',
    paddingVertical: 18,
  },
});
