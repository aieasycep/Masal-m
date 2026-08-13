import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@masalim/ui';

interface ScreenProps {
  children: ReactNode;
  /** Scrollable content (default true). */
  scroll?: boolean;
  /** Reserve space for the bottom tab bar. */
  withTabBar?: boolean;
  /** Horizontal padding (defaults to the 24px page gutter). */
  padded?: boolean;
  style?: ViewStyle;
  backgroundColor?: string;
}

/** Page wrapper: safe area, cream background, standard gutters. */
export function Screen({
  children,
  scroll = true,
  withTabBar = false,
  padded = true,
  style,
  backgroundColor = colors.background,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = Math.max(insets.top, 20) + 8;
  const paddingBottom = withTabBar ? spacing.tabBarClearance : Math.max(insets.bottom, 24);

  if (!scroll) {
    return (
      <View
        style={[
          styles.root,
          { backgroundColor, paddingTop },
          padded && styles.padded,
          { paddingBottom },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor }]}
      contentContainerStyle={[{ paddingTop, paddingBottom }, padded && styles.padded, style]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { paddingHorizontal: spacing.pageX },
});
