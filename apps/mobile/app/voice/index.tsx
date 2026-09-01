import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { VoiceOwnerType, VoiceProfileStatus } from '@masalim/types';
import type { VoiceProfile } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { usePreviewPlayer } from '../../src/lib/preview-player';
import { AudioPreviewButton } from '../../src/components/AudioPreviewButton';
import { Avatar } from '../../src/components/Avatar';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ChevronRightIcon, KebabIcon } from '../../src/components/icons';
import { EmptyState, ErrorState } from '../../src/components/states';

const OWNER_EMOJIS: Record<VoiceOwnerType, string> = {
  [VoiceOwnerType.MOTHER]: '👩',
  [VoiceOwnerType.FATHER]: '👨',
  [VoiceOwnerType.GRANDMOTHER]: '👵',
  [VoiceOwnerType.GRANDFATHER]: '👴',
  [VoiceOwnerType.OTHER]: '🎙',
};

const VOICES_PROCESSING_REFETCH_MS = 3_000;

function formatCreatedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return date.toDateString();
  }
}

/** Gentle opacity pulse for the "Hazırlanıyor" status chip. */
function ProcessingChip({ label }: { label: string }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={[styles.statusChip, styles.statusChipProcessing, pulseStyle]}>
      <Text style={[styles.statusChipText, { color: colors.mutedForeground }]}>{label}</Text>
    </Animated.View>
  );
}

