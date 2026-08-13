import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AGE_RANGE_LABELS, AgeRange } from '@masalim/types';
import { interestSchema, personNameSchema } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, letterSpacing, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { useAppPrefs } from '../../src/stores/app-prefs';
import { useAuthStore } from '../../src/stores/auth';
import { Button } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { SelectableCard } from '../../src/components/SelectableCard';

const AGE_RANGES: AgeRange[] = [
  AgeRange.AGE_0_2,
  AgeRange.AGE_3_5,
  AgeRange.AGE_6_8,
  AgeRange.AGE_9_12,
];

/** Canonical interests (design brief) — keys double as backend interest IDs. */
const CANONICAL_INTERESTS: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'dinozorlar', emoji: '🦕' },
  { key: 'uzay', emoji: '🚀' },
  { key: 'hayvanlar', emoji: '🐾' },
  { key: 'arabalar', emoji: '🚗' },
  { key: 'prensesler', emoji: '👑' },
  { key: 'deniz', emoji: '🌊' },
  { key: 'doğa', emoji: '🌿' },
  { key: 'robotlar', emoji: '🤖' },
  { key: 'futbol', emoji: '⚽' },
  { key: 'periler', emoji: '🧚' },
  { key: 'macera', emoji: '🗺️' },
  { key: 'müzik', emoji: '🎵' },
];

/** Child profile creation — onboarding step after the first sign-in. */
export default function NewChild() {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
  const [ageRangeError, setAgeRangeError] = useState<string | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const toggleInterest = (key: string) => {
    setSelectedInterests((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const addCustomInterest = () => {
    const parsed = interestSchema.safeParse(customText);
    if (!parsed.success) return;
    const value = parsed.data;
    const exists =
      customInterests.some((c) => c.toLocaleLowerCase('tr') === value.toLocaleLowerCase('tr')) ||
      CANONICAL_INTERESTS.some((c) => c.key === value.toLocaleLowerCase('tr'));
    if (!exists) {
      setCustomInterests((prev) => [...prev, value]);
    }
    setCustomText('');
  };

  const removeCustomInterest = (value: string) => {
    setCustomInterests((prev) => prev.filter((c) => c !== value));
  };

  const onSubmit = async () => {
    setServerError(null);

    const parsedName = personNameSchema.safeParse(name);
    setNameError(parsedName.success ? null : t('errors.VALIDATION_FAILED'));
    setAgeRangeError(ageRange == null ? t('errors.VALIDATION_FAILED') : null);
    if (!parsedName.success || ageRange == null) return;

    setSubmitting(true);
    try {
      const created = await api.children.create({
        name: parsedName.data,
        ageRange,
        interests: [...selectedInterests, ...customInterests],
        preferences: {},
      });
      useAppPrefs.getState().setSelectedChildId(created.id);
      await api.users.updateMe({ onboardingCompleted: true });
      const { user, setUser } = useAuthStore.getState();
      if (user != null) {
        setUser({ ...user, onboardingCompleted: true });
      }
      router.replace('/(tabs)/home');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof z.ZodError) {
        setServerError(t('errors.VALIDATION_FAILED'));
      } else if (err instanceof NetworkError) {
        setServerError(t('errors.OFFLINE'));
      } else {
        setServerError(t('errors.GENERIC'));
      }
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          {t('childSetup.title')}
        </Text>
        <Text style={styles.subtitle}>{t('childSetup.subtitle')}</Text>

        <Input
          label={t('childSetup.nameLabel')}
          placeholder={t('childSetup.namePlaceholder')}
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (nameError != null) setNameError(null);
          }}
          autoCapitalize="words"
          error={nameError ?? undefined}
        />

        <Text style={styles.sectionLabel}>
          {t('childSetup.ageRangeLabel').toLocaleUpperCase('tr')}
        </Text>
        <View style={styles.ageGrid} accessibilityRole="radiogroup">
          {AGE_RANGES.map((range) => {
            const selected = ageRange === range;
            return (
              <SelectableCard
                key={range}
                selected={selected}
                glow={false}
                showCheck={false}
                onPress={() => {
                  setAgeRange(range);
                  if (ageRangeError != null) setAgeRangeError(null);
                }}
                accessibilityLabel={`${AGE_RANGE_LABELS[range]} ${t('wizard.ageUnit')}`}
                style={styles.ageTile}
              >
                <View style={styles.ageTileContent}>
                  <Text style={[styles.ageValue, selected && styles.ageValueSelected]}>
                    {AGE_RANGE_LABELS[range]}
                  </Text>
                  <Text style={styles.ageUnit}>{t('wizard.ageUnit')}</Text>
                </View>
              </SelectableCard>
            );
          })}
        </View>
        {ageRangeError != null ? <Text style={styles.fieldError}>{ageRangeError}</Text> : null}

        <Text style={styles.sectionLabel}>
          {t('childSetup.interestsTitle').toLocaleUpperCase('tr')}
        </Text>
        <Text style={styles.sectionHint}>{t('childSetup.interestsSubtitle')}</Text>
        <View style={styles.chipGrid}>
          {CANONICAL_INTERESTS.map((interest) => (
            <Chip
              key={interest.key}
              label={t(`childSetup.interests.${interest.key}`)}
              emoji={interest.emoji}
              selected={selectedInterests.includes(interest.key)}
              onPress={() => toggleInterest(interest.key)}
            />
          ))}
          {customInterests.map((custom) => (
            <Chip
              key={custom}
              label={custom}
              emoji="✨"
              selected
              onPress={() => removeCustomInterest(custom)}
            />
          ))}
          <Chip
            label={t('childSetup.addCustomInterest')}
            emoji="➕"
            selected={customOpen}
            onPress={() => setCustomOpen((open) => !open)}
          />
        </View>

        {customOpen ? (
          <View style={styles.customRow}>
            <View style={styles.customInput}>
              <Input
                placeholder={t('childSetup.customInterestPlaceholder')}
                value={customText}
                onChangeText={setCustomText}
                autoCapitalize="sentences"
                returnKeyType="done"
                onSubmitEditing={addCustomInterest}
              />
            </View>
            <Button
              label={t('common.save')}
              variant="secondary"
              compact
              onPress={addCustomInterest}
              disabled={customText.trim().length === 0}
              style={styles.customAddButton}
            />
          </View>
        ) : null}

        {serverError != null ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {serverError}
          </Text>
        ) : null}

        <Button
          label={t('childSetup.createChild')}
          onPress={() => void onSubmit()}
          loading={submitting}
          style={styles.cta}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.display,
    color: colors.foreground,
    letterSpacing: -0.3,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  sectionHint: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
  },
  ageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  ageTile: {
    flexBasis: '47%',
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  ageTileContent: { alignItems: 'center', gap: 2 },
  ageValue: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.foreground,
  },
  ageValueSelected: { color: colors.primary },
  ageUnit: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  fieldError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.destructive,
    marginTop: spacing.xs,
  },
  chipGrid: {
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
  customAddButton: { paddingHorizontal: spacing.md },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginTop: spacing.lg,
  },
  cta: { marginTop: spacing.xl },
});
