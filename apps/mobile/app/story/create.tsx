import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AGE_RANGE_LABELS,
  AgeRange,
  DURATION_TARGETS,
  HeroType,
  StoryDuration,
  StoryTheme,
  type SystemVoiceCategory,
} from '@masalim/types';
import type { CreateStoryInput } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { withSuffix } from '@masalim/localization';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { usePreviewPlayer } from '../../src/lib/preview-player';
import { useAppPrefs } from '../../src/stores/app-prefs';
import { useWizardStore } from '../../src/stores/wizard';
import { AudioPreviewButton } from '../../src/components/AudioPreviewButton';
import { Avatar } from '../../src/components/Avatar';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { childAvatarEmoji } from '../../src/components/ChildSwitcherSheet';
import { Chip } from '../../src/components/Chip';
import { Input } from '../../src/components/Input';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SelectableCard } from '../../src/components/SelectableCard';
import { ErrorState } from '../../src/components/states';

const TOTAL_STEPS = 5;

const THEME_EMOJIS: Record<StoryTheme, string> = {
  ADVENTURE: '⚔️',
  SLEEP: '🌙',
  FRIENDSHIP: '🤝',
  COURAGE: '💪',
  ANIMALS: '🐾',
  SPACE: '🚀',
  FAIRY_TALE: '🧚',
  EMOTIONS: '💛',
  EDUCATIONAL: '📚',
  FANTASY: '🐉',
  SEA: '🌊',
  NATURE: '🌿',
  IMAGINATION: '✨',
};

/** The 10 tiles from the design; other themes appear only when already selected. */
const BASE_THEMES: StoryTheme[] = [
  StoryTheme.ADVENTURE,
  StoryTheme.SLEEP,
  StoryTheme.FRIENDSHIP,
  StoryTheme.COURAGE,
  StoryTheme.ANIMALS,
  StoryTheme.SPACE,
  StoryTheme.FAIRY_TALE,
  StoryTheme.EMOTIONS,
  StoryTheme.EDUCATIONAL,
  StoryTheme.FANTASY,
];

const HERO_TYPES: ReadonlyArray<{ type: HeroType; emoji: string }> = [
  { type: HeroType.CHILD, emoji: '🧒' },
  { type: HeroType.ANIMAL, emoji: '🐾' },
  { type: HeroType.FANTASY, emoji: '🧚' },
  { type: HeroType.ROBOT, emoji: '🤖' },
  { type: HeroType.CUSTOM, emoji: '✨' },
];

const AGE_RANGES: AgeRange[] = [
  AgeRange.AGE_0_2,
  AgeRange.AGE_3_5,
  AgeRange.AGE_6_8,
  AgeRange.AGE_9_12,
];

const DURATIONS: ReadonlyArray<{ duration: StoryDuration; emoji: string }> = [
  { duration: StoryDuration.SHORT, emoji: '⚡' },
  { duration: StoryDuration.MEDIUM, emoji: '📖' },
  { duration: StoryDuration.LONG, emoji: '🌙' },
];

/** System voices carry no emoji in the API — derive one from the category. */
const VOICE_CATEGORY_EMOJIS: Record<SystemVoiceCategory, string> = {
  CALM: '🌙',
  CHEERFUL: '⭐',
  FAIRYTALE: '🧚',
  ENERGETIC: '⚡',
};

function isStoryTheme(value: unknown): value is StoryTheme {
  return (
    typeof value === 'string' &&
    (Object.values(StoryTheme) as string[]).includes(value)
  );
}