/** Ses Stüdyom — family voice profiles list (design ref: VoiceStudio list view). */
export default function VoiceStudio() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const preview = usePreviewPlayer();

  const [menuVoice, setMenuVoice] = useState<VoiceProfile | null>(null);
  const [renameVoice, setRenameVoice] = useState<VoiceProfile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteVoice, setDeleteVoice] = useState<VoiceProfile | null>(null);
  const [showPremiumNote, setShowPremiumNote] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const voicesQuery = useQuery({
    queryKey: ['voices'],
    queryFn: () => api.voices.list(),
    // Simple honest live-ness: refetch while any profile is still processing.
    refetchInterval: (query) =>
      query.state.data?.some(
        (voice) =>
          voice.status === VoiceProfileStatus.PROCESSING ||
          voice.status === VoiceProfileStatus.RECORDING_UPLOADED,
      )
        ? VOICES_PROCESSING_REFETCH_MS
        : false,
  });
  const entitlementsQuery = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.subscription.entitlements(),
  });
  const canCloneVoice = entitlementsQuery.data?.features.parent_voice_clone;

  const voices = (voicesQuery.data ?? []).filter(
    (voice) => voice.status !== VoiceProfileStatus.DELETED,
  );

  const mapError = (error: unknown): string => {
    if (error instanceof ApiError) {
      return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
    }
    if (error instanceof NetworkError) return t('errors.OFFLINE');
    return t('errors.GENERIC');
  };

  const renameMutation = useMutation({
    mutationFn: (input: { id: string; displayName: string }) =>
      api.voices.rename(input.id, { displayName: input.displayName }),
    onSuccess: async () => {
      setRenameVoice(null);
      await queryClient.invalidateQueries({ queryKey: ['voices'] });
    },
    onError: (error) => setActionError(mapError(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.voices.remove(id),
    onSuccess: async () => {
      setDeleteVoice(null);
      await queryClient.invalidateQueries({ queryKey: ['voices'] });
    },
    onError: (error) => {
      setDeleteVoice(null);
      setActionError(mapError(error));
    },
  });

  const openCreate = () => {
    // Premium gate (§36): parent voice clone is a premium feature — the user
    // learns this BEFORE recording, via an inline notice with an upgrade CTA.
    if (canCloneVoice === false) {
      setShowPremiumNote(true);
      return;
    }
    setShowPremiumNote(false);
    router.push('/voice/create' as never);
  };

  const openReRecord = (voice: VoiceProfile) => {
    setMenuVoice(null);
    router.push(
      `/voice/create?recreateId=${encodeURIComponent(voice.id)}&ownerType=${encodeURIComponent(
        voice.ownerType,
      )}&displayName=${encodeURIComponent(voice.displayName)}` as never,
    );
  };

  const renderStatusChip = (voice: VoiceProfile) => {
    switch (voice.status) {
      case VoiceProfileStatus.READY:
        return <Badge label={t('voice.statusReady')} variant="success" />;
      case VoiceProfileStatus.FAILED:
        return (
          <View style={[styles.statusChip, styles.statusChipFailed]}>
            <Text style={[styles.statusChipText, { color: colors.destructive }]}>
              {t('voice.statusFailed')}
            </Text>
          </View>
        );
      // RECORDING_UPLOADED is the pre-processing beat — same "preparing" copy.
      default:
        return <ProcessingChip label={t('voice.statusProcessing')} />;
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('voice.studioTitle')} />

      {/* Hero card — lavender tint per the reference. */}
      <LinearGradient
        colors={['rgba(176,156,224,0.15)', 'rgba(124,92,191,0.1)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <Text style={styles.heroTitle}>{t('voice.heroTitle')}</Text>
        <Text style={styles.heroSubtitle}>{t('voice.heroSubtitle')}</Text>
      </LinearGradient>

      {voicesQuery.isError ? (
        <ErrorState
          emoji="🌧️"
          title={mapError(voicesQuery.error)}
          ctaLabel={t('common.retry')}
          onCta={() => void voicesQuery.refetch()}
        />
      ) : voicesQuery.data == null ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.loader}
          accessibilityLabel={t('common.loading')}
        />
      ) : voices.length === 0 ? (
        <>
          <EmptyState emoji="🎙" title={t('voice.emptyTitle')} ctaLabel={t('voice.emptyCta')} onCta={openCreate} />
          {showPremiumNote ? (
            <View style={styles.premiumNoteCard}>
              <Badge label={t('subscription.premiumPlan')} variant="premium" />
              <Text style={styles.premiumNoteText}>{t('voice.introPremiumNote')}</Text>
              <Button
                label={t('subscription.subscribe')}
                onPress={() => router.push('/subscription/paywall' as never)}
                compact
              />
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.sectionLabel}>
            {t('voice.familyVoices').toLocaleUpperCase('tr')}
          </Text>
          <View style={styles.voiceList}>
            {voices.map((voice) => (
              <View key={voice.id} style={[styles.voiceCard, shadows.cardSubtle]}>
                <Avatar emoji={OWNER_EMOJIS[voice.ownerType]} size={48} kind="parentVoice" />
                <View style={styles.voiceInfo}>
                  <View style={styles.voiceTitleRow}>
                    <Text style={styles.voiceName} numberOfLines={1}>
                      {voice.displayName}
                    </Text>
                    {renderStatusChip(voice)}
                  </View>
                  <Text style={styles.voiceMeta} numberOfLines={1}>
                    {`${t(`voice.owners.${voice.ownerType}`)} · ${formatCreatedDate(voice.createdAt)}`}
                  </Text>
                </View>
                {voice.status === VoiceProfileStatus.READY ? (
                  <AudioPreviewButton
                    size="md"
                    status={preview.statusFor(voice.id)}
                    onPress={() =>
                      preview.toggle(voice.id, () =>
                        voice.previewUrl != null
                          ? Promise.resolve(voice.previewUrl)
                          : api.voices.preview(voice.id).then((r) => r.previewUrl),
                      )
                    }
                  />
                ) : null}
                <Pressable
                  onPress={() => setMenuVoice(voice)}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.edit')}
                  style={styles.kebabButton}
                >
                  <KebabIcon />
                </Pressable>
              </View>
            ))}
          </View>
          {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

          <Text style={styles.sectionLabel}>
            {t('voice.addVoiceSection').toLocaleUpperCase('tr')}
          </Text>
          <Pressable
            onPress={openCreate}
            accessibilityRole="button"
            accessibilityLabel={t('voice.addVoiceCta')}
            style={({ pressed }) => [styles.addCard, { opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={styles.addEmojiCircle}>
              <Text style={styles.addEmoji}>🎙</Text>
            </View>
            <View style={styles.addTextBlock}>
              <View style={styles.addTitleRow}>
                <Text style={styles.addTitle}>{t('voice.addVoiceCta')}</Text>
                {canCloneVoice === false ? (
                  <Badge label={t('subscription.premiumPlan')} variant="premium" />
                ) : null}
              </View>
              <Text style={styles.addSub}>{t('voice.addVoiceSub')}</Text>
            </View>
            <ChevronRightIcon color={colors.primary} />
          </Pressable>
          {showPremiumNote ? (
            <View style={styles.premiumNoteCard}>
              <Badge label={t('subscription.premiumPlan')} variant="premium" />
              <Text style={styles.premiumNoteText}>{t('voice.introPremiumNote')}</Text>
              <Button
                label={t('subscription.subscribe')}
                onPress={() => router.push('/subscription/paywall' as never)}
                compact
              />
            </View>
          ) : null}
        </>
      )}

      {/* Kebab menu — bottom sheet (ConfirmSheet's Modal pattern). */}
      <Modal
        visible={menuVoice != null}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuVoice(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuVoice(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.grabber} />
          {menuVoice != null ? (
            <>
              <View style={styles.sheetHeader}>
                <Avatar emoji={OWNER_EMOJIS[menuVoice.ownerType]} size={40} kind="parentVoice" />
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {menuVoice.displayName}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.menuRow}
                onPress={() => {
                  setActionError(null);
                  setRenameValue(menuVoice.displayName);
                  setRenameVoice(menuVoice);
                  setMenuVoice(null);
                }}
              >
                <Text style={styles.menuRowText}>{t('voice.menu.rename')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.menuRow}
                onPress={() => openReRecord(menuVoice)}
              >
                <Text style={styles.menuRowText}>{t('voice.menu.reRecord')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={[styles.menuRow, styles.menuRowLast]}
                onPress={() => {
                  setActionError(null);
                  setDeleteVoice(menuVoice);
                  setMenuVoice(null);
                }}
              >
                <Text style={[styles.menuRowText, { color: colors.destructive }]}>
                  {t('voice.menu.delete')}
                </Text>
              </Pressable>
              <Button
                label={t('common.cancel')}
                onPress={() => setMenuVoice(null)}
                variant="tertiary"
                compact
              />
            </>
          ) : null}
        </View>
      </Modal>

      {/* Rename sheet. */}
      <Modal
        visible={renameVoice != null}
        transparent
        animationType="slide"
        onRequestClose={() => setRenameVoice(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRenameVoice(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>{t('voice.renameTitle')}</Text>
          <View style={styles.renameInputWrap}>
            <Input
              label={t('voice.voiceNameLabel')}
              value={renameValue}
              onChangeText={setRenameValue}
              maxLength={60}
              autoFocus
            />
          </View>
          {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
          <View style={styles.sheetButtons}>
            <Button
              label={t('common.save')}
              onPress={() => {
                if (renameVoice == null) return;
                setActionError(null);
                renameMutation.mutate({ id: renameVoice.id, displayName: renameValue.trim() });
              }}
              loading={renameMutation.isPending}
              disabled={renameValue.trim().length === 0}
            />
            <Button
              label={t('common.cancel')}
              onPress={() => setRenameVoice(null)}
              variant="tertiary"
              compact
            />
          </View>
        </View>
      </Modal>

      <ConfirmSheet
        visible={deleteVoice != null}
        title={t('voice.deleteConfirmTitle')}
        body={t('voice.deleteConfirmBody')}
        confirmLabel={t('voice.menu.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          if (deleteVoice != null) deleteMutation.mutate(deleteVoice.id);
        }}
        onCancel={() => setDeleteVoice(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: 'rgba(124,92,191,0.2)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: spacing.xl,
  },
  heroTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.xxl,
    color: colors.foreground,
    lineHeight: 22,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  loader: { marginTop: spacing.xxxl },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginBottom: 12,
  },
  voiceList: { gap: 10, marginBottom: spacing.xl },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceInfo: { flex: 1 },
  voiceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  voiceName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
    flexShrink: 1,
  },
  voiceMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  statusChip: {
    borderRadius: radius.xs,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  statusChipProcessing: { backgroundColor: colors.muted },
  statusChipFailed: { backgroundColor: 'rgba(224,84,84,0.12)' },
  statusChipText: { fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 0.4 },
  kebabButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginBottom: spacing.md,
  },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  addEmojiCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addEmoji: { fontSize: 22 },
  addTextBlock: { flex: 1 },
  addTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  addTitle: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg, color: colors.primary },
  addSub: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: colors.mutedForeground },
  premiumNoteCard: {
    marginTop: spacing.sm,
    padding: 16,
    borderRadius: radius.base,
    backgroundColor: 'rgba(255,217,125,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,217,125,0.5)',
    gap: 8,
  },
  premiumNoteText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    lineHeight: 20,
  },
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
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sheetTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.foreground,
    flexShrink: 1,
  },
  menuRow: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuRowLast: { borderBottomWidth: 0, marginBottom: 8 },
  menuRowText: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xl, color: colors.foreground },
  renameInputWrap: { marginTop: 8, marginBottom: 8 },
  sheetButtons: { gap: 8, marginTop: 16 },
});
