import { create } from 'zustand';
import { AgeRange, HeroType, StoryDuration, type StoryTheme } from '@masalim/types';

/** Max selectable themes — mirrors createStorySchema's `.max(4)`. */
export const MAX_THEMES = 4;

export type HeroMode = 'child' | 'custom';

/** Minimal child info the wizard needs (id + copy + age default). */
export interface WizardChild {
  id: string;
  name: string;
  ageRange: AgeRange;
}

interface WizardDraft {
  step: number;
  /** null = no profile child attached (guest-named child or general story). */
  childId: string | null;
  /**
   * QA design "Başka bir çocuk": a name used ONLY for this story, without
   * creating a profile. null = not in guest mode; '' = guest mode, no name yet.
   */
  guestName: string | null;
  heroMode: HeroMode;
  heroName: string;
  heroType: HeroType;
  themes: StoryTheme[];
  /** Free-text idea — maps to CreateStoryInput.customPrompt. */
  customPrompt: string;
  ageRange: AgeRange;
  durationTarget: StoryDuration;
  /**
   * Narrator choice (system voice id). Carried through generating → result →
   * narrate as the preselected narrator once the story is ready.
   */
  voiceId: string | null;
  /** One-time prefill (selected child from app prefs + route theme) applied. */
  initialized: boolean;
}

interface WizardState extends WizardDraft {
  setStep: (step: number) => void;
  /** One-time prefill from app prefs (child) and the `?theme=` route param. */
  initialize: (options: { child: WizardChild | null; theme: StoryTheme | null }) => void;
  selectChild: (child: WizardChild) => void;
  /** "General story" — no child; hero must be custom. */
  selectGeneral: () => void;
  /** "Başka bir çocuk" — story-only named child, no profile created. */
  selectGuest: () => void;
  setGuestName: (name: string) => void;
  setHeroMode: (heroMode: HeroMode) => void;
  setHeroName: (heroName: string) => void;
  setHeroType: (heroType: HeroType) => void;
  /** Toggle a theme; taps beyond MAX_THEMES are ignored (deselect always works). */
  toggleTheme: (theme: StoryTheme) => void;
  setThemes: (themes: StoryTheme[]) => void;
  /** AI suggestion tap: merge its themes (capped) and seed the free-text idea. */
  applySuggestion: (themes: StoryTheme[], promptSeed: string) => void;
  setCustomPrompt: (customPrompt: string) => void;
  setAgeRange: (ageRange: AgeRange) => void;
  setDurationTarget: (durationTarget: StoryDuration) => void;
  setVoiceId: (voiceId: string | null) => void;
  reset: () => void;
}

const initialDraft: WizardDraft = {
  step: 1,
  childId: null,
  guestName: null,
  heroMode: 'child',
  heroName: '',
  heroType: HeroType.CHILD,
  themes: [],
  customPrompt: '',
  ageRange: AgeRange.AGE_3_5,
  durationTarget: StoryDuration.MEDIUM,
  voiceId: null,
  initialized: false,
};

/**
 * Story-creation wizard draft. Plain (non-persisted) store: the draft survives
 * navigation within the session but starts fresh on app relaunch.
 */
export const useWizardStore = create<WizardState>()((set) => ({
  ...initialDraft,
  setStep: (step) => set({ step }),
  initialize: ({ child, theme }) =>
    set((state) => {
      // Self-guarding: prefill applies exactly once per draft (reset() re-arms).
      if (state.initialized) return {};
      return {
        initialized: true,
        // A prefilled child already answers step 1 — start at the hero step.
        // Step 1 stays reachable via the back button for switching children.
        step: child != null ? 2 : state.step,
        childId: child?.id ?? null,
        heroMode: child == null ? 'custom' : ('child' as const),
        heroName: child?.name ?? '',
        heroType: HeroType.CHILD,
        ageRange: child?.ageRange ?? state.ageRange,
        themes: theme != null ? [theme] : state.themes,
      };
    }),
  selectChild: (child) =>
    set((state) => ({
      childId: child.id,
      guestName: null,
      ageRange: child.ageRange,
      // Child-as-hero keeps hero fields in sync with the selected child.
      ...(state.heroMode === 'child'
        ? { heroName: child.name, heroType: HeroType.CHILD }
        : {}),
    })),
  selectGeneral: () =>
    set((state) => ({
      childId: null,
      guestName: null,
      heroMode: 'custom',
      // Drop a hero name inherited from child-as-hero mode.
      heroName: state.heroMode === 'child' ? '' : state.heroName,
    })),
  selectGuest: () =>
    set({
      childId: null,
      guestName: '',
      heroMode: 'child',
      heroName: '',
      heroType: HeroType.CHILD,
    }),
  setGuestName: (name) =>
    set((state) => ({
      guestName: name,
      // The guest child doubles as the hero while child-as-hero is active.
      ...(state.heroMode === 'child' ? { heroName: name, heroType: HeroType.CHILD } : {}),
    })),
  setHeroMode: (heroMode) => set({ heroMode }),
  setHeroName: (heroName) => set({ heroName }),
  setHeroType: (heroType) => set({ heroType }),
  toggleTheme: (theme) =>
    set((state) => {
      if (state.themes.includes(theme)) {
        return { themes: state.themes.filter((item) => item !== theme) };
      }
      if (state.themes.length >= MAX_THEMES) {
        return {};
      }
      return { themes: [...state.themes, theme] };
    }),
  setThemes: (themes) => set({ themes: themes.slice(0, MAX_THEMES) }),
  applySuggestion: (themes, promptSeed) =>
    set((state) => {
      const merged = [...state.themes];
      for (const theme of themes) {
        if (!merged.includes(theme) && merged.length < MAX_THEMES) {
          merged.push(theme);
        }
      }
      return { themes: merged, customPrompt: promptSeed };
    }),
  setCustomPrompt: (customPrompt) => set({ customPrompt }),
  setAgeRange: (ageRange) => set({ ageRange }),
  setDurationTarget: (durationTarget) => set({ durationTarget }),
  setVoiceId: (voiceId) => set({ voiceId }),
  reset: () => set(initialDraft),
}));
