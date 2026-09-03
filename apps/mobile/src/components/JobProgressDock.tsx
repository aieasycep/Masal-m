import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AIJobStatus } from '@masalim/types';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { JOB_ROW_HEIGHT } from '../lib/dock';
import { useJobProgress } from '../lib/job-stream';
import { useJobsStore, type TrackedJob } from '../stores/jobs';
import { CloseIcon } from './icons';

/**
 * `JobProgressCard` (design Components): the dock above the tab bar listing
 * jobs the user sent to the background. Each row subscribes to the REAL job
 * stream; done rows offer "Aç", running rows can be hidden.
 */
export function JobProgressDock() {
  const jobs = useJobsStore((state) => state.jobs);
  if (jobs.length === 0) return null;
  return (
    <View style={styles.dock}>
      {jobs.map((job) => (
        <JobRow key={job.jobId} job={job} />
      ))}
    </View>
  );
}

function JobRow({ job }: { job: TrackedJob }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const untrack = useJobsStore((state) => state.untrack);
  const { status, progress } = useJobProgress(job.jobId);
  const done = status === AIJobStatus.SUCCEEDED;
  const failed = status === AIJobStatus.FAILED || status === AIJobStatus.CANCELLED;

  // Fresh data wherever the user opens next (story, library, narrations, sets).
  useEffect(() => {
    if (!done) return;
    void queryClient.invalidateQueries({ queryKey: ['stories'] });
    if (job.storyId != null) {
      void queryClient.invalidateQueries({ queryKey: ['story', job.storyId] });
      void queryClient.invalidateQueries({ queryKey: ['narrations', job.storyId] });
      void queryClient.invalidateQueries({ queryKey: ['illustrations', job.storyId] });
    }
  }, [done, job.storyId, queryClient]);

  const open = () => {
    untrack(job.jobId);
    router.push(job.route as never);
  };
  const percent = Math.round(Math.min(Math.max(progress, 0), 100));
  const label = done ? t('jobs.ready') : failed ? t('jobs.failed') : t(`jobs.${job.kind}`);

  return (
    <View style={styles.row}>
      <View style={styles.textBlock}>
        <Text style={[styles.label, failed ? styles.labelFailed : null]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {job.title ?? t('jobs.leaveHint')}
        </Text>
        {!done && !failed ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
        ) : null}
      </View>
      {done || failed ? (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={t('jobs.open')}
          style={({ pressed }) => [styles.openButton, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.openLabel}>{t('jobs.open')}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => untrack(job.jobId)}
          accessibilityRole="button"
          accessibilityLabel={t('jobs.hide')}
          hitSlop={8}
          style={({ pressed }) => [styles.hideButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <CloseIcon size={16} color={colors.mutedForeground} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { backgroundColor: colors.background },
  row: {
    height: JOB_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.secondary,
  },
  textBlock: { flex: 1, gap: 3 },
  label: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.secondaryForeground },
  labelFailed: { color: colors.error },
  sub: { fontFamily: fontFamilies.body, fontSize: fontSizes.sm, color: colors.mutedForeground },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(124,92,191,0.18)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.primary },
  openButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openLabel: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.primaryForeground },
  hideButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