/** 5-step story creation wizard (§ StoryCreation design reference). */
export default function CreateStory() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const preview = usePreviewPlayer();
  const scrollRef = useRef<ScrollView>(null);
  const { theme: themeParam } = useLocalSearchParams<{ theme?: string }>();
  const selectedChildId = useAppPrefs((state) => state.selectedChildId);

  const step = useWizardStore((state) => state.step);
  const initialized = useWizardStore((state) => state.initialized);
  const childId = useWizardStore((state) => state.childId);
  const heroMode = useWizardStore((state) => state.heroMode);
  const heroName = useWizardStore((state) => state.heroName);
  const heroType = useWizardStore((state) => state.heroType);
  const themes = useWizardStore((state) => state.themes);
  const customPrompt = useWizardStore((state) => state.customPrompt);
  const ageRange = useWizardStore((state) => state.ageRange);
  const durationTarget = useWizardStore((state) => state.durationTarget);
  const voiceId = useWizardStore((state) => state.voiceId);

  const setStep = useWizardStore((state) => state.setStep);
  const selectChild = useWizardStore((state) => state.selectChild);
  const selectGeneral = useWizardStore((state) => state.selectGeneral);
  const setHeroMode = useWizardStore((state) => state.setHeroMode);
  const setHeroName = useWizardStore((state) => state.setHeroName);
  const setHeroType = useWizardStore((state) => state.setHeroType);
  const toggleTheme = useWizardStore((state) => state.toggleTheme);
  const setThemes = useWizardStore((state) => state.setThemes);
  const applySuggestion = useWizardStore((state) => state.applySuggestion);
  const setCustomPrompt = useWizardStore((state) => state.setCustomPrompt);
  const setAgeRange = useWizardStore((state) => state.setAgeRange);
  const setDurationTarget = useWizardStore((state) => state.setDurationTarget);
  const setVoiceId = useWizardStore((state) => state.setVoiceId);

  const [heroNameError, setHeroNameError] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [premiumHintVoiceId, setPremiumHintVoiceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const childrenQuery = useQuery({ queryKey: ['children'], queryFn: () => api.children.list() });
  const voicesQuery = useQuery({ queryKey: ['systemVoices'], queryFn: () => api.voices.system() });
  const entitlementsQuery = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.subscription.entitlements(),
  });
  const recommendationsQuery = useQuery({
    queryKey: ['recommendations', childId],
    queryFn: () =>
      childId == null ? Promise.resolve([]) : api.children.recommendations(childId),
    enabled: childId != null,
  });

  const childList = childrenQuery.data;
  const voices = voicesQuery.data;
  const recommendations = recommendationsQuery.data ?? [];
  const canUsePremiumVoices =
    entitlementsQuery.data?.features.premium_system_voices === true;

  // One-time prefill: selected child from app prefs (fallback: first child) + route theme.
  useEffect(() => {
    if (initialized || childList == null) {
      return;
    }
    const child = childList.find((item) => item.id === selectedChildId) ?? childList[0] ?? null;
    const routeTheme = isStoryTheme(themeParam) ? themeParam : null;
    useWizardStore.getState().initialize({
      child: child == null ? null : { id: child.id, name: child.name, ageRange: child.ageRange },
      theme: routeTheme,
    });
  }, [initialized, childList, selectedChildId, themeParam]);

  // Default narrator: first voice the user is entitled to.
  useEffect(() => {
    if (voiceId != null || voices == null) {
      return;
    }
    const firstSelectable = voices.find((voice) => !voice.premiumOnly || canUsePremiumVoices);
    if (firstSelectable != null) {
      useWizardStore.getState().setVoiceId(firstSelectable.id);
    }
  }, [voiceId, voices, canUsePremiumVoices]);

  // Each step starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const selectedChild = childList?.find((child) => child.id === childId) ?? null;
  const heroDisplayName = selectedChild?.name ?? heroName.trim();

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  const goNext = () => {
    if (step === 2) {
      const isCustomHero = heroMode === 'custom' || selectedChild == null;
      if (isCustomHero && heroName.trim().length === 0) {
        setHeroNameError(t('wizard.validationHeroName'));
        return;
      }
      setHeroNameError(null);
      if (!isCustomHero && selectedChild != null) {
        setHeroName(selectedChild.name);
        setHeroType(HeroType.CHILD);
      }
    }
    if (step === 3 && themes.length === 0) {
      // Backend requires ≥1 theme — soft-default to the child's first
      // recommendation theme (or Adventure) and reflect it as selected.
      const fallback =
        recommendations.flatMap((rec) => rec.themes).find(isStoryTheme) ?? StoryTheme.ADVENTURE;
      setThemes([fallback]);
    }
    setStep(Math.min(step + 1, TOTAL_STEPS));
  };

  const onSubmit = async () => {
    setSubmitError(null);
    setQuotaError(false);
    setModerationError(null);
    setSubmitting(true);
    try {
      const trimmedPrompt = customPrompt.trim();
      const input: CreateStoryInput = {
        childId,
        heroName: heroName.trim(),
        heroType,
        themes,
        ageRange,
        durationTarget,
        customPrompt: trimmedPrompt.length > 0 ? trimmedPrompt : undefined,
        advanced: {},
        language: 'tr',
      };
      const story = await api.stories.create(input);
      const { jobId } = await api.stories.generate(story.id);
      await queryClient.invalidateQueries({ queryKey: ['stories'] });
      // Step-5 narrator rides along so the narration screen preselects it.
      const voiceParam = voiceId != null ? `&voiceId=${voiceId}` : '';
      router.replace(`/story/generating/${jobId}?storyId=${story.id}${voiceParam}` as never);
      useWizardStore.getState().reset();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'MODERATION_REJECTED') {
          setModerationError(t('errors.MODERATION_REJECTED'));
          setStep(3);
        } else if (err.code === 'QUOTA_EXCEEDED') {
          // Full-screen quota stop; the inline banner stays as a fallback so
          // dismissing the screen never leaves a dead end.
          setQuotaError(true);
          router.push('/subscription/quota' as never);
        } else {
          setSubmitError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
        }
      } else if (err instanceof NetworkError) {
        setSubmitError(t('errors.OFFLINE'));
      } else {
        setSubmitError(t('errors.GENERIC'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep1 = () => (
    <>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('wizard.step1Title')}
      </Text>
      <Text style={styles.stepSubtitle}>{t('wizard.step1Subtitle')}</Text>
      {childrenQuery.isError ? (
        <ErrorState
          emoji="🌧️"
          title={t('errors.GENERIC')}
          ctaLabel={t('common.retry')}
          onCta={() => void childrenQuery.refetch()}
        />
      ) : childList == null || !initialized ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.loader}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        <View style={styles.cardList}>
          {childList.map((child) => (
            <SelectableCard
              key={child.id}
              glow
              selected={childId === child.id}
              onPress={() =>
                selectChild({ id: child.id, name: child.name, ageRange: child.ageRange })
              }
              accessibilityLabel={child.name}
            >
              <Avatar emoji={childAvatarEmoji(child.name)} size={48} kind="child" />
              <View>
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.childAge}>
                  {`${AGE_RANGE_LABELS[child.ageRange]} ${t('wizard.ageUnit')}`}
                </Text>
              </View>
            </SelectableCard>
          ))}
          <SelectableCard
            glow
            selected={childId == null}
            onPress={selectGeneral}
            accessibilityLabel={t('wizard.generalStory')}
          >
            <Avatar emoji="🌟" size={48} kind="child" />
            <Text style={styles.childName}>{t('wizard.generalStory')}</Text>
          </SelectableCard>
          <Pressable
            onPress={() => router.push('/children/new' as never)}
            accessibilityRole="button"
            accessibilityLabel={t('wizard.anotherChild')}
            style={({ pressed }) => [styles.addChildCard, { opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={styles.addChildCircle}>
              <Text style={styles.addChildPlus}>+</Text>
            </View>
            <Text style={styles.addChildLabel}>{t('wizard.anotherChild')}</Text>
          </Pressable>
        </View>
      )}
    </>
  );

  const renderStep2 = () => (
    <>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('wizard.step2Title')}
      </Text>
      {selectedChild != null ? (
        <Text style={styles.stepSubtitle}>
          {t('wizard.step2Subtitle', { childNameNom: selectedChild.name })}
        </Text>
      ) : (
        <Text style={styles.stepSubtitle}>{t('wizard.customHeroSub')}</Text>
      )}
      <View style={styles.cardList}>
        {selectedChild != null ? (
          <SelectableCard
            selected={heroMode === 'child'}
            onPress={() => {
              setHeroMode('child');
              setHeroName(selectedChild.name);
              setHeroType(HeroType.CHILD);
              setHeroNameError(null);
            }}
            accessibilityLabel={t('wizard.childAsHero', { name: selectedChild.name })}
          >
            <Text style={styles.heroEmoji}>🧒</Text>
            <View style={styles.cardTextBlock}>
              <Text style={styles.heroCardTitle}>
                {t('wizard.childAsHero', { name: selectedChild.name })}
              </Text>
              <Text style={styles.heroCardSub}>
                {t('wizard.childAsHeroSub', { name: selectedChild.name })}
              </Text>
            </View>
          </SelectableCard>
        ) : null}
        <SelectableCard
          selected={heroMode === 'custom'}
          onPress={() => {
            if (heroMode === 'child') {
              setHeroName('');
            }
            setHeroMode('custom');
          }}
          accessibilityLabel={t('wizard.customHero')}
        >
          <Text style={styles.heroEmoji}>✨</Text>
          <View style={styles.cardTextBlock}>
            <Text style={styles.heroCardTitle}>{t('wizard.customHero')}</Text>
            <Text style={styles.heroCardSub}>{t('wizard.customHeroSub')}</Text>
          </View>
        </SelectableCard>
      </View>
      {heroMode === 'custom' ? (
        <Animated.View entering={FadeInUp.duration(300)} style={styles.customHeroBlock}>
          <Input
            label={t('wizard.heroNameLabel')}
            placeholder={t('wizard.heroNamePlaceholder')}
            value={heroName}
            onChangeText={(text) => {
              setHeroName(text);
              if (heroNameError != null) {
                setHeroNameError(null);
              }
            }}
            error={heroNameError ?? undefined}
            autoCapitalize="words"
            maxLength={60}
          />
          <View>
            <Text style={styles.fieldLabel}>
              {t('wizard.heroTypeLabel').toLocaleUpperCase('tr')}
            </Text>
            <View style={styles.chipRow}>
              {HERO_TYPES.map(({ type, emoji }) => (
                <Chip
                  key={type}
                  emoji={emoji}
                  label={t(`wizard.heroTypes.${type}`)}
                  selected={heroType === type}
                  onPress={() => setHeroType(type)}
                />
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </>
  );

  const renderStep3 = () => {
    const themeTiles = [
      ...BASE_THEMES,
      ...themes.filter((theme) => !BASE_THEMES.includes(theme)),
    ];
    return (
      <>
        <Text style={styles.stepTitle} accessibilityRole="header">
          {t('wizard.step3Title')}
        </Text>
        <Text style={styles.stepSubtitle}>{t('wizard.step3Subtitle')}</Text>
        {selectedChild != null && recommendations.length > 0 ? (
          <View style={styles.suggestionCard}>
            <Text style={styles.suggestionSparkle}>✨</Text>
            <View style={styles.suggestionBody}>
              <Text style={styles.suggestionTitle}>
                {t('wizard.suggestionTitle', { name: selectedChild.name })}
              </Text>
              <View style={styles.suggestionChips}>
                {recommendations.map((rec) => (
                  <Pressable
                    key={rec.title}
                    onPress={() => {
                      applySuggestion(rec.themes.filter(isStoryTheme), rec.promptSeed);
                      setModerationError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={rec.title}
                    style={({ pressed }) => [styles.suggestionChip, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={styles.suggestionChipText}>{`${rec.emoji} ${rec.title}`}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ) : null}
        <View style={styles.themeGrid}>
          {themeTiles.map((theme) => {
            const selected = themes.includes(theme);
            return (
              <SelectableCard
                key={theme}
                selected={selected}
                onPress={() => toggleTheme(theme)}
                showCheck={false}
                style={styles.themeTile}
                accessibilityLabel={t(`wizard.themes.${theme}`)}
              >
                <Text style={styles.themeEmoji}>{THEME_EMOJIS[theme]}</Text>
                <Text style={[styles.themeLabel, selected && styles.themeLabelSelected]}>
                  {t(`wizard.themes.${theme}`)}
                </Text>
              </SelectableCard>
            );
          })}
        </View>
        <Text style={styles.ideaLabel}>{t('wizard.customIdeaLabel')}</Text>
        <Input
          placeholder={t('wizard.customIdeaPlaceholder', { name: heroDisplayName })}
          value={customPrompt}
          onChangeText={(text) => {
            setCustomPrompt(text);
            if (moderationError != null) {
              setModerationError(null);
            }
          }}
          error={moderationError ?? undefined}
          multiline
          numberOfLines={3}
          maxLength={500}
          style={styles.ideaInput}
        />
        <Text style={styles.ideaHelper}>{t('wizard.customIdeaHelper')}</Text>
      </>
    );
  };

  const renderStep4 = () => (
    <>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('wizard.step4Title')}
      </Text>
      <Text style={styles.stepSubtitle}>{t('wizard.step4Subtitle')}</Text>
      <Text style={styles.sectionLabel}>{t('wizard.ageGroupLabel').toLocaleUpperCase('tr')}</Text>
      <View style={styles.ageGrid}>
        {AGE_RANGES.map((range) => {
          const selected = ageRange === range;
          return (
            <SelectableCard
              key={range}
              selected={selected}
              onPress={() => setAgeRange(range)}
              showCheck={false}
              style={styles.ageTile}
              accessibilityLabel={`${AGE_RANGE_LABELS[range]} ${t('wizard.ageUnit')}`}
            >
              <View style={styles.ageTileInner}>
                <Text style={[styles.ageValue, selected && styles.ageValueSelected]}>
                  {AGE_RANGE_LABELS[range]}
                </Text>
                <Text style={styles.ageUnit}>{t('wizard.ageUnit')}</Text>
              </View>
            </SelectableCard>
          );
        })}
      </View>
      <Text style={styles.sectionLabel}>{t('wizard.durationLabel').toLocaleUpperCase('tr')}</Text>
      <View style={styles.cardList}>
        {DURATIONS.map(({ duration, emoji }) => {
          const selected = durationTarget === duration;
          return (
            <SelectableCard
              key={duration}
              selected={selected}
              onPress={() => setDurationTarget(duration)}
              accessibilityLabel={t(`wizard.durations.${duration}`)}
            >
              <Text style={styles.durationEmoji}>{emoji}</Text>
              <View style={styles.cardTextBlock}>
                <Text style={[styles.durationLabel, selected && styles.durationLabelSelected]}>
                  {t(`wizard.durations.${duration}`)}
                </Text>
                <Text style={styles.durationSub}>{t(`wizard.durationSubs.${duration}`)}</Text>
              </View>
            </SelectableCard>
          );
        })}
      </View>
    </>
  );

  const renderStep5 = () => (
    <>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('wizard.step5Title')}
      </Text>
      <Text style={styles.stepSubtitle}>
        {t('wizard.step5Subtitle', {
          childNameAcc: withSuffix(heroDisplayName, 'acc'),
        })}
      </Text>
      {voicesQuery.isError ? (
        <ErrorState
          emoji="🌧️"
          title={t('errors.GENERIC')}
          ctaLabel={t('common.retry')}
          onCta={() => void voicesQuery.refetch()}
        />
      ) : voices == null ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.loader}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        <View style={styles.cardList}>
          {voices.map((voice) => {
            const gated = voice.premiumOnly && !canUsePremiumVoices;
            return (
              <View key={voice.id}>
                <SelectableCard
                  glow
                  selected={voiceId === voice.id}
                  onPress={() => {
                    if (gated) {
                      setPremiumHintVoiceId(voice.id);
                      return;
                    }
                    setPremiumHintVoiceId(null);
                    setVoiceId(voice.id);
                  }}
                  accessibilityLabel={voice.displayName}
                >
                  <Avatar
                    emoji={VOICE_CATEGORY_EMOJIS[voice.category]}
                    size={44}
                    kind="systemVoice"
                  />
                  <View style={styles.cardTextBlock}>
                    <View style={styles.voiceNameRow}>
                      <Text style={styles.voiceName}>{voice.displayName}</Text>
                      {voice.premiumOnly ? (
                        <Badge label={t('wizard.premiumBadge')} variant="premium" uppercase />
                      ) : null}
                    </View>
                    <Text style={styles.voiceDescription}>{voice.description}</Text>
                  </View>
                  <AudioPreviewButton
                    size="sm"
                    status={preview.statusFor(voice.id)}
                    onPress={() =>
                      preview.toggle(voice.id, () =>
                        voice.previewUrl != null
                          ? Promise.resolve(voice.previewUrl)
                          : api.voices.systemPreview(voice.id).then((r) => r.previewUrl),
                      )
                    }
                  />
                </SelectableCard>
                {gated && premiumHintVoiceId === voice.id ? (
                  <Animated.Text entering={FadeInUp.duration(250)} style={styles.premiumHint}>
                    {t('errors.ENTITLEMENT_REQUIRED')}
                  </Animated.Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </>
  );

  const selectedVoice = voices?.find((voice) => voice.id === voiceId) ?? null;
  const summaryThemes =
    themes
      .slice(0, 2)
      .map((theme) => t(`wizard.themes.${theme}`))
      .join(' + ') || t('wizard.summaryFallbackTheme');
  const summaryItems = [
    { icon: '🧒', label: heroDisplayName },
    { icon: '🎭', label: summaryThemes },
    {
      icon: '⏱',
      label: t('common.minutesShort', { count: DURATION_TARGETS[durationTarget].minutes }),
    },
    { icon: '🎙', label: selectedVoice?.displayName ?? t('wizard.summaryFallbackVoice') },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <ScreenHeader eyebrow={t('wizard.eyebrow')} onBack={goBack} />
        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <View
              key={index}
              style={[
                styles.progressSegment,
                index < step ? styles.progressFilled : styles.progressEmpty,
              ]}
            />
          ))}
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: step === TOTAL_STEPS ? 300 : 200 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View key={`step-${step}`} entering={FadeInUp.duration(400)}>
          {step === 1 ? renderStep1() : null}
          {step === 2 ? renderStep2() : null}
          {step === 3 ? renderStep3() : null}
          {step === 4 ? renderStep4() : null}
          {step === 5 ? renderStep5() : null}
        </Animated.View>
      </ScrollView>

      {/* Fixed bottom CTA over a cream scrim. */}
      <View style={styles.footer} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(250,248,244,0)', colors.background]}
          locations={[0, 0.45]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          style={[styles.footerContent, { paddingBottom: Math.max(insets.bottom, 24) + 8 }]}
          pointerEvents="box-none"
        >
          {step < TOTAL_STEPS ? (
            <Button
              label={t('common.continue')}
              onPress={goNext}
              disabled={step === 1 && !initialized}
            />
          ) : (
            <>
              <View style={styles.summaryCard}>
                {summaryItems.map((item) => (
                  <View key={item.icon} style={styles.summaryItem}>
                    <Text style={styles.summaryIcon}>{item.icon}</Text>
                    <Text style={styles.summaryLabel} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                ))}
              </View>
              {quotaError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>
                    {t('subscription.quotaReachedStories')}
                  </Text>
                </View>
              ) : null}
              {submitError != null ? <Text style={styles.submitError}>{submitError}</Text> : null}
              <Button
                label={t('wizard.generateCta')}
                onPress={() => void onSubmit()}
                loading={submitting}
              />
              <Text style={styles.footnote}>{t('wizard.generateEta')}</Text>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.pageX },
  progressRow: { flexDirection: 'row', gap: 4, marginTop: -8, marginBottom: 16 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  progressFilled: { backgroundColor: colors.primary },
  progressEmpty: { backgroundColor: colors.border },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.pageX },
  stepTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.display,
    color: colors.foreground,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    marginBottom: spacing.xl,
  },
  loader: { marginVertical: spacing.xxxl },
  cardList: { gap: 10 },
  childName: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.foreground,
    marginBottom: 2,
  },
  childAge: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  addChildCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  addChildCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChildPlus: { fontSize: 22, color: colors.mutedForeground, fontFamily: fontFamilies.bodySemiBold },
  addChildLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
  },
  heroEmoji: { fontSize: 28 },
  cardTextBlock: { flex: 1, gap: 2 },
  heroCardTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  heroCardSub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  customHeroBlock: { marginTop: spacing.xl, gap: spacing.md },
  fieldLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: 'rgba(176,156,224,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,191,0.2)',
    marginBottom: spacing.md,
  },
  suggestionSparkle: { fontSize: 18 },
  suggestionBody: { flex: 1 },
  suggestionTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.primary,
    marginBottom: 6,
  },
  suggestionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestionChip: {
    backgroundColor: colors.secondary,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  suggestionChipText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  themeTile: { width: '48%', paddingVertical: 14, paddingHorizontal: 14, gap: 10 },
  themeEmoji: { fontSize: 22 },
  themeLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    flexShrink: 1,
  },
  themeLabelSelected: { color: colors.primary },
  ideaLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  ideaInput: { minHeight: 92, textAlignVertical: 'top' },
  ideaHelper: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    marginTop: 6,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
    letterSpacing: letterSpacing.eyebrow,
    marginBottom: 10,
  },
  ageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xl },
  ageTile: { width: '48%', paddingVertical: 14, paddingHorizontal: 14 },
  ageTileInner: { flex: 1, alignItems: 'center' },
  ageValue: { fontFamily: fontFamilies.display, fontSize: fontSizes.h4, color: colors.foreground },
  ageValueSelected: { color: colors.primary },
  ageUnit: { fontFamily: fontFamilies.body, fontSize: fontSizes.xs, color: colors.mutedForeground },
  durationEmoji: { fontSize: 24 },
  durationLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  durationLabelSelected: { color: colors.primary },
  durationSub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  voiceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceName: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg, color: colors.foreground },
  voiceDescription: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  premiumHint: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
    marginTop: 6,
    marginLeft: 4,
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footerContent: { paddingHorizontal: spacing.pageX, paddingTop: spacing.xl, gap: spacing.xs },
  summaryCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  summaryIcon: { fontSize: 13 },
  summaryLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.foreground,
    flexShrink: 1,
  },
  errorBanner: {
    backgroundColor: 'rgba(224,84,84,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(224,84,84,0.25)',
    borderRadius: radius.chip,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  errorBannerText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
  },
  submitError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    textAlign: 'center',
  },
  footnote: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: 4,
  },
});
