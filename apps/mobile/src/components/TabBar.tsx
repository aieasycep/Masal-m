import type { ReactNode } from 'react';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, gradients, shadows, spacing } from '@masalim/ui';
import { registerTourTarget } from '../lib/tour-targets';
import { BookIcon, HomeIcon, PlusCircleIcon, UserIcon } from './icons';

interface TabMeta {
  labelKey: string;
  Icon: typeof HomeIcon;
}

const TAB_META: Record<string, TabMeta> = {
  home: { labelKey: 'tabs.home', Icon: HomeIcon },
  library: { labelKey: 'tabs.library', Icon: BookIcon },
  profile: { labelKey: 'tabs.profile', Icon: UserIcon },
};

/** Index (within the rendered row) where the raised "Oluştur" button sits. */
const CREATE_POSITION = 2;

/**
 * Custom bottom tab bar: white bar with hairline top border, three regular
 * tabs and the raised gradient "Oluştur" button in the middle.
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { t } = useTranslation();

  const items: ReactNode[] = state.routes.map((route, index) => {
    const meta = TAB_META[route.name];
    if (!meta) {
      return null;
    }
    const { Icon } = meta;
    const isFocused = state.index === index;
    const color = isFocused ? colors.primary : colors.mutedForeground;
    const label = t(meta.labelKey);

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={route.key}
        ref={(view) => registerTourTarget(`tabs.${route.name}`, view)}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        style={styles.tab}
      >
        <Icon size={22} color={color} filled={isFocused} />
        <Text style={[isFocused ? styles.labelActive : styles.label, { color }]}>{label}</Text>
      </Pressable>
    );
  });

  items.splice(
    CREATE_POSITION,
    0,
    <Pressable
      key="create"
      onPress={() => router.push('/story/create' as never)}
      accessibilityRole="button"
      accessibilityLabel={t('tabs.create')}
      style={styles.tab}
    >
      <View style={styles.createCircleShadow}>
        <LinearGradient
          colors={gradients.primaryCta as unknown as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.createCircle}
        >
          <PlusCircleIcon size={26} color={colors.primaryForeground} />
        </LinearGradient>
      </View>
      <Text style={styles.createLabel}>{t('tabs.create')}</Text>
    </Pressable>,
  );

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 24) }]}>{items}</View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  tab: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  label: { fontFamily: fontFamilies.body, fontSize: fontSizes.xxs },
  labelActive: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xxs },
  createCircleShadow: {
    marginTop: -16,
    borderRadius: 26,
    ...shadows.tabCreate,
  },
  createCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createLabel: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.primary,
    marginTop: 2,
  },
});
