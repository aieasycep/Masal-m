import { useCallback, useEffect, useRef } from 'react';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  State,
  usePlaybackState,
  useProgress,
} from 'react-native-track-player';
import { withSuffix } from '@masalim/localization';
import type { Narration, StoryDetail } from '@masalim/validation';
import { api } from './api';
import i18n from './i18n';

/** Jump interval for the ±15s transport buttons and remote controls. */
export const JUMP_SECONDS = 15;

const PERSIST_INTERVAL_MS = 10_000;
const PERSIST_THROTTLE_MS = 2_000;

let playerReady = false;
let setupInFlight: Promise<void> | null = null;

/**
 * Idempotent player setup — safe to call on every player-screen mount (and
 * across fast refresh). Concurrent callers share one in-flight promise, and
 * the "already initialized" native error is treated as success.
 */
export async function setupPlayer(): Promise<void> {
  if (playerReady) return;
  if (setupInFlight != null) return setupInFlight;

  setupInFlight = (async () => {
    try {
      await TrackPlayer.setupPlayer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already been initialized/i.test(message)) throw error;
    }
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.JumpForward,
        Capability.JumpBackward,
        Capability.SeekTo,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.JumpForward,
        Capability.JumpBackward,
      ],
      forwardJumpInterval: JUMP_SECONDS,
      backwardJumpInterval: JUMP_SECONDS,
      progressUpdateEventInterval: 1,
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
    });
    playerReady = true;
  })();

  try {
    await setupInFlight;
  } finally {
    setupInFlight = null;
  }
}

/**
 * Lock-screen / player "artist" line, e.g. "Anne'nin sesiyle". Parent voices
 * get the Turkish genitive via withSuffix (vowel harmony); system voices use
 * the plain narrator name ("Deniz sesiyle").
 */
export function narratorLabel(narration: Narration): string {
  const name = narration.isParentVoice
    ? withSuffix(narration.narratorName, 'gen')
    : narration.narratorName;
  return i18n.t('player.narratedBy', { name });
}

export interface LoadNarrationInput {
  narration: Narration;
  story: StoryDetail;
  artworkUrl?: string;
}

/** Replace the queue with a single track for this narration. */
export async function loadNarration({
  narration,
  story,
  artworkUrl,
}: LoadNarrationInput): Promise<void> {
  if (narration.audioUrl == null) {
    throw new Error(`Narration ${narration.id} has no audio (status ${narration.status})`);
  }
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: narration.id,
    url: narration.audioUrl,
    title: story.title,
    artist: narratorLabel(narration),
    artwork: artworkUrl,
    duration: narration.duration ?? undefined,
  });
}

/** Thin wrapper around RNTP's useProgress (position/duration/buffered, seconds). */
export function usePlayerProgress(updateIntervalMs?: number) {
  return useProgress(updateIntervalMs);
}

export async function seekTo(seconds: number): Promise<void> {
  await TrackPlayer.seekTo(Math.max(0, seconds));
}

export async function jumpBack(): Promise<void> {
  const { position } = await TrackPlayer.getProgress();
  await TrackPlayer.seekTo(Math.max(0, position - JUMP_SECONDS));
}

export async function jumpForward(): Promise<void> {
  const { position, duration } = await TrackPlayer.getProgress();
  const target = position + JUMP_SECONDS;
  await TrackPlayer.seekTo(duration > 0 ? Math.min(duration, target) : target);
}

export async function setRate(rate: number): Promise<void> {
  await TrackPlayer.setRate(rate);
}

/** Play/pause from the current playback state; restarts a track that ended. */
export async function togglePlay(): Promise<void> {
  const { state } = await TrackPlayer.getPlaybackState();
  if (state === State.Playing || state === State.Buffering || state === State.Loading) {
    await TrackPlayer.pause();
  } else {
    if (state === State.Ended) {
      await TrackPlayer.seekTo(0);
    }
    await TrackPlayer.play();
  }
}

/**
 * Keeps the server-side continue-listening position honest: PUTs the playback
 * position every 10s while playing, on pause, and once on unmount. All writes
 * are throttled and fire-and-forget — sync must never surface errors.
 * Pass `narrationId: undefined` until the narration is actually loaded.
 */
export function usePositionPersistence(
  storyId: string | undefined,
  narrationId: string | undefined,
): void {
  const playbackState = usePlaybackState().state;
  const isPlaying = playbackState === State.Playing;
  const lastSentAtRef = useRef(0);
  const wasPlayingRef = useRef(false);

  const persist = useCallback(
    (force = false) => {
      if (storyId == null || storyId.length === 0 || narrationId == null) return;
      const nowMs = Date.now();
      if (!force && nowMs - lastSentAtRef.current < PERSIST_THROTTLE_MS) return;
      lastSentAtRef.current = nowMs;
      void TrackPlayer.getProgress()
        .then(({ position }) =>
          api.stories.setPlaybackPosition(storyId, {
            narrationId,
            positionSeconds: Math.max(0, Math.round(position)),
          }),
        )
        .catch(() => {
          // Fire-and-forget: continue-listening sync must never surface errors.
        });
    },
    [storyId, narrationId],
  );

  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  // Every 10s while playing.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => persist(), PERSIST_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isPlaying, persist]);

  // On the playing → paused transition.
  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) persist();
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, persist]);

  // Final flush on unmount (background playback continues, position is saved).
  useEffect(
    () => () => {
      persistRef.current(true);
    },
    [],
  );
}
