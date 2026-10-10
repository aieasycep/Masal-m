type Listener = () => void;

const expiredListeners = new Set<Listener>();

/**
 * Tiny pub/sub between the api client and the auth store. `api.ts` must not
 * import the auth store (the store imports api/push/purchases for sign-out —
 * a static cycle would trip Metro's require-cycle warning), so the client
 * emits here and the store subscribes at module init.
 */
export const sessionEvents = {
  /** Subscribe to "the server rejected the session" — returns the unsubscribe. */
  onExpired(listener: Listener): () => void {
    expiredListeners.add(listener);
    return () => {
      expiredListeners.delete(listener);
    };
  },
  emitExpired(): void {
    for (const listener of expiredListeners) listener();
  },
};
