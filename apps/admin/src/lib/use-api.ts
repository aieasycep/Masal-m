'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Tiny client-side fetch hook (no react-query dependency). Refetches whenever
 * any value in `deps` changes; `reload()` forces a refetch with the same deps.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: readonly unknown[]) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [state, setState] = useState<UseApiState<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const depKey = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: errorMessage(error) }));
      });
    return () => {
      cancelled = true;
    };
  }, [depKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { ...state, reload };
}
