import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { interestSchema, personNameSchema } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, letterSpacing, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import {
  ageFromYearMonth,
  ageRangeFromYears,
  birthDateFromYearMonth,
  defaultBirthYearMonth,
} from '../../src/lib/age';
import { CANONICAL_INTERESTS, isCanonicalInterest } from '../../src/lib/interests';
import { useAppPrefs } from '../../src/stores/app-prefs';
import { useAuthStore } from '../../src/stores/auth';
import { AvatarEmojiPicker, DEFAULT_AVATAR_EMOJI } from '../../src/components/AvatarEmojiPicker';
import { BirthMonthPicker } from '../../src/components/BirthMonthPicker';
import { Button } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';

/**
 * Child profile creation (design Child/01-CreateProfile). Two entry modes:
 * forced onboarding after the first sign-in (no back, replaces to Home), or a
 * plain "add child" for already-onboarded users (back header, pops on success).
 */
export default function NewChild() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Snapshot at mount — the forced flow flips the flag right before navigating
  // away, and the header must not re-render into back-button mode meanwhile.
  const [alreadyOnboarded] = useState(
    () => useAuthStore.getState().user?.onboardingCompleted === true,
  );

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarEmoji, setAvatarEmoji] = useState<string>(DEFAULT_AVATAR_EMOJI);
  const [birth, setBirth] = useState(() => defaultBirthYearMonth());
  const ageYears = ageFromYearMonth(birth);
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
      isCanonicalInterest(value.toLocaleLowerCase('tr'));
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
    if (!parsedName.success) return;

    setSubmitting(true);
    try {
      const created = await api.children.create({
        name: parsedName.data,
        birthDate: birthDateFromYearMonth(birth),
        ageRange: ageRangeFromYears(ageYears),
        interests: [...selectedInterests, ...customInterests],
        // ageYears kept for back-compat with the stable app's age display.
        preferences: { avatarEmoji, ageYears },
      });
      useAppPrefs.getState().setSelectedChildId(created.id);
      await queryClient.invalidateQueries({ queryKey: ['children'] });
      if (alreadyOnboarded) {
        router.back();
      } else {
        await api.users.updateMe({ onboardingCompleted: true });
        const { user, setUser } = useAuthStore.getState();
        if (user != null) {
          setUser({ ...user, onboardingCompleted: true });
        }
        router.replace('/(tabs)/home');
      }
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
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Screen>
          {alreadyOnboarded ? (
            <ScreenHeader title={t('childSetup.title')} />
          ) : (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {t('childSetup.title')}
              </Text>
              <Text style={styles.subtitle}>{t('childSetup.subtitle')}</Text>
            </>
          )}

          <AvatarEmojiPicker value={avatarEmoji} onChange={setAvatarEmoji} />

          <View style={styles.nameField}>
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
              emoji="+"
              dashed
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
        </Screen>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button
            label={t('childSetup.createChild')}
            onPress={() => void onSubmit()}
            loading={submitting}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
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
  nameField: { marginTop: spacing.xl },
  sectionLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  birthHelper: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  sectionHint: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
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
  footer: {
    paddingHorizontal: spacing.pageX,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
});
