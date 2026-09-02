import { create } from 'zustand';

export type TrackedJobKind = 'story' | 'narration' | 'illustration';

export interface TrackedJob {
  jobId: string;
  kind: TrackedJobKind;
  storyId: string | null;
  /** Story title for the card's second line (null before the story exists). */
  title: string | null;
  /** Where "Aç" lands once the job is done. */
  route: string;
}

interface JobsState {
  jobs: TrackedJob[];
  track: (job: TrackedJob) => void;
  untrack: (jobId: string) => void;
  clear: () => void;
}

/** Cards are for long waits, not a job history — keep the dock short. */
export const MAX_TRACKED_JOBS = 3;

/**
 * Jobs the user chose to wait for in the background ("Arka planda devam et"
 * on a generating takeover). The dock above the tab bar renders one progress
 * row per job from the REAL job stream; leaving a takeover never loses the
 * job — it keeps running server-side either way.
 */
export const useJobsStore = create<JobsState>()((set) => ({
  jobs: [],
  track: (job) =>
    set((state) => {
      const rest = state.jobs.filter((item) => item.jobId !== job.jobId);
      return { jobs: [...rest, job].slice(-MAX_TRACKED_JOBS) };
    }),
  untrack: (jobId) => set((state) => ({ jobs: state.jobs.filter((item) => item.jobId !== jobId) })),
  clear: () => set({ jobs: [] }),
}));
