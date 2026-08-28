/** Gradient stop sets from the design; consumed by expo-linear-gradient. */
export const gradients = {
  /** Brand CTA + raised tab button (135deg). */
  primaryCta: ['#9B7FD4', '#7C5CBF'],
  /** Home hero card (135deg, 3 stops). */
  homeHero: ['#2D1B69', '#7C5CBF', '#9B7FD4'],
  /** Night screens: splash, generating, recording (160deg). */
  nightSky: ['#1A0F3C', '#2D1B69', '#0D1B2E'],
  /** Story result cover hero (160deg). */
  storyCover: ['#2D1B69', '#7C5CBF', '#B09CE0'],
  /** Child avatar circles. */
  childAvatar: ['#D4C8F0', '#EDE8F8'],
  /** System voice avatars (cool lavender). */
  systemVoiceAvatar: ['#D4C8F0', '#B09CE0'],
  /** Parent voice avatars (warm peach→coral). */
  parentVoiceAvatar: ['#F5C4A8', '#F08B6E'],
  /** Progress fills. */
  progress: ['#7C5CBF', '#B09CE0'],
  /** Generating screen progress (purple→gold). */
  generatingProgress: ['#9B7FD4', '#FFD97D'],
  /** Player cover art. */
  playerCover: ['#2D1B69', '#7C5CBF'],
} as const;
