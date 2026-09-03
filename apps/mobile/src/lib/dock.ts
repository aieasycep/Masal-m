import { useJobsStore } from '../stores/jobs';
import { usePlayerStore } from '../stores/player';

/** Fixed heights so tab screens can reserve scroll clearance without measuring. */
export const MINI_PLAYER_HEIGHT = 64;
export const JOB_ROW_HEIGHT = 60;

/** Height of the dock (job cards + mini player) sitting above the tab bar. */
export function useDockHeight(): number {
  const jobCount = useJobsStore((state) => state.jobs.length);
  const hasNowPlaying = usePlayerStore((state) => state.nowPlaying != null);
  return jobCount * JOB_ROW_HEIGHT + (hasNowPlaying ? MINI_PLAYER_HEIGHT : 0);
}
