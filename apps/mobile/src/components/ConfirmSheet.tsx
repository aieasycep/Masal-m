import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { Button } from './Button';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Bottom confirmation sheet (destructive actions: voice/story/account deletion). */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        <View style={styles.buttons}>
          <Button
            label={confirmLabel}
            onPress={onConfirm}
            variant={destructive ? 'destructive' : 'primary'}
          />
          <Button label={cancelLabel} onPress={onCancel} variant="tertiary" compact />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 15, 35, 0.45)' },
  sheet: {
    backgroundColor: colors.background,
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
    marginBottom: 20,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.foreground,
    marginBottom: 8,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    lineHeight: 21,
    marginBottom: 8,
  },
  buttons: { gap: 8, marginTop: 16 },
});
