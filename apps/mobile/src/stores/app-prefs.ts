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
  setHasSeenOnboarding: (seen: boolean) => void;
  setSelectedChildId: (childId: string | null) => void;
  setDefaultPlaybackRate: (rate: number) => void;
  setAutoFollowPage: (enabled: boolean) => void;
}

export const useAppPrefs = create<AppPrefsState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      selectedChildId: null,
      defaultPlaybackRate: 1,
      autoFollowPage: true,
      setHasSeenOnboarding: (seen) => set({ hasSeenOnboarding: seen }),
      setSelectedChildId: (childId) => set({ selectedChildId: childId }),
      setDefaultPlaybackRate: (rate) => set({ defaultPlaybackRate: rate }),
      setAutoFollowPage: (enabled) => set({ autoFollowPage: enabled }),
    }),
    {
      name: 'masalim.app-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
