import { MAX_TRACKED_JOBS, useJobsStore, type TrackedJob } from '../jobs';
import { usePlayerStore } from '../player';

const job = (jobId: string): TrackedJob => ({
  jobId,
  kind: 'narration',
  storyId: 'story-1',
  title: 'Ege ve Kayıp Yıldız',
  route: '/story/story-1/narrate',
});

describe('jobs store', () => {
  beforeEach(() => {
    useJobsStore.getState().clear();
  });

  it('tracks jobs once (re-tracking replaces, never duplicates)', () => {
    useJobsStore.getState().track(job('a'));
    useJobsStore.getState().track({ ...job('a'), title: 'Yeni ad' });
    expect(useJobsStore.getState().jobs).toHaveLength(1);
    expect(useJobsStore.getState().jobs[0]?.title).toBe('Yeni ad');
  });

  it('keeps only the newest MAX_TRACKED_JOBS rows', () => {
    for (let i = 0; i < MAX_TRACKED_JOBS + 2; i++) useJobsStore.getState().track(job(`j${i}`));
    const ids = useJobsStore.getState().jobs.map((item) => item.jobId);
    expect(ids).toHaveLength(MAX_TRACKED_JOBS);
    expect(ids[ids.length - 1]).toBe(`j${MAX_TRACKED_JOBS + 1}`);
  });

  it('untracks by id', () => {
    useJobsStore.getState().track(job('a'));
    useJobsStore.getState().track(job('b'));
    useJobsStore.getState().untrack('a');
    expect(useJobsStore.getState().jobs.map((item) => item.jobId)).toEqual(['b']);
  });
});

describe('player store', () => {
  it('records and clears the now-playing narration', () => {
    usePlayerStore.getState().setNowPlaying({
      storyId: 's',
      narrationId: 'n',
      title: 'T',
      subtitle: "Anne'nin sesiyle",
      artworkUrl: null,
    });
    expect(usePlayerStore.getState().nowPlaying?.narrationId).toBe('n');
    usePlayerStore.getState().clearNowPlaying();
    expect(usePlayerStore.getState().nowPlaying).toBeNull();
  });
});
