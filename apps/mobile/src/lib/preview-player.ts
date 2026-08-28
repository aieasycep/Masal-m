import { useCallback, useEffect, useSyncExternalStore } from 'react';
import TrackPlayer, { Event, State } from 'react-native-track-player';
import { setupPlayer } from './player';

export type PreviewStatus = 'idle' | 'loading' | 'playing' | 'error';

interface PreviewState {
  key: string | null;
  status: Exclude<PreviewStatus, 'idle'> | null;
}

/**
 * App-wide single-instance voice preview player. RNTP owns all playback (§design
 * rule), so previews share the one native player: starting a preview resets the
 * queue, and only one preview can play at a time across every screen.
 */
let state: PreviewState = { key: null, status: null };
let generation = 0;
let eventsBound = false;
const listeners = new Set<() => void>();

function emit(next: PreviewState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function bindEndListener(): void {
  if (eventsBound) return;
  eventsBound = true;
  TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
    if (state.status !== 'playing') return;
    if (event.state === State.Ended || event.state === State.Stopped || event.state === State.None) {
      emit({ key: null, status: null });
    }
  });
}

export async function stopPreview(): Promise<void> {
  if (state.key == null) return;
  generation += 1;
  emit({ key: null, status: null });
  try {
    await TrackPlayer.reset();
  } catch {
    // player not set up yet — nothing to stop
  }
}

async function startPreview(key: string, loadUrl: () => Promise<string>): Promise<void> {
  const myGeneration = ++generation;
  emit({ key, status: 'loading' });
  try {
    const url = await loadUrl();
    if (generation !== myGeneration) return;
    await setupPlayer();
    bindEndListener();
    await TrackPlayer.reset();
    if (generation !== myGeneration) return;
    await TrackPlayer.add({ url });
    await TrackPlayer.play();
    if (generation !== myGeneration) return;
    emit({ key, status: 'playing' });
  } catch {
    if (generation !== myGeneration) return;
    emit({ key, status: 'error' });
  }
}

/**
 * Subscribe to the shared preview state. `statusFor(key)` feeds
 * AudioPreviewButton; `toggle(key, loadUrl)` starts a preview (stopping any
 * other) or stops it when the same key is already playing/loading. Previews
 * stop automatically when the subscribing screen unmounts.
 */
export function usePreviewPlayer(): {
  statusFor: (key: string) => PreviewStatus;
  toggle: (key: string, loadUrl: () => Promise<string>) => void;
} {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );

  useEffect(() => {
    return () => {
      void stopPreview();
    };
  }, []);

  const statusFor = useCallback(
    (key: string): PreviewStatus => (current.key === key ? (current.status ?? 'idle') : 'idle'),
    [current],
  );

  const toggle = useCallback((key: string, loadUrl: () => Promise<string>) => {
    if (state.key === key && state.status !== 'error') {
      void stopPreview();
      return;
    }
    void startPreview(key, loadUrl);
  }, []);

  return { statusFor, toggle };
}
