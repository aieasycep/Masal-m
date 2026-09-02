import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateChildSchema, type UpdateChildInput } from '@masalim/validation';
import { ApiError } from '@masalim/api-client';
import { withSuffix } from '@masalim/localization';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import {
  ageFromYearMonth,
  ageRangeFromYears,
  birthDateFromYearMonth,
  defaultBirthYearMonth,
  fallbackBirthYearMonth,
  yearMonthFromBirthDate,
} from '../../src/lib/age';
import { CANONICAL_INTERESTS, isCanonicalInterest } from '../../src/lib/interests';
import { useAppPrefs } from '../../src/stores/app-prefs';
import { AvatarEmojiPicker, DEFAULT_AVATAR_EMOJI } from '../../src/components/AvatarEmojiPicker';
import { BirthMonthPicker } from '../../src/components/BirthMonthPicker';
import { Button } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState } from '../../src/components/states';

/**
 * Child edit (design Child/02-EditProfile): avatar picker, name, birth
 * month/year (stored as Child.birthDate; age derives from it, bucketed to
 * ageRange), interest chips keyed by raw canonical IDs, destructive delete.
 */
export default function ChildDetail() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const selectedChildId = useAppPrefs((state) => state.selectedChildId);
  const setSelectedChildId = useAppPrefs((state) => state.setSelectedChildId);

  const [name, setName] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState<string>(DEFAULT_AVATAR_EMOJI);
  const [birth, setBirth] = useState(() => defaultBirthYearMonth());
  const ageYears = ageFromYearMonth(birth);
  const [interests, setInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  const childQuery = useQuery({
    queryKey: ['children', id],
    queryFn: () => api.children.get(id),
    enabled: id != null && id.length > 0,
  });
  const child = childQuery.data;

  useEffect(() => {
    if (child != null && prefilledFor !== child.id) {
      setName(child.name);
      setAvatarEmoji(child.preferences.avatarEmoji ?? DEFAULT_AVATAR_EMOJI);
      setBirth(
        yearMonthFromBirthDate(child.birthDate) ??
          fallbackBirthYearMonth(child.preferences.ageYears, child.ageRange),
      );
      setInterests(child.interests);
      setPrefilledFor(child.id);
    }
  }, [child, prefilledFor]);

  const apiErrorMessage = (error: unknown): string => {
    if (error instanceof ApiError) {
      return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
    }
    return t('errors.OFFLINE');
  };

  const updateMutation = useMutation({
    mutationFn: (input: UpdateChildInput) => api.children.update(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['children'] });
      router.back();
    },
    onError: (error) => setServerError(apiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.children.remove(id),
    onSuccess: async () => {
      if (selectedChildId === id) {
        setSelectedChildId(null);
      }
      await queryClient.invalidateQueries({ queryKey: ['children'] });
      router.back();
    },
    onError: (error) => setServerError(apiErrorMessage(error)),
  });

  // Canonical-vs-custom matching uses raw stored keys (the API lowercases
  // interests with the tr locale, so canonical keys round-trip unchanged).
  const customInterests = interests.filter((interest) => !isCanonicalInterest(interest));

  const toggleInterest = (key: string) => {
    setInterests((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const addCustomInterest = () => {
    const trimmed = customInterest.trim();
    if (trimmed.length === 0) return;
    // Typing a canonical interest by hand selects its chip instead of duplicating it.
    const value = isCanonicalInterest(trimmed.toLocaleLowerCase('tr'))
      ? trimmed.toLocaleLowerCase('tr')
      : trimmed;
    setInterests((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setCustomInterest('');
  };

  const save = () => {
    if (child == null) return;
    setServerError(null);
    const parsed = updateChildSchema.safeParse({
      name: name.trim(),
      birthDate: birthDateFromYearMonth(birth),
      ageRange: ageRangeFromYears(ageYears),
      interests,
      // Preserve any other stored preference keys (nickname, notes, …).
      // ageYears kept for back-compat with the stable app's age display.
      preferences: { ...child.preferences, avatarEmoji, ageYears },
    });
    if (!parsed.success || name.trim().length === 0) {
      setServerError(t('errors.VALIDATION_FAILED'));
      return;
    }
    updateMutation.mutate(parsed.data);
  };

  if (childQuery.isPending) {
    return (
      <Screen scroll={false}>
        <ScreenHeader />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      </Screen>
    );
  }

  if (childQuery.isError || child == null) {
    return (
      <Screen scroll={false}>
        <ScreenHeader />
        <ErrorState
          emoji="🌧️"
          title={apiErrorMessage(childQuery.error)}
          ctaLabel={t('common.retry')}
          onCta={() => {
            void childQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Screen>
          <ScreenHeader
            title={t('childSetup.editTitle', {
              name: child.name,
              nameGen: withSuffix(child.name, 'gen'),
            })}
          />

          <AvatarEmojiPicker value={avatarEmoji} onChange={setAvatarEmoji} />

          <View style={styles.nameField}>
            <Input
              label={t('childSetup.nameLabel')}
              placeholder={t('childSetup.namePlaceholder')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              accessibilityLabel={t('childSetup.nameLabel')}
            />
          </View>

          <Text style={styles.sectionLabel}>
            {t('childSetup.birthMonthLabel').toLocaleUpperCase('tr')}
          </Text>
          <BirthMonthPicker value={birth} onChange={setBirth} />
          <Text style={styles.birthHelper}>
            {`${t('childSetup.birthMonthHelperAge', { age: ageYears })} ${t('childSetup.birthMonthHelper')}`}
          </Text>

          <Text style={styles.sectionLabel}>
            {t('childSetup.interestsTitle').toLocaleUpperCase('tr')}
          </Text>
          <Text style={styles.sectionHint}>{t('childSetup.interestsSubtitle')}</Text>
          <View style={styles.chipWrap}>
            {CANONICAL_INTERESTS.map((interest) => (
              <Chip
                key={interest.key}
                label={t(`childSetup.interests.${interest.key}`)}
                emoji={interest.emoji}
                selected={interests.includes(interest.key)}
                onPress={() => toggleInterest(interest.key)}
              />
            ))}
            {customInterests.map((label) => (
              <Chip key={label} label={label} emoji="✨" selected onPress={() => toggleInterest(label)} />
            ))}
            <Chip
              label={t('childSetup.addCustomInterest')}
              emoji="+"
              dashed
              selected={showCustomInput}
              onPress={() => setShowCustomInput((visible) => !visible)}
            />
          </View>
          {showCustomInput ? (
            <View style={styles.customRow}>
              <View style={styles.customInput}>
                <Input
                  placeholder={t('childSetup.customInterestPlaceholder')}
                  value={customInterest}
                  onChangeText={setCustomInterest}
                  onSubmitEditing={addCustomInterest}
                  returnKeyType="done"
                  accessibilityLabel={t('childSetup.addCustomInterest')}
                />
              </View>
              <Button
                label={t('common.done')}
                onPress={addCustomInterest}
                variant="secondary"
                compact
              />
            </View>
          ) : null}

          {serverError ? <Text style={styles.error}>{serverError}</Text> : null}

          <Button
            label={t('childSetup.deleteChild')}
            onPress={() => setConfirmDelete(true)}
            variant="destructive"
            compact
            loading={deleteMutation.isPending}
            // Design: destructive tint — 6% fill / 20% border of colors.destructive (#E05454).
            style={styles.deleteButton}
          />
        </Screen>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button
            label={t('childSetup.updateChild')}
            onPress={save}
            loading={updateMutation.isPending}
          />
        </View>
      </KeyboardAvoidingView>

      <ConfirmSheet
        visible={confirmDelete}
        title={t('childSetup.deleteConfirmTitle')}
        body={t('childSetup.deleteConfirmBody', { name: child.name })}
        confirmLabel={t('childSetup.deleteChild')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMutation.mutate();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nameField: { marginTop: spacing.xl },
  birthHelper: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionHint: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  customInput: { flex: 1 },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginTop: spacing.lg,
  },
  deleteButton: {
    marginTop: spacing.xl,
    borderRadius: radius.base,
    backgroundColor: 'rgba(224,84,84,0.06)',
    borderColor: 'rgba(224,84,84,0.2)',
  },
  footer: {
    paddingHorizontal: spacing.pageX,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
});
