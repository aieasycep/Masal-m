import { AgeRange, HeroType } from '@masalim/types';
import type { CharacterBible } from '@masalim/ai';
import type { Child, Story } from '@masalim/database';

const AGE_MIDPOINT: Record<AgeRange, number> = {
  [AgeRange.AGE_0_2]: 2,
  [AgeRange.AGE_3_5]: 4,
  [AgeRange.AGE_6_8]: 7,
  [AgeRange.AGE_9_12]: 10,
};

const HERO_APPEARANCE: Record<HeroType, string> = {
  [HeroType.CHILD]:
    'a cheerful child with soft rounded features, big curious eyes, wavy chestnut-brown hair and a warm smile',
  [HeroType.ANIMAL]:
    'an adorable fluffy animal companion with round friendly eyes, soft fur in honey and cream tones',
  [HeroType.FANTASY]:
    'a gentle magical being with softly glowing star-freckles, pastel-lilac hair and tiny translucent wings',
  [HeroType.ROBOT]:
    'a friendly rounded little robot with a soft matte cream shell, glowing amber eyes and rosy cheek lights',
  [HeroType.CUSTOM]:
    'a lovable storybook hero with soft rounded features, big kind eyes and a warm smile',
};

const HERO_CLOTHES: Record<HeroType, string> = {
  [HeroType.CHILD]: 'a cozy mustard-yellow sweater, teal trousers and small red shoes',
  [HeroType.ANIMAL]: 'a tiny knitted scarlet scarf',
  [HeroType.FANTASY]: 'a flowing moss-green tunic with tiny golden star embroidery',
  [HeroType.ROBOT]: 'painted navy-blue chest panel with a small golden star emblem',
  [HeroType.CUSTOM]: 'a cozy mustard-yellow sweater and teal trousers',
};

/**
 * Deterministic CharacterBible (§27): composed once per illustration set from
 * the story's hero + child data. The identical block is injected verbatim into
 * every image call of the set — this is what keeps the character consistent.
 */
export function buildCharacterBible(story: Story, child: Child | null): CharacterBible {
  const heroIsChild = child != null && story.heroName === child.name;
  return {
    name: story.heroName,
    age: AGE_MIDPOINT[heroIsChild && child != null ? child.ageRange : story.ageRange],
    appearance: HERO_APPEARANCE[story.heroType],
    clothes: HERO_CLOTHES[story.heroType],
    importantFeatures: [
      'always the same face, hair and outfit in every illustration',
      'kind, reassuring expression suitable for a bedtime story',
    ],
  };
}
