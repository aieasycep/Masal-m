/**
 * Shadow tokens (React Native shape). Purple-tinted shadows are part of the
 * brand language: selected cards, primary CTAs and the raised tab button.
 */
export const shadows = {
  cardSubtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardMedium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  selectedCard: {
    shadowColor: '#7C5CBF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 3,
  },
  primaryCta: {
    shadowColor: '#7C5CBF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 6,
  },
  hero: {
    shadowColor: '#7C5CBF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 6,
  },
  tabCreate: {
    shadowColor: '#7C5CBF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  recordButton: {
    shadowColor: '#F08B6E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 8,
  },
  playerCover: {
    shadowColor: '#7C5CBF',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.5,
    shadowRadius: 64,
    elevation: 12,
  },
} as const;
