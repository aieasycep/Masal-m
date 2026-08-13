import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AppPrefsState {
  /** Onboarding slides seen on this device (§12 — never auto-replay). */
  hasSeenOnboarding: boolean;
  /** Currently selected child for home/wizard context. */
  selectedChildId: string | null;
  setHasSeenOnboarding: (seen: boolean) => void;
  setSelectedChildId: (childId: string | null) => void;
}

export const useAppPrefs = create<AppPrefsState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      selectedChildId: null,
      setHasSeenOnboarding: (seen) => set({ hasSeenOnboarding: seen }),
      setSelectedChildId: (childId) => set({ selectedChildId: childId }),
    }),
    {
      name: 'masalim.app-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
