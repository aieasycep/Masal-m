import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AppPrefsState {
  /** Onboarding slides seen on this device (§12 — never auto-replay). */
  hasSeenOnboarding: boolean;
  /** Currently selected child for home/wizard context. */
  selectedChildId: string | null;
  /** "Ses ve Oynatma" default narration speed (0.8 / 1 / 1.2 / 1.5). */
  defaultPlaybackRate: number;
  /** "Ses ve Oynatma": auto-advance the story text page with the narration. */
  autoFollowPage: boolean;
  /** Feature tours/hints already shown on this device, by tour key. */
  seenTours: Record<string, boolean>;
  setHasSeenOnboarding: (seen: boolean) => void;
  setSelectedChildId: (childId: string | null) => void;
  setDefaultPlaybackRate: (rate: number) => void;
  setAutoFollowPage: (enabled: boolean) => void;
  markTourSeen: (key: string) => void;
  /** Settings "Tanıtımı tekrar göster" — every tour replays once more. */
  resetSeenTours: () => void;
}

export const useAppPrefs = create<AppPrefsState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      selectedChildId: null,
      defaultPlaybackRate: 1,
      autoFollowPage: true,
      seenTours: {},
      setHasSeenOnboarding: (seen) => set({ hasSeenOnboarding: seen }),
      setSelectedChildId: (childId) => set({ selectedChildId: childId }),
      setDefaultPlaybackRate: (rate) => set({ defaultPlaybackRate: rate }),
      setAutoFollowPage: (enabled) => set({ autoFollowPage: enabled }),
      markTourSeen: (key) => set((state) => ({ seenTours: { ...state.seenTours, [key]: true } })),
      resetSeenTours: () => set({ seenTours: {} }),
    }),
    {
      name: 'masalim.app-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
