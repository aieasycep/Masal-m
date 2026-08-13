import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AGE_RANGE_LABELS, AgeRange } from '@masalim/types';
import { updateChildSchema, type UpdateChildInput } from '@masalim/validation';
import { ApiError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { useAppPrefs } from '../../src/stores/app-prefs';
import { Button } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SelectableCard } from '../../src/components/SelectableCard';
import { ErrorState } from '../../src/components/states';

const AGE_RANGES: AgeRange[] = [
  AgeRange.AGE_0_2,
  AgeRange.AGE_3_5,
  AgeRange.AGE_6_8,
  AgeRange.AGE_9_12,
];

/** Canonical interest keys under childSetup.interests.* (same set as /children/new). */
const INTEREST_KEYS = [
  'dinozorlar',
  'uzay',
  'hayvanlar',
  'arabalar',
  'prensesler',
  'deniz',
  'doğa',
  'robotlar',
  'futbol',
  'periler',
  'macera',
  'müzik',
] as const;

/** Child detail/edit: prefill from the API, save via PATCH, danger-zone delete. */
export default function ChildDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const selectedChildId = useAppPrefs((state) => state.selectedChildId);
  const setSelectedChildId = useAppPrefs((state) => state.setSelectedChildId);

  const [name, setName] = useState('');
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
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
      setAgeRange(child.ageRange);
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

  const canonicalLabels = INTEREST_KEYS.map((key) => t(`childSetup.interests.${key}`));
  const customInterests = interests.filter((interest) => !canonicalLabels.includes(interest));

  const toggleInterest = (label: string) => {
    setInterests((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label],
    );
  };

  const addCustomInterest = () => {
    const trimmed = customInterest.trim();
    if (trimmed.length === 0) return;
    setInterests((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomInterest('');
  };

  const save = () => {
    setServerError(null);
    const parsed = updateChildSchema.safeParse({
      name: name.trim(),
      ageRange: ageRange ?? undefined,
      interests,
    });
    if (!parsed.success || name.trim().length === 0 || ageRange == null) {
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
    <Screen>
      <ScreenHeader title={child.name} />

      <View style={styles.form}>
        <Input
          label={t('childSetup.nameLabel')}
          placeholder={t('childSetup.namePlaceholder')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          accessibilityLabel={t('childSetup.nameLabel')}
        />

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            {t('childSetup.ageRangeLabel').toLocaleUpperCase('tr')}
          </Text>
          <View style={styles.ageGrid}>
            {AGE_RANGES.map((range) => {
              const selected = ageRange === range;
              const label = `${AGE_RANGE_LABELS[range]} ${t('wizard.ageUnit')}`;
              return (
                <SelectableCard
                  key={range}
                  selected={selected}
                  onPress={() => setAgeRange(range)}
                  showCheck={false}
                  style={styles.ageCard}
                  accessibilityLabel={label}
                >
                  <Text style={[styles.ageLabel, selected && styles.ageLabelSelected]}>
                    {label}
                  </Text>
                </SelectableCard>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            {t('childSetup.interestsTitle').toLocaleUpperCase('tr')}
          </Text>
          <Text style={styles.fieldHint}>{t('childSetup.interestsSubtitle')}</Text>
          <View style={styles.chipWrap}>
            {INTEREST_KEYS.map((key) => {
              const label = t(`childSetup.interests.${key}`);
              return (
                <Chip
                  key={key}
                  label={label}
                  selected={interests.includes(label)}
                  onPress={() => toggleInterest(label)}
                />
              );
            })}
            {customInterests.map((label) => (
              <Chip key={label} label={label} selected onPress={() => toggleInterest(label)} />
            ))}
            <Chip
              label={t('childSetup.addCustomInterest')}
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
        </View>

        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}

        <Button label={t('common.save')} onPress={save} loading={updateMutation.isPending} />

        <View style={styles.dangerZone}>
          <Button
            label={t('common.delete')}
            onPress={() => setConfirmDelete(true)}
            variant="destructive"
            loading={deleteMutation.isPending}
          />
        </View>
      </View>

      <ConfirmSheet
        visible={confirmDelete}
        title={t('childSetup.deleteConfirmTitle')}
        body={t('childSetup.deleteConfirmBody', { name: child.name })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMutation.mutate();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  form: { gap: spacing.xl },
  field: { gap: spacing.xs },
  fieldLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: 0.8,
  },
  fieldHint: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  ageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: spacing.xxs,
  },
  ageCard: {
    flexGrow: 1,
    flexBasis: '40%',
    justifyContent: 'center',
  },
  ageLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  ageLabelSelected: { color: colors.primary, fontFamily: fontFamilies.bodyBold },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  customInput: { flex: 1 },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
  },
  dangerZone: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
});
