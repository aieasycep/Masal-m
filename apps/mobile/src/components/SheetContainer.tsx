import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@masalim/ui';

interface SheetContainerProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
}

/**
 * Shared bottom-sheet shell from the final design (390pt sheet, 24pt top radius,
 * 40×4 grabber, 45% scrim). ConfirmSheet/PremiumSheet/ChildSwitcherSheet and the
 * ad-hoc voice menus all render inside this container.
 */
export function SheetContainer({ visible, onDismiss, children }: SheetContainerProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.grabber} />
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 15, 35, 0.45)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.pageX,
    paddingTop: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
});
