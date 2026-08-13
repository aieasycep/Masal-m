import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AGE_RANGE_LABELS } from '@masalim/types';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { api } from '../lib/api';
import { useAppPrefs } from '../stores/app-prefs';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { SelectableCard } from './SelectableCard';

/** Deterministic child avatar emoji (name-hash) — keep in sync with Profile. */
const CHILD_EMOJIS = ['🧒', '👧', '🦁', '🐻', '🦊', '🐰'] as const;

/** Children have no avatar field in the API yet; derive an emoji from the name. */
export function childAvatarEmoji(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash + (char.codePointAt(0) ?? 0)) % 9973;
  }
  return CHILD_EMOJIS[hash % CHILD_EMOJIS.length] ?? CHILD_EMOJIS[0];
}

interface ChildSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet for switching the active child from Home (§13 design gap).
 * Selecting a row persists the choice in app prefs and closes the sheet.
 */
export function ChildSwitcherSheet({ visible, onClose }: ChildSwitcherSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const selectedChildId = useAppPrefs((state) => state.selectedChildId);
  const setSelectedChildId = useAppPrefs((state) => state.setSelectedChildId);
  const childrenQuery = useQuery({ queryKey: ['children'], queryFn: () => api.children.list() });
  const childList = childrenQuery.data ?? [];

  const selectChild = (childId: string) => {
    setSelectedChildId(childId);
    onClose();
  };

  const addChild = () => {
    onClose();
    router.push('/children/new' as never);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.grabber} />
        <Text style={styles.title} accessibilityRole="header">
          {t('profile.childrenSection')}
        </Text>
        <View style={styles.list}>
          {childList.map((child) => (
            <SelectableCard
              key={child.id}
              selected={child.id === selectedChildId}
              onPress={() => selectChild(child.id)}
              accessibilityLabel={child.name}
            >
              <Avatar emoji={childAvatarEmoji(child.name)} size={44} kind="child" />
              <View>
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.childAge}>
                  {t('common.age', {
                    // "3–5 yaş": the range label interpolates as-is (plural
                    // resolution only kicks in for numeric counts).
                    count: AGE_RANGE_LABELS[child.ageRange] as unknown as number,
                  })}
                </Text>
              </View>
            </SelectableCard>
          ))}
        </View>
        <Button label={t('profile.addChild')} onPress={addChild} variant="secondary" compact />
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
    marginBottom: spacing.md,
  },
  list: { gap: spacing.xs, marginBottom: spacing.md },
  childName: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.xl,
    color: colors.foreground,
    marginBottom: 2,
  },
  childAge: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
});
