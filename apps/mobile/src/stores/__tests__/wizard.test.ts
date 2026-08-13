import { AgeRange, HeroType, StoryDuration, StoryTheme } from '@masalim/types';
import { MAX_THEMES, useWizardStore } from '../wizard';

const child = { id: 'child-1', name: 'Ege', ageRange: AgeRange.AGE_6_8 };

describe('wizard store', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });

  it('initializes once with the selected child and route theme', () => {
    useWizardStore.getState().initialize({ child, theme: StoryTheme.SLEEP });
    const state = useWizardStore.getState();
    expect(state.childId).toBe('child-1');
    expect(state.ageRange).toBe(AgeRange.AGE_6_8);
    expect(state.themes).toContain(StoryTheme.SLEEP);
    expect(state.initialized).toBe(true);

    // A second initialize must not clobber user edits.
    useWizardStore.getState().toggleTheme(StoryTheme.SPACE);
    useWizardStore
      .getState()
      .initialize({ child: { ...child, id: 'child-2' }, theme: StoryTheme.ANIMALS });
    expect(useWizardStore.getState().childId).toBe('child-1');
    expect(useWizardStore.getState().themes).not.toContain(StoryTheme.ANIMALS);
  });

  it('caps theme selection at MAX_THEMES but always allows deselect', () => {
    const store = useWizardStore.getState();
    const themes = [
      StoryTheme.ADVENTURE,
      StoryTheme.SLEEP,
      StoryTheme.FRIENDSHIP,
      StoryTheme.COURAGE,
      StoryTheme.SPACE,
    ];
    for (const theme of themes) useWizardStore.getState().toggleTheme(theme);
    expect(useWizardStore.getState().themes).toHaveLength(MAX_THEMES);
    expect(useWizardStore.getState().themes).not.toContain(StoryTheme.SPACE);

    useWizardStore.getState().toggleTheme(StoryTheme.ADVENTURE); // deselect at cap
    expect(useWizardStore.getState().themes).not.toContain(StoryTheme.ADVENTURE);
    expect(store.themes.length).toBeLessThanOrEqual(MAX_THEMES);
  });

  it('selecting the child as hero syncs hero fields; general story forces custom hero', () => {
    useWizardStore.getState().selectChild(child);
    expect(useWizardStore.getState().heroName).toBe('Ege');
    expect(useWizardStore.getState().heroType).toBe(HeroType.CHILD);

    useWizardStore.getState().selectGeneral();
    const state = useWizardStore.getState();
    expect(state.childId).toBeNull();
    expect(state.heroMode).toBe('custom');
  });

  it('applySuggestion merges themes (capped) and seeds the idea text', () => {
    useWizardStore.getState().toggleTheme(StoryTheme.SLEEP);
    useWizardStore
      .getState()
      .applySuggestion([StoryTheme.SPACE, StoryTheme.ADVENTURE], 'Uzaya gitsin');
    const state = useWizardStore.getState();
    expect(state.themes).toEqual(
      expect.arrayContaining([StoryTheme.SLEEP, StoryTheme.SPACE, StoryTheme.ADVENTURE]),
    );
    expect(state.themes.length).toBeLessThanOrEqual(MAX_THEMES);
    expect(state.customPrompt).toBe('Uzaya gitsin');
  });

  it('reset returns the full draft to defaults', () => {
    useWizardStore.getState().selectChild(child);
    useWizardStore.getState().toggleTheme(StoryTheme.SPACE);
    useWizardStore.getState().setDurationTarget(StoryDuration.LONG);
    useWizardStore.getState().reset();
    const state = useWizardStore.getState();
    expect(state.childId).toBeNull();
    expect(state.themes).toHaveLength(0);
    expect(state.step).toBe(1);
    expect(state.durationTarget).not.toBe(StoryDuration.LONG);
  });
});
