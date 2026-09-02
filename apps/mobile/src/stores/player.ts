import { create } from 'zustand';

/** What the single RNTP queue is playing — enough for the MiniPlayer to render and deep-link. */
export interface NowPlaying {
  storyId: string;
  narrationId: string;
  title: string;
  /** "Anne'nin sesiyle" — the lock-screen artist line, reused verbatim. */
  subtitle: string;
  artworkUrl: string | null;
}

interface PlayerState {
  nowPlaying: NowPlaying | null;
  setNowPlaying: (nowPlaying: NowPlaying) => void;
  clearNowPlaying: () => void;
}

/**
 * The RNTP track itself carries no storyId, so the player screen records the
 * narration it loaded here; previews (which reset the queue) clear it.
 * Session-only — a cold start has no queue to mirror.
 */
export const usePlayerStore = create<PlayerState>()((set) => ({
  nowPlaying: null,
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  clearNowPlaying: () => set({ nowPlaying: null }),
}));
