import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { NetworkError } from '@masalim/api-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => {
        // Retry network blips, not API errors (they carry meaning).
        if (error instanceof NetworkError) return failureCount < 3;
        return false;
      },
    },
  },
});

/** Offline read cache (§56): library/story data survives restarts for 24h. */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'masalim.query-cache',
  throttleTime: 2_000,
});
