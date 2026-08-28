import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, shadows } from '@masalim/ui';
import { CheckIcon } from './icons';

interface SelectableCardProps {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
  /** Purple glow on selection (child/voice cards use it; hero/theme tiles don't). */
  glow?: boolean;
  showCheck?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/**
 * The design's recurring selection pattern: 2px border (primary when selected),
 * secondary fill, optional purple shadow + trailing check circle.
 */
export function SelectableCard({
  selected,
  onPress,
  children,
  glow = false,
  showCheck = true,
  style,
  accessibilityLabel,
}: SelectableCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.card,
        selected ? styles.cardSelected : styles.cardUnselected,
        selected && glow ? shadows.selectedCard : null,
        style,
      ]}
    >
      {children}
      {selected && showCheck ? (
        <View style={styles.check}>
          <CheckIcon />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    borderWidth: 2,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  cardUnselected: { borderColor: colors.border, backgroundColor: colors.card },
  check: {
    marginLeft: 'auto',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
