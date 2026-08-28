import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, spacing } from '@masalim/ui';
import { useAppPrefs } from '../../src/stores/app-prefs';
import { ListRow } from '../../src/components/ListRow';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';

/** Speeds mirror the player's chips (design "Ses ve Oynatma"). */
const RATES = [0.8, 1, 1.2, 1.5] as const;

const rateLabel = (rate: number): string => `${rate}x`.replace('.', ',');

/** Labeled section card matching Settings/01-Main. */
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title.toLocaleUpperCase('tr')}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/**
 * "Ses ve Oynatma" (final design Settings audio screen): default narration
 * speed + auto page-follow. Both are device-local preferences (app-prefs) —
 * the night player seeds its rate from here and gates its text auto-scroll.
 */
export default function AudioSettings() {
  const { t } = useTranslation();
  const defaultPlaybackRate = useAppPrefs((state) => state.defaultPlaybackRate);
  const autoFollowPage = useAppPrefs((state) => state.autoFollowPage);
  const setDefaultPlaybackRate = useAppPrefs((state) => state.setDefaultPlaybackRate);
  const setAutoFollowPage = useAppPrefs((state) => state.setAutoFollowPage);

  return (
    <Screen>
      <ScreenHeader title={t('settings.audio')} />

      <SectionCard title={t('settings.audioSpeedSection')}>
        <View style={styles.rateGrid}>
          {RATES.map((value) => {
            const selected = defaultPlaybackRate === value;
            return (
              <Pressable
                key={value}
                onPress={() => setDefaultPlaybackRate(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.rateChip, selected ? styles.rateChipOn : styles.rateChipOff]}
              >
                <Text style={[styles.rateText, selected && styles.rateTextOn]}>
                  {rateLabel(value)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard title={t('settings.audioPlayerSection')}>
        <ListRow
          icon="▶️"
          label={t('settings.autoAdvance')}
          sub={t('settings.autoAdvanceSub')}
          variant="toggle"
          toggleValue={autoFollowPage}
          onToggle={setAutoFollowPage}
          showDivider={false}
        />
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginBottom: spacing.xs,
    marginLeft: spacing.xxs,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rateGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rateChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateChipOn: { borderColor: colors.primary, backgroundColor: colors.secondary },
  rateChipOff: { borderColor: colors.border, backgroundColor: colors.card },
  rateText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  rateTextOn: { color: colors.secondaryForeground },
});
