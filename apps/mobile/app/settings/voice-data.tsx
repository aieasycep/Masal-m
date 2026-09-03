import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { VoiceOwnerType, VoiceProfileStatus } from '@masalim/types';
import type { VoiceProfile } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { AppIcon } from '../../src/components/AppIcon';
import { AudioPreviewButton } from '../../src/components/AudioPreviewButton';
import { Avatar } from '../../src/components/Avatar';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState } from '../../src/components/states';
import { api } from '../../src/lib/api';
import { usePreviewPlayer } from '../../src/lib/preview-player';

/** Keep in sync with the voice studio's owner avatars. */
const OWNER_EMOJIS: Record<VoiceOwnerType, string> = {
  [VoiceOwnerType.MOTHER]: '👩',
  [VoiceOwnerType.FATHER]: '👨',
  [VoiceOwnerType.GRANDMOTHER]: '👵',
  [VoiceOwnerType.GRANDFATHER]: '👴',
  [VoiceOwnerType.OTHER]: '🎙',
};

function formatCreatedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return date.toDateString();
  }
}

/** Ses Verilerim — `Settings/05-VoiceData`: privacy note + recorded voice cards. */
export default function VoiceDataSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const preview = usePreviewPlayer();

  const [deleteVoice, setDeleteVoice] = useState<VoiceProfile | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const voicesQuery = useQuery({ queryKey: ['voices'], queryFn: () => api.voices.list() });
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

  const openReRecord = (voice: VoiceProfile) => {
    router.push(
      `/voice/create?recreateId=${encodeURIComponent(voice.id)}&ownerType=${encodeURIComponent(
        voice.ownerType,
      )}&displayName=${encodeURIComponent(voice.displayName)}` as never,
    );
  };

  return (
    <Screen>
      <ScreenHeader title={t('settings.voiceData')} />

      {/* Privacy note — primary-tinted info banner. */}
      <View style={styles.infoBanner}>
        <AppIcon name="lock" size={16} color={colors.primary} />
        <Text style={styles.infoText}>{t('settings.voiceDataInfo')}</Text>
      </View>

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
        <EmptyState
          emoji="🎙"
          title={t('voice.emptyTitle')}
          ctaLabel={t('voice.emptyCta')}
          onCta={() => router.push('/voice' as never)}
        />
      ) : (
        <View style={styles.voiceList}>
          {voices.map((voice) => (
            <View key={voice.id} style={styles.voiceCard}>
              <View style={styles.voiceHeader}>
                <Avatar emoji={OWNER_EMOJIS[voice.ownerType]} size={48} kind="parentVoice" />
                <View style={styles.voiceInfo}>
                  <Text style={styles.voiceName} numberOfLines={1}>
                    {voice.displayName}
                  </Text>
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
              </View>
              <View style={styles.voiceActions}>
                <Pressable
                  onPress={() => openReRecord(voice)}
                  accessibilityRole="button"
                  accessibilityLabel={t('voice.menu.reRecord')}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
                >
                  <Text style={styles.actionText}>{t('voice.menu.reRecord')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setActionError(null);
                    setDeleteVoice(voice);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionButtonDestructive,
                    pressed && styles.actionPressed,
                  ]}
                >
                  <Text style={[styles.actionText, styles.actionTextDestructive]}>
                    {t('common.delete')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {actionError != null ? (
        <Text style={styles.actionError} accessibilityLiveRegion="polite">
          {actionError}
        </Text>
      ) : null}

      <ConfirmSheet
        visible={deleteVoice != null}
        title={t('settings.voiceDeleteTitle', { name: deleteVoice?.displayName ?? '' })}
        body={t('settings.voiceDeleteBody')}
        confirmLabel={t('settings.voiceDeleteConfirm')}
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    // Primary-tinted banner (rgba of colors.primary #7C5CBF).
    backgroundColor: 'rgba(124, 92, 191, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 191, 0.15)',
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  infoText: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.foreground,
    lineHeight: 21,
  },
  loader: { marginTop: spacing.xxxl },
  voiceList: { gap: spacing.sm },
  voiceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 14,
  },
  voiceInfo: { flex: 1, minWidth: 0 },
  voiceName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
    marginBottom: 2,
  },
  voiceMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  voiceActions: { flexDirection: 'row', gap: spacing.xs },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.chip,
    backgroundColor: colors.muted,
    alignItems: 'center',
  },
  actionButtonDestructive: {
    // Destructive tint (rgba of colors.destructive #E05454).
    backgroundColor: 'rgba(224, 84, 84, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(224, 84, 84, 0.2)',
  },
  actionPressed: { opacity: 0.8 },
  actionText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
  },
  actionTextDestructive: { color: colors.destructive },
  actionError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginTop: spacing.md,
  },
});
