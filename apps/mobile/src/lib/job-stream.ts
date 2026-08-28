import { useEffect, useState } from 'react';
import EventSource from 'react-native-sse';
import * as Application from 'expo-application';
import { AIJobStatus } from '@masalim/types';
import { jobStreamEventSchema } from '@masalim/validation';
import { api } from './api';
import { secureTokenStore } from './token-store';

/** Job progress snapshot exposed to screens. Progress is ALWAYS the real backend value. */
export interface JobProgress {
  /** null until the first event/poll result arrives. */
  status: AIJobStatus | null;
  /** 0–100, driven by worker milestones — never fabricated client-side. */
  progress: number;
  errorCode: string | null;
}

const INITIAL: JobProgress = { status: null, progress: 0, errorCode: null };

const TERMINAL_STATUSES = new Set<AIJobStatus>([
  AIJobStatus.SUCCEEDED,
  AIJobStatus.FAILED,
  AIJobStatus.CANCELLED,
]);

/** No SSE event for this long → assume the stream is dead and fall back to polling. */
const SSE_WATCHDOG_MS = 10_000;
const POLL_INTERVAL_MS = 2_000;

/**
 * Live progress for an AIJob: SSE stream (`GET /jobs/:id/stream`) with an
 * authenticated EventSource, falling back to 2s polling when the stream errors
 * or goes silent. Stops on terminal status (SUCCEEDED/FAILED/CANCELLED) or unmount.
 */
export function useJobProgress(jobId: string | undefined): JobProgress {
  const [state, setState] = useState<JobProgress>(INITIAL);

  useEffect(() => {
    if (jobId == null || jobId.length === 0) return;
    setState(INITIAL);

    let disposed = false;
    let terminal = false;
    let receivedSseEvent = false;
    let pollInFlight = false;
    let eventSource: EventSource<'job' | 'heartbeat'> | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const stopSse = () => {
      if (watchdog != null) {
        clearTimeout(watchdog);
        watchdog = null;
      }
      if (eventSource != null) {
        eventSource.removeAllEventListeners();
        eventSource.close();
        eventSource = null;
      }
    };

    const stopAll = () => {
      stopSse();
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const apply = (next: JobProgress) => {
      if (disposed || terminal || next.status == null) return;
      setState(next);
      if (TERMINAL_STATUSES.has(next.status)) {
        terminal = true;
        stopAll();
      }
    };

    const pollOnce = async () => {
      if (disposed || terminal || pollInFlight) return;
      pollInFlight = true;
      try {
        const job = await api.jobs.get(jobId);
        apply({ status: job.status, progress: job.progress, errorCode: job.errorCode });
      } catch {
        // Transient failure — keep polling until terminal or unmount.
      } finally {
        pollInFlight = false;
      }
    };

    const startPolling = () => {
      if (disposed || terminal || pollTimer != null) return;
      void pollOnce();
      pollTimer = setInterval(() => {
        void pollOnce();
      }, POLL_INTERVAL_MS);
    };

    const fallBackToPolling = () => {
      stopSse();
      startPolling();
    };

    const kickWatchdog = () => {
      if (watchdog != null) clearTimeout(watchdog);
      watchdog = setTimeout(fallBackToPolling, SSE_WATCHDOG_MS);
    };

    const startSse = async () => {
      const tokens = await secureTokenStore.getTokens();
      if (disposed || terminal) return;
      if (tokens == null) {
        // No session for the SSE Authorization header — polling goes through
        // the api client, which owns token refresh.
        startPolling();
        return;
      }

      eventSource = new EventSource<'job' | 'heartbeat'>(api.jobs.streamUrl(jobId), {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          // Mirror the api client's version gate header (see src/lib/api.ts).
          'x-app-version': Application.nativeApplicationVersion ?? '0.1.0',
        },
        // We manage reconnection ourselves (watchdog → polling); 0 disables retries.
        pollingInterval: 0,
      });
      kickWatchdog();

      eventSource.addEventListener('job', (event) => {
        kickWatchdog();
        if (event.type !== 'job' || event.data == null) return;
        try {
          const parsed = jobStreamEventSchema.safeParse(JSON.parse(event.data));
          if (!parsed.success) return;
          receivedSseEvent = true;
          apply({
            status: parsed.data.status,
            progress: parsed.data.progress,
            errorCode: parsed.data.errorCode,
          });
        } catch {
          // Malformed payload — ignore; the next event or the watchdog covers us.
        }
      });
      // Heartbeats carry no data but prove the stream is alive.
      eventSource.addEventListener('heartbeat', kickWatchdog);
      eventSource.addEventListener('error', fallBackToPolling);
      // The API auto-closes the stream after a terminal event; if we somehow
      // missed it, confirm the final state over REST.
      eventSource.addEventListener('close', () => {
        if (!terminal) fallBackToPolling();
      });
    };

    // Seed with the current job state so a mid-flight job doesn't render 0%
    // while the stream connects. Never overwrites fresher SSE data.
    const seed = async () => {
      try {
        const job = await api.jobs.get(jobId);
        if (!receivedSseEvent) {
          apply({ status: job.status, progress: job.progress, errorCode: job.errorCode });
        }
      } catch {
        // SSE/polling will provide the state.
      }
    };

    void seed();
    void startSse();

    return () => {
      disposed = true;
      stopAll();
    };
  }, [jobId]);

  return state;
}
