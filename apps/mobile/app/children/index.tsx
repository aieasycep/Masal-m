import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Child } from '@masalim/validation';
import { ApiError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { yearsFromAgeRange } from '../../src/lib/age';
import { isCanonicalInterest } from '../../src/lib/interests';
import { Avatar } from '../../src/components/Avatar';
import { Button } from '../../src/components/Button';
import { LoadingState } from '../../src/components/LoadingState';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { DEFAULT_AVATAR_EMOJI } from '../../src/components/AvatarEmojiPicker';
import { PencilIcon } from '../../src/components/icons';
import { EmptyState, ErrorState } from '../../src/components/states';

/** Children list (design Child/03-Children): cards + fixed "+ Çocuk Ekle" CTA. */
export default function ChildrenList() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const childrenQuery = useQuery({ queryKey: ['children'], queryFn: () => api.children.list() });
  const children = childrenQuery.data ?? [];

  const apiErrorMessage = (error: unknown): string => {
    if (error instanceof ApiError) {
      return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
    }
    return t('errors.OFFLINE');
  };

  const interestLabel = (interest: string): string =>
    isCanonicalInterest(interest) ? t(`childSetup.interests.${interest}`) : interest;

  const goToCreate = () => router.push('/children/new' as never);

  return (
    <View style={styles.root}>
      <Screen>
        <ScreenHeader title={t('profile.childrenSection')} />

        {childrenQuery.isPending ? (
          <LoadingState />
        ) : childrenQuery.isError ? (
          <ErrorState
            emoji="🌧️"
            title={apiErrorMessage(childrenQuery.error)}
            ctaLabel={t('common.retry')}
            onCta={() => {
              void childrenQuery.refetch();
            }}
          />
        ) : children.length === 0 ? (
          <EmptyState
            emoji="🧒"
            title={t('childSetup.listEmptyTitle')}
            body={t('childSetup.listEmptyBody')}
            ctaLabel={t('profile.addChild')}
            onCta={goToCreate}
          />
        ) : (
          <View style={styles.list}>
            {children.map((child: Child) => (
              <View key={child.id} style={[styles.card, shadows.cardSubtle]}>
                <View style={styles.cardRow}>
                  <Avatar
                    emoji={child.preferences.avatarEmoji ?? DEFAULT_AVATAR_EMOJI}
                    size={56}
                    kind="child"
                  />
                  <View style={styles.cardBody}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {child.name}
                      </Text>
                      <Text style={styles.age}>
                        {t('common.age', {
                          count: child.preferences.ageYears ?? yearsFromAgeRange(child.ageRange),
                        })}
                      </Text>
                    </View>
                    {child.interests.length > 0 ? (
                      <View style={styles.pillRow}>
                        {child.interests.slice(0, 3).map((interest) => (
                          <View key={interest} style={styles.pill}>
                            <Text style={styles.pillText} numberOfLines={1}>
                              {interestLabel(interest)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => router.push(`/children/${child.id}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('common.edit')} — ${child.name}`}
                    hitSlop={8}
                    style={({ pressed }) => [styles.editCircle, pressed && styles.editPressed]}
                  >
                    <PencilIcon size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.storiesEmoji}>📚</Text>
                  <Text style={styles.storiesText}>
                    {t('common.storyCount', { count: child.storyCount })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Screen>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button label={t('profile.addChild')} onPress={goToCreate} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { gap: spacing.sm },
  card: {
    padding: 18,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardBody: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 3,
  },
  name: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.foreground,
    flexShrink: 1,
  },
  age: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    backgroundColor: colors.secondary,
    borderRadius: radius.xs,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  pillText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  editCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPressed: { opacity: 0.7 },
  cardFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  storiesEmoji: { fontSize: 14 },
  storiesText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  footer: {
    paddingHorizontal: spacing.pageX,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
});
