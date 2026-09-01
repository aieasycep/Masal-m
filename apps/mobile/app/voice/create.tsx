import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { File, UploadType } from 'expo-file-system';
import { AIJobStatus, VOICE_RECORDING, VoiceOwnerType } from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  letterSpacing,
  radius,
  shadows,
  spacing,
} from '@masalim/ui';
import { api } from '../../src/lib/api';
import { useJobProgress } from '../../src/lib/job-stream';
import { usePreviewPlayer } from '../../src/lib/preview-player';
import { useVoiceRecorder, VOICE_RECORDING_CONTENT_TYPE } from '../../src/lib/recorder';
import { AudioPreviewButton } from '../../src/components/AudioPreviewButton';
import { Avatar } from '../../src/components/Avatar';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { KeepScreenAwake } from '../../src/components/KeepScreenAwake';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SelectableCard } from '../../src/components/SelectableCard';
import { Starfield } from '../../src/components/Starfield';
import { Input } from '../../src/components/Input';
import { CheckIcon, MicIcon, PauseIcon, PlayIcon } from '../../src/components/icons';

type CreateStep =
  | 'intro'
  | 'owner'
  | 'consent'
  | 'micTest'
  | 'recording'
  | 'review'
  | 'processing'
  | 'success'
  | 'error';

const NIGHT_STEPS: ReadonlySet<CreateStep> = new Set([
  'micTest',
  'recording',
  'review',
  'processing',
  'success',
  'error',
]);

const OWNER_TYPES: VoiceOwnerType[] = [
  VoiceOwnerType.MOTHER,
  VoiceOwnerType.FATHER,
  VoiceOwnerType.GRANDMOTHER,
  VoiceOwnerType.GRANDFATHER,
  VoiceOwnerType.OTHER,
];

const OWNER_EMOJIS: Record<VoiceOwnerType, string> = {
  [VoiceOwnerType.MOTHER]: '👩',
  [VoiceOwnerType.FATHER]: '👨',
  [VoiceOwnerType.GRANDMOTHER]: '👵',
  [VoiceOwnerType.GRANDFATHER]: '👴',
  [VoiceOwnerType.OTHER]: '🎙',
};

const WAVEFORM_BARS = 32;
const MIC_TEST_SAMPLE_MS = 3_200;
/** avg dBFS below → quiet room; above the noisy line → background noise. */
const MIC_TEST_QUIET_DB = -45;
const MIC_TEST_NOISY_DB = -35;
/** ~5s of consecutive near-silence while recording → "devam ediyor musun?" hint. */
const SILENCE_DB = -50;
const SILENCE_SAMPLES = 10;
/** Sentinel for a non-2xx signed PUT so the catch can map it to voice.uploadFailed. */
const UPLOAD_FAILED = 'VOICE_UPLOAD_FAILED';
/** Preview-player key for the not-yet-uploaded local take (review step). */
const LOCAL_TAKE_KEY = 'voice-local-take';

function parseOwnerType(value: string | undefined): VoiceOwnerType | null {
  return value != null && (Object.values(VoiceOwnerType) as string[]).includes(value)
    ? (value as VoiceOwnerType)
    : null;
}

