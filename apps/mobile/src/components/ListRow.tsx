import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, fontFamilies, fontSizes, radius } from '@masalim/ui';
import { ChevronRightIcon } from './icons';

interface ListRowProps {
  icon?: string;
  label: string;
  sub?: string;
  badge?: string;
  variant?: 'default' | 'toggle' | 'destructive' | 'disabled';
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  showDivider?: boolean;
}

/**
 * `ListRow/Navigation` from the final design: emoji icon tile + label/sub +
 * optional badge, with navigation chevron, toggle, destructive and disabled
 * variants. Used across Settings, Profile and Voice screens.
 */
export function ListRow({
  icon,
  label,
  sub,
  badge,
  variant = 'default',
  toggleValue,
  onToggle,
  onPress,
  showDivider = true,
}: ListRowProps) {
  const destructive = variant === 'destructive';
  const disabled = variant === 'disabled';
  const isToggle = variant === 'toggle';

  const body = (
    <View style={[styles.row, disabled ? styles.disabled : null]}>
      {icon ? (
        <View style={[styles.iconTile, destructive ? styles.iconTileDestructive : null]}>
          <Text style={styles.iconEmoji}>{icon}</Text>
        </View>
      ) : null}
      <View style={styles.textCol}>
        <Text
          style={[styles.label, destructive ? styles.labelDestructive : null]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {isToggle ? (
        <Switch
          value={toggleValue === true}
          onValueChange={disabled ? undefined : onToggle}
          disabled={disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.card}
        />
      ) : destructive ? null : (
        <ChevronRightIcon size={14} color={colors.mutedForeground} />
      )}
    </View>
  );

  return (
    <View>
      {isToggle || onPress == null || disabled ? (
        body
      ) : (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => (pressed ? styles.pressed : null)}
        >
          {body}
        </Pressable>
      )}
      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  pressed: { backgroundColor: colors.muted },
  disabled: { opacity: 0.4 },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileDestructive: { backgroundColor: 'rgba(224, 84, 84, 0.08)' },
  iconEmoji: { fontSize: 18 },
  textCol: { flex: 1, minWidth: 0 },
  label: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  labelDestructive: { color: colors.destructive },
  sub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    marginTop: 1,
  },
  badge: {
    backgroundColor: colors.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xxs,
    color: colors.primary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 18,
  },
});
