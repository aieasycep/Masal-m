import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { Button } from './Button';
import { SheetContainer } from './SheetContainer';

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

/**
 * `Sheet/Confirm` from the final design — bottom confirmation sheet. Destructive
 * variant adds the red trash circle above the title.
 */
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
  return (
    <SheetContainer visible={visible} onDismiss={onCancel}>
      {destructive ? (
        <View style={styles.trashCircle}>
          <Text style={styles.trashEmoji}>🗑</Text>
        </View>
      ) : null}
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
    </SheetContainer>
  );
}

const styles = StyleSheet.create({
  trashCircle: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(224, 84, 84, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  trashEmoji: { fontSize: 26 },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 20,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  buttons: { gap: spacing.xs, paddingBottom: spacing.xs },
});