function formatTimer(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** dBFS (−60…0) → bar height (6…48px). */
function barHeight(db: number): number {
  const clamped = Math.min(0, Math.max(-60, db));
  return 6 + ((clamped + 60) / 60) * 42;
}

/** 32-bar waveform: live dBFS history while recording, static dim pattern when idle. */
function Waveform({ bars, active }: { bars: number[]; active: boolean }) {
  return (
    <View style={styles.waveformRow}>
      {Array.from({ length: WAVEFORM_BARS }, (_, index) => {
        const sample = bars[bars.length - WAVEFORM_BARS + index];
        const height = active
          ? barHeight(sample ?? -60)
          : 8 + Math.sin(index * 0.6) * 8;
        return (
          <View
            key={index}
            style={[
              styles.waveformBar,
              {
                height: Math.max(4, height),
                backgroundColor: active ? colors.purpleSoft : 'rgba(255,255,255,0.15)',
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** Pulsing coral "Kaydediliyor" dot. */
function RecordingDot() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.3, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.recordingDot, style]} />;
}

/** Slow-spinning lavender ring (design ref: processing view). */
function ProcessingSpinner() {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 3000, easing: Easing.linear }), -1, false);
  }, [spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return (
    <Animated.View style={[styles.spinnerCircle, style]}>
      <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
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

/** Gentle scale pulse around the mic while sampling the room. */
function MicPulse({ active }: { active: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = active
      ? withRepeat(withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
      : withTiming(1, { duration: 200 });
  }, [active, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.micTestCircle, style]}>
      <MicIcon size={40} color={colors.lavender} />
    </Animated.View>
  );
}

/** Floating confetti dots (design ref: success view). */
function Confetti() {
  return (
    <>
      {[colors.gold, colors.coral, colors.sage, colors.lavender, colors.peach].map(
        (color, index) => (
          <ConfettiDot key={color} color={color} index={index} />
        ),
      )}
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
        { backgroundColor: color, top: `${20 + index * 12}%`, left: `${15 + index * 16}%` },
        style,
      ]}
    />
  );
}

/**
 * Voice creation flow (Ses Stüdyom): intro → owner → consent (§21, blocking) →
 * mic test → recording → review (upload happens ONLY here, §20) → processing →
 * success/error. Re-record entries pass `recreateId` and skip the owner step.
 */
export default function VoiceCreate() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    recreateId?: string;
    ownerType?: string;
    displayName?: string;
  }>();
  const isRecreate = params.recreateId != null && params.recreateId.length > 0;

  const [step, setStep] = useState<CreateStep>('intro');
  const [ownerType, setOwnerType] = useState<VoiceOwnerType | null>(
    parseOwnerType(params.ownerType),
  );
  const [displayName, setDisplayName] = useState(params.displayName ?? '');
  const [nameEdited, setNameEdited] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  // Mic test
  const [micPhase, setMicPhase] = useState<'testing' | 'done'>('testing');
  const [micDenied, setMicDenied] = useState(false);
  const [micResult, setMicResult] = useState<'quiet' | 'ok' | 'noisy' | null>(null);
  const [micNonce, setMicNonce] = useState(0);
  const micSamples = useRef<number[]>([]);

  // Recording
  const rec = useVoiceRecorder();
  const [bars, setBars] = useState<number[]>([]);
  const [showSilenceHint, setShowSilenceHint] = useState(false);
  const silentCount = useRef(0);
  const finishing = useRef(false);
  // The finished take. KEPT on disk across failed uploads ("Kaydın güvende").
  const [kept, setKept] = useState<{ uri: string; durationSeconds: number } | null>(null);

  // Submission / processing
  const [submitting, setSubmitting] = useState(false);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(params.recreateId ?? null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const job = useJobProgress(jobId ?? undefined);
  const preview = usePreviewPlayer();

  const entitlementsQuery = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.subscription.entitlements(),
  });
  const entitled = entitlementsQuery.data?.features.parent_voice_clone;

  const isNight = NIGHT_STEPS.has(step);
  const isActiveRecording = rec.state === 'recording' || rec.state === 'paused';
  const canFinish = rec.durationSeconds >= VOICE_RECORDING.MIN_DURATION_SECONDS;

  const exit = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/voice' as never);
    }
  }, []);

  // Live waveform history (last 32 metering samples).
  useEffect(() => {
    const db = rec.meteringDb;
    if (rec.state !== 'recording' || db == null) return;
    setBars((prev) => [...prev.slice(-(WAVEFORM_BARS - 1)), db]);
  }, [rec.meteringDb, rec.state]);

  // Silence nudge ("Devam ediyor musun?") after ~5s without audible input.
  useEffect(() => {
    if (step !== 'recording' || rec.state !== 'recording') {
      silentCount.current = 0;
      setShowSilenceHint(false);
      return;
    }
    const db = rec.meteringDb;
    if (db == null) return;
    if (db < SILENCE_DB) {
      silentCount.current += 1;
      if (silentCount.current >= SILENCE_SAMPLES) setShowSilenceHint(true);
    } else {
      silentCount.current = 0;
      setShowSilenceHint(false);
    }
  }, [rec.meteringDb, rec.state, step]);

  // Mic-test sample collection while the probe recording runs.
  useEffect(() => {
    const db = rec.meteringDb;
    if (step === 'micTest' && rec.state === 'recording' && db != null) {
      micSamples.current.push(db);
    }
  }, [rec.meteringDb, rec.state, step]);

  // Mic test: permission → ~3s metering probe → verdict. Probe file is discarded.
  const { requestPermission, start, stop, reset } = rec;
  useEffect(() => {
    if (step !== 'micTest') return;
    let cancelled = false;
    micSamples.current = [];
    setMicPhase('testing');
    setMicDenied(false);
    setMicResult(null);
    const run = async () => {
      const granted = await requestPermission();
      if (cancelled) return;
      if (!granted) {
        setMicDenied(true);
        setMicPhase('done');
        return;
      }
      try {
        await start();
        await new Promise((resolve) => setTimeout(resolve, MIC_TEST_SAMPLE_MS));
        await stop();
      } catch {
        // Probe failed (e.g. simulator without input) — fall through to neutral-ok.
      }
      reset();
      if (cancelled) return;
      const samples = micSamples.current;
      const avg =
        samples.length === 0
          ? null
          : samples.reduce((sum, value) => sum + value, 0) / samples.length;
      setMicResult(
        avg == null ? 'ok' : avg < MIC_TEST_QUIET_DB ? 'quiet' : avg > MIC_TEST_NOISY_DB ? 'noisy' : 'ok',
      );
      setMicPhase('done');
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [step, micNonce, requestPermission, start, stop, reset]);

  const finishRecording = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const result = await rec.stop();
      if (result == null || result.durationSeconds < VOICE_RECORDING.MIN_DURATION_SECONDS) {
        rec.reset();
        setBars([]);
        return;
      }
      setKept({
        uri: result.uri,
        durationSeconds: Math.min(
          Math.round(result.durationSeconds),
          VOICE_RECORDING.MAX_DURATION_SECONDS,
        ),
      });
      setStep('review');
    } finally {
      finishing.current = false;
    }
  }, [rec]);

  // Hard ceiling: auto-stop at MAX_DURATION_SECONDS.
  useEffect(() => {
    if (
      step === 'recording' &&
      isActiveRecording &&
      rec.durationSeconds >= VOICE_RECORDING.MAX_DURATION_SECONDS
    ) {
      void finishRecording();
    }
  }, [step, isActiveRecording, rec.durationSeconds, finishRecording]);

  const restartRecording = useCallback(async () => {
    if (isActiveRecording) await rec.stop();
    rec.reset();
    setBars([]);
  }, [rec, isActiveRecording]);

  const mapError = useCallback(
    (error: unknown): string => {
      if (error instanceof Error && error.message === UPLOAD_FAILED) {
        return t('voice.uploadFailed');
      }
      if (error instanceof ApiError) {
        return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
      }
      if (error instanceof NetworkError) return t('errors.OFFLINE');
      return t('errors.GENERIC');
    },
    [t],
  );

  /**
   * Upload + create/recreate — invoked ONLY from the review step (§20) and the
   * error step's retry (same kept local file, never re-recorded). The consent
   * checkbox (§21) is a hard precondition of any api.voices.* creation call.
   */
  const submit = useCallback(async () => {
    if (kept == null || submitting) return;
    if (!consentChecked) {
      setStep('consent');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const file = new File(kept.uri);
      if (!file.exists || file.size <= 0) throw new Error(UPLOAD_FAILED);
      const signed = await api.uploads.voiceRecording({
        contentType: VOICE_RECORDING_CONTENT_TYPE,
        contentLength: file.size,
      });
      const uploaded = await file.upload(signed.uploadUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        headers: signed.headers,
      });
      if (uploaded.status < 200 || uploaded.status >= 300) throw new Error(UPLOAD_FAILED);

      const recordingPayload = {
        recordingObjectKey: signed.objectKey,
        recordingDurationSeconds: kept.durationSeconds,
        consentAccepted: true as const,
      };
      let voice;
      if (activeVoiceId != null) {
        voice = await api.voices.recreate(activeVoiceId, recordingPayload);
      } else {
        if (ownerType == null) {
          setStep('owner');
          return;
        }
        const name =
          displayName.trim().length > 0
            ? displayName.trim()
            : t(`voice.defaultVoiceNames.${ownerType}`);
        voice = await api.voices.create({
          ownerType,
          displayName: name,
          ...recordingPayload,
        });
      }
      setActiveVoiceId(voice.id);
      if (voice.jobId != null && voice.jobId.length > 0) {
        setJobId(voice.jobId);
        setStep('processing');
      } else {
        // Synchronous (mock) path — no job to watch.
        await queryClient.invalidateQueries({ queryKey: ['voices'] });
        setStep('success');
      }
    } catch (error) {
      // Local file stays on disk — "Kaydın güvende", retry re-uploads it as-is.
      setErrorMessage(mapError(error));
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  }, [kept, submitting, consentChecked, activeVoiceId, ownerType, displayName, t, queryClient, mapError]);

  // Processing verdict from the real job stream.
  useEffect(() => {
    if (step !== 'processing') return;
    if (job.status === AIJobStatus.SUCCEEDED) {
      void queryClient.invalidateQueries({ queryKey: ['voices'] });
      setStep('success');
    } else if (job.status === AIJobStatus.FAILED || job.status === AIJobStatus.CANCELLED) {
      setErrorMessage(
        job.errorCode != null
          ? t(`errors.${job.errorCode}`, { defaultValue: t('errors.GENERIC') })
          : t('errors.GENERIC'),
      );
      setStep('error');
    }
  }, [step, job.status, job.errorCode, queryClient, t]);

  const goBack = useCallback(() => {
    switch (step) {
      case 'intro':
        exit();
        break;
      case 'owner':
        setStep('intro');
        break;
      case 'consent':
        setStep(isRecreate ? 'intro' : 'owner');
        break;
      case 'micTest':
        setStep('consent');
        break;
      case 'recording':
        void restartRecording();
        setStep('micTest');
        break;
      case 'review':
        rec.reset();
        setBars([]);
        setStep('recording');
        break;
      default:
        exit();
    }
  }, [step, isRecreate, exit, rec, restartRecording]);

  const pickOwner = (type: VoiceOwnerType) => {
    setOwnerType(type);
    if (!nameEdited) {
      setDisplayName(t(`voice.defaultVoiceNames.${type}`));
    }
  };

  const voiceLabel =
    displayName.trim().length > 0
      ? displayName.trim()
      : ownerType != null
        ? t(`voice.defaultVoiceNames.${ownerType}`)
        : t('voice.studioTitle');

  // ── Premium gate (deep-link safety): entitlement check also lives here. ──
  // §36: the user learns this is premium BEFORE recording and can upgrade.
  if (entitled === false) {
    return (
      <View style={[styles.creamRoot, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <View style={styles.pageX}>
          <ScreenHeader title={t('voice.introTitle')} onBack={exit} />
          <View style={styles.premiumGateCard}>
            <Badge label={t('subscription.premiumPlan')} variant="premium" />
            <Text style={styles.premiumGateText}>{t('voice.introPremiumNote')}</Text>
          </View>
          <View style={styles.premiumGateButtons}>
            <Button
              label={t('subscription.subscribe')}
              onPress={() => router.push('/subscription/paywall' as never)}
            />
            <Button label={t('common.back')} onPress={exit} variant="secondary" compact />
          </View>
        </View>
      </View>
    );
  }

  // ─────────────────────────── step contents ───────────────────────────

  const renderIntro = () => (
    <View style={styles.centerBlock}>
      <LinearGradient
        colors={gradients.parentVoiceAvatar as unknown as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.introEmojiCircle}
      >
        <Text style={styles.introEmoji}>🎙</Text>
      </LinearGradient>
      <Text style={styles.introTitle}>{t('voice.introTitle')}</Text>
      <Text style={styles.introBody}>{t('voice.introBody')}</Text>
      <View style={styles.metaCard}>
        <View style={styles.metaRow}>
          <Text style={styles.metaEmoji}>⏱</Text>
          <Text style={styles.metaText}>{t('voice.introDuration')}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaEmoji}>💡</Text>
          <Text style={styles.metaText}>{t('voice.introTip')}</Text>
        </View>
      </View>
    </View>
  );

  const renderOwner = () => (
    <>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('voice.ownerTitle')}
      </Text>
      <View style={styles.ownerList}>
        {OWNER_TYPES.map((type) => (
          <SelectableCard
            key={type}
            glow
            selected={ownerType === type}
            onPress={() => pickOwner(type)}
            accessibilityLabel={t(`voice.owners.${type}`)}
          >
            <Avatar emoji={OWNER_EMOJIS[type]} size={44} kind="parentVoice" />
            <Text style={styles.ownerLabel}>{t(`voice.owners.${type}`)}</Text>
          </SelectableCard>
        ))}
      </View>
      <Input
        label={t('voice.voiceNameLabel')}
        value={displayName}
        onChangeText={(value) => {
          setDisplayName(value);
          setNameEdited(true);
        }}
        maxLength={60}
      />
    </>
  );

  const renderConsent = () => (
    <>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('voice.consentTitle')}
      </Text>
      <Text style={styles.consentSubtitle}>{t('voice.consentSubtitle')}</Text>
      <View style={styles.consentCard}>
        <Text style={styles.consentCardTitle}>{t('voice.consentCardTitle')}</Text>
        <Text style={styles.consentBody}>{t('voice.consentBody')}</Text>
      </View>
      <Pressable
        onPress={() => setConsentChecked((checked) => !checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consentChecked }}
        style={[styles.consentCheckRow, consentChecked && styles.consentCheckRowOn]}
      >
        <View style={[styles.checkbox, consentChecked && styles.checkboxOn]}>
          {consentChecked ? <CheckIcon size={14} /> : null}
        </View>
        <Text style={styles.consentCheckText}>{t('voice.consentCheckbox')}</Text>
      </Pressable>
      <View style={styles.consentNoteRow}>
        <Text style={styles.metaEmoji}>🛡️</Text>
        <Text style={styles.consentNoteText}>{t('voice.consentDeleteNote')}</Text>
      </View>
      <View style={styles.consentNoteRow}>
        <Text style={styles.metaEmoji}>ℹ️</Text>
        <Text style={styles.consentNoteText}>{t('voice.consentNoChildVoices')}</Text>
      </View>
    </>
  );

  // Live level meter: −60…0 dBFS mapped onto the track; frozen full on verdict.
  const meterPct =
    micPhase === 'done'
      ? micResult === 'ok' || micResult === 'quiet'
        ? 0.7
        : 0.95
      : Math.min(1, Math.max(0, ((rec.meteringDb ?? -60) + 60) / 60));

  const renderMicTest = () => (
    <View style={styles.nightCenter}>
      <MicPulse active={micPhase === 'testing'} />
      {micDenied ? (
        <Text style={styles.nightBody}>{t('voice.micTestDenied')}</Text>
      ) : (
        <>
          <Text style={styles.nightTitle}>
            {micPhase === 'testing'
              ? t('voice.micTestTitle')
              : micResult === 'noisy'
                ? t('voice.micTestNoisy')
                : t('voice.micTestGood')}
          </Text>
          <View style={styles.meterRow}>
            <Text style={styles.meterLabel}>{t('voice.micLevelLabel')}</Text>
            <View style={styles.meterTrack}>
              <View style={[styles.meterFill, { width: `${Math.round(meterPct * 100)}%` }]} />
            </View>
            {micPhase === 'done' && micResult !== 'noisy' ? (
              <Text style={styles.meterOk}>{t('voice.micLevelOk')}</Text>
            ) : null}
          </View>
          {micPhase === 'done' ? (
            <Text style={styles.nightBody}>
              {micResult === 'noisy' ? t('voice.introTip') : t('voice.micTestHold')}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );

  const renderRecording = () => (
    <View style={styles.recordingWrap}>
      <View style={styles.scriptCard}>
        <Text style={styles.scriptLabel}>
          {t('voice.recordingScriptLabel').toLocaleUpperCase('tr')}
        </Text>
        <Text style={styles.scriptText}>{t('voice.recordingScript')}</Text>
      </View>

      <Waveform bars={bars} active={rec.state === 'recording'} />

      <View style={styles.timerBlock}>
        <Text style={styles.timerText}>{formatTimer(rec.durationSeconds)}</Text>
        {rec.state === 'recording' ? (
          <View style={styles.recordingStatusRow}>
            <RecordingDot />
            <Text style={styles.recordingStatusText}>{t('voice.recording')}</Text>
          </View>
        ) : rec.state === 'paused' ? (
          <Text style={styles.recordingStatusText}>{t('voice.paused')}</Text>
        ) : null}
        {showSilenceHint ? <Text style={styles.silenceHint}>{t('voice.silenceHint')}</Text> : null}
      </View>

      {isActiveRecording ? (
        <Text style={[styles.coachingLine, canFinish ? styles.coachingOk : styles.coachingWarn]}>
          {canFinish
            ? t('voice.lengthOk')
            : t('voice.minCoaching', { seconds: VOICE_RECORDING.MIN_DURATION_SECONDS })}
        </Text>
      ) : null}

      {!isActiveRecording ? (
        <View style={styles.recordingControls}>
          <Pressable
            onPress={() => {
              setBars([]);
              void rec.start();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('voice.startRecording')}
            style={({ pressed }) => [
              styles.recordButton,
              shadows.recordButton,
              { transform: [{ scale: pressed ? 0.96 : 1 }] },
            ]}
          >
            <MicIcon size={32} />
          </Pressable>
          <Text style={styles.startLabel}>{t('voice.startRecording')}</Text>
        </View>
      ) : (
        <View style={styles.recordingControls}>
          {rec.state === 'paused' ? (
            <Pressable
              onPress={() => rec.resume()}
              accessibilityRole="button"
              style={styles.resumeButton}
            >
              <PlayIcon size={18} color="#FFFFFF" />
              <Text style={styles.resumeButtonText}>{t('voice.resumeRecording')}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => rec.pause()}
              accessibilityRole="button"
              accessibilityLabel={t('voice.paused')}
              style={styles.pausePill}
            >
              <PauseIcon size={18} color="rgba(255,255,255,0.85)" />
            </Pressable>
          )}
          <View style={styles.recordingButtonsRow}>
            <Pressable
              onPress={() => void finishRecording()}
              disabled={!canFinish}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canFinish }}
              style={[styles.finishButton, !canFinish && styles.finishButtonDisabled]}
            >
              <Text style={styles.finishButtonText}>{t('voice.finishRecording')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void restartRecording()}
              accessibilityRole="button"
              style={styles.restartButton}
            >
              <Text style={styles.restartButtonText}>{t('voice.restartRecording')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  // QA §7: the review step MUST let the user hear the local take before any
  // upload — the shared preview player accepts the on-disk file URI directly.
  const localTakePlaying = preview.statusFor(LOCAL_TAKE_KEY) === 'playing';
  const renderReview = () => (
    <View style={styles.nightCenter}>
      <Text style={styles.nightTitle}>{t('voice.reviewTitle')}</Text>
      <Text style={styles.nightBody}>{t('voice.reviewBody')}</Text>
      <View style={styles.reviewPlayCard}>
        <AudioPreviewButton
          status={kept == null ? 'disabled' : preview.statusFor(LOCAL_TAKE_KEY)}
          onPress={() =>
            kept != null && preview.toggle(LOCAL_TAKE_KEY, () => Promise.resolve(kept.uri))
          }
        />
        <View style={styles.reviewPlayText}>
          <Text style={styles.reviewPlayTitle}>
            {localTakePlaying ? t('voice.reviewPause') : t('voice.reviewListen')}
          </Text>
          <Text style={styles.reviewPlaySub}>
            {t('voice.reviewDuration', { duration: formatTimer(kept?.durationSeconds ?? 0) })}
          </Text>
        </View>
      </View>
      <View style={styles.reviewSafeRow}>
        <Text style={[styles.metaEmoji, styles.reviewSafeCheck]}>✓</Text>
        <Text style={styles.reviewSafeText}>{t('voice.reviewSafeNote')}</Text>
      </View>
    </View>
  );

  const renderProcessing = () => (
    <View style={styles.nightCenter}>
      <ProcessingSpinner />
      <Text style={styles.nightTitle}>{t('voice.processingTitle')}</Text>
      <Text style={styles.nightBody}>{t('voice.processingBody')}</Text>
    </View>
  );

  const renderSuccess = () => (
    <View style={styles.nightCenter}>
      <Confetti />
      <View style={styles.successCircle}>
        <Text style={styles.successEmoji}>🎉</Text>
      </View>
      <Text style={styles.nightTitleLg}>{t('voice.successTitle', { name: voiceLabel })}</Text>
      <Text style={styles.nightBody}>{t('voice.successBody')}</Text>
      {activeVoiceId != null ? (
        <View style={styles.reviewPlayCard}>
          <AudioPreviewButton
            status={preview.statusFor(`voice-${activeVoiceId}`)}
            onPress={() =>
              preview.toggle(`voice-${activeVoiceId}`, () =>
                api.voices.preview(activeVoiceId).then((r) => r.previewUrl),
              )
            }
          />
          <View style={styles.reviewPlayText}>
            <Text style={styles.reviewPlayTitle}>{t('voice.successSampleTitle')}</Text>
            <Text style={styles.reviewPlaySub}>{t('voice.successSampleSub')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderError = () => (
    <View style={styles.nightCenter}>
      <View style={styles.errorCircle}>
        <Text style={styles.successEmoji}>🌧️</Text>
      </View>
      <Text style={styles.nightTitleLg}>{t('voice.errorSafeTitle')}</Text>
      <Text style={styles.nightBody}>{t('voice.errorSafeBody')}</Text>
      {errorMessage ? <Text style={styles.errorDetail}>{errorMessage}</Text> : null}
    </View>
  );

  const stepContent = () => {
    switch (step) {
      case 'intro':
        return renderIntro();
      case 'owner':
        return renderOwner();
      case 'consent':
        return renderConsent();
      case 'micTest':
        return renderMicTest();
      case 'recording':
        return renderRecording();
      case 'review':
        return renderReview();
      case 'processing':
        return renderProcessing();
      case 'success':
        return renderSuccess();
      case 'error':
        return renderError();
    }
  };

  // ─────────────────────────── footers ───────────────────────────

  const footer = () => {
    switch (step) {
      case 'intro':
        return (
          <Button
            label={t('common.continue')}
            onPress={() => setStep(isRecreate ? 'consent' : 'owner')}
          />
        );
      case 'owner':
        return (
          <Button
            label={t('common.continue')}
            onPress={() => setStep('consent')}
            disabled={ownerType == null || displayName.trim().length === 0}
          />
        );
      case 'consent':
        // §21 — consent is blocking: the CTA stays disabled until checked.
        return (
          <Button
            label={t('voice.consentCta')}
            onPress={() => setStep('micTest')}
            disabled={!consentChecked}
          />
        );
      case 'micTest':
        if (micPhase !== 'done') return null;
        if (micDenied) {
          return (
            <>
              <Button
                label={t('voice.micTestOpenSettings')}
                onPress={() => void Linking.openSettings()}
              />
              <Button
                label={t('common.retry')}
                onPress={() => setMicNonce((nonce) => nonce + 1)}
                variant="ghostDark"
                compact
              />
            </>
          );
        }
        return (
          <>
            <Button label={t('voice.micTestCta')} onPress={() => setStep('recording')} />
            <Button
              label={t('common.retry')}
              onPress={() => setMicNonce((nonce) => nonce + 1)}
              variant="ghostDark"
              compact
            />
          </>
        );
      case 'review':
        return (
          <>
            <Button label={t('voice.useRecording')} onPress={() => void submit()} loading={submitting} />
            <Button
              label={t('voice.reRecord')}
              onPress={() => {
                rec.reset();
                setBars([]);
                setStep('recording');
              }}
              variant="ghostDark"
              compact
              disabled={submitting}
            />
          </>
        );
      case 'processing':
        // Leaving is safe: the job continues server-side and push notifies.
        return (
          <Button label={t('voice.processingBack')} onPress={exit} variant="ghostDark" compact />
        );
      case 'success':
        return (
          <>
            <Button
              label={t('voice.useVoice')}
              onPress={() => {
                void queryClient.invalidateQueries({ queryKey: ['voices'] });
                router.replace('/voice' as never);
              }}
            />
            <Button
              label={t('voice.recreateVoice')}
              onPress={() => {
                rec.reset();
                setBars([]);
                setKept(null);
                setJobId(null);
                setStep('recording');
              }}
              variant="ghostDark"
              compact
            />
          </>
        );
      case 'error':
        return (
          <>
            <Button label={t('common.retry')} onPress={() => void submit()} loading={submitting} />
            <Button label={t('common.later')} onPress={exit} variant="ghostDark" compact />
          </>
        );
      default:
        return null;
    }
  };

  const showHeader =
    step === 'intro' ||
    step === 'owner' ||
    step === 'consent' ||
    step === 'micTest' ||
    step === 'recording';

  return (
    <View style={[isNight ? styles.nightRoot : styles.creamRoot]}>
      {step === 'recording' || step === 'processing' ? <KeepScreenAwake /> : null}
      {isNight ? (
        <>
          <LinearGradient
            colors={gradients.nightSky as unknown as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Starfield />
        </>
      ) : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.flex, { paddingTop: Math.max(insets.top, 20) + 8 }]}
      >
        {showHeader ? (
          <View style={styles.pageX}>
            <ScreenHeader
              eyebrow={step === 'recording' ? t('voice.recordingEyebrow') : undefined}
              title={step === 'recording' ? voiceLabel : undefined}
              onBack={goBack}
              dark={isNight}
            />
          </View>
        ) : null}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View key={step} entering={FadeInUp.duration(300)} style={styles.flexGrow}>
            {stepContent()}
          </Animated.View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {footer()}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  creamRoot: { flex: 1, backgroundColor: colors.background },
  nightRoot: { flex: 1, backgroundColor: colors.purpleDarkest },
  pageX: { paddingHorizontal: spacing.pageX },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.pageX, paddingBottom: spacing.xl },
  footer: { paddingHorizontal: spacing.pageX, paddingTop: 12, gap: 10 },

  premiumGateCard: {
    padding: 20,
    borderRadius: radius.base,
    backgroundColor: 'rgba(255,217,125,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,217,125,0.5)',
    gap: 10,
    marginBottom: spacing.lg,
  },
  premiumGateText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    lineHeight: 21,
  },
  premiumGateButtons: { gap: 10 },

  centerBlock: { alignItems: 'center', paddingTop: spacing.xl },
  introEmojiCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  introEmoji: { fontSize: 44 },
  introTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.display,
    color: colors.foreground,
    textAlign: 'center',
    letterSpacing: letterSpacing.tight,
    marginBottom: spacing.sm,
  },
  introBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  metaCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    padding: 18,
    gap: 14,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaEmoji: { fontSize: 18 },
  metaText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    flex: 1,
  },

  stepTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    color: colors.foreground,
    letterSpacing: letterSpacing.tight,
    marginBottom: spacing.lg,
  },
  ownerList: { gap: 10, marginBottom: spacing.xl },
  ownerLabel: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xl, color: colors.foreground },

  consentSubtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  consentCard: {
    backgroundColor: colors.secondary,
    borderRadius: radius.base,
    padding: 18,
    marginBottom: spacing.md,
  },
  consentCardTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xl,
    color: colors.secondaryForeground,
    marginBottom: 6,
  },
  consentBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.secondaryForeground,
    lineHeight: 23,
  },
  consentCheckRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: radius.base,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  consentCheckRowOn: { borderColor: colors.primary, backgroundColor: colors.secondary },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  consentCheckText: {
    flex: 1,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    lineHeight: 20,
  },
  consentNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  consentNoteText: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    lineHeight: 19,
  },

  nightCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  nightTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: letterSpacing.tight,
  },
  nightTitleLg: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.display,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: letterSpacing.tight,
  },
  nightBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: 'rgba(176,156,224,0.8)',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorDetail: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 19,
  },

  micTestCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(176,156,224,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(176,156,224,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },

  recordingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  scriptCard: {
    alignSelf: 'stretch',
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  scriptLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.xs,
    color: 'rgba(176,156,224,0.7)',
    letterSpacing: letterSpacing.wide,
    marginBottom: 10,
  },
  scriptText: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.xl,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 27,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 60,
    alignSelf: 'stretch',
  },
  waveformBar: { width: 4, borderRadius: 2 },
  timerBlock: { alignItems: 'center', gap: 6 },
  timerText: {
    fontFamily: fontFamilies.display,
    fontSize: 48,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  recordingStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coralOnDark },
  recordingStatusText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.7)',
  },
  silenceHint: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.gold,
    textAlign: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.coralOnDark,
    borderWidth: 4,
    borderColor: 'rgba(240,139,110,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingControls: { alignItems: 'center', gap: 14 },
  pausePill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingButtonsRow: { flexDirection: 'row', gap: 16 },
  finishButton: {
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: radius.base,
    backgroundColor: '#FFFFFF',
  },
  finishButtonDisabled: { opacity: 0.5 },
  finishButtonText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.lg,
    color: colors.primary,
  },
  restartButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: radius.base,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  restartButtonText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: 'rgba(255,255,255,0.7)',
  },
  coachingLine: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  coachingWarn: { color: '#F2C58A' },
  coachingOk: { color: '#A7D4B4' },
  startLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: 'rgba(255,255,255,0.85)',
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  resumeButtonText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  meterLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  meterTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  meterFill: { height: '100%', borderRadius: 4, backgroundColor: '#A7D4B4' },
  meterOk: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: '#A7D4B4',
  },
  reviewPlayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.base,
    padding: 14,
    marginTop: spacing.lg,
  },
  reviewPlayText: { flex: 1, gap: 2 },
  reviewPlayTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  reviewPlaySub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: 'rgba(255,255,255,0.6)',
  },
  reviewSafeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    alignSelf: 'stretch',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  reviewSafeCheck: { color: '#A7D4B4' },
  reviewSafeText: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.65)',
  },

  spinnerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(176,156,224,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },

  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(141,184,154,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(141,184,154,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  successEmoji: { fontSize: 44 },
  errorCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(224,84,84,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(224,84,84,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  confettiDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
});
