export interface PushMessage {
  expoPushToken: string;
  title: string;
  body: string;
  /** Deep-link payload — the mobile app routes on `data.route` (see push contract). */
  data: Record<string, string>;
}

/** Provider receipt handle for one accepted message; needed to look the receipt up later. */
export interface PushTicket {
  id: string;
  token: string;
}

export interface PushSendReport {
  sent: number;
  /** Tokens the provider reported as dead — callers must prune these DeviceToken rows. */
  deadTokens: string[];
  /**
   * Tickets for the accepted messages. Delivery failures (an uninstalled app)
   * only surface in the receipt later, so callers queue these for a sweep that
   * calls `getReceipts`.
   */
  tickets: PushTicket[];
}

export interface PushProvider {
  readonly name: string;
  send(messages: PushMessage[]): Promise<PushSendReport>;
  /**
   * Resolve receipts for earlier tickets. Receipts carry only the ticket id,
   * so the caller passes the `{id, token}` pairs it kept and gets back the
   * tokens whose receipt says the device is gone.
   */
  getReceipts?(tickets: PushTicket[]): Promise<{ deadTokens: string[] }>;
}

/**
 * Push payload → route contract. Every push carries `data.route`; the mobile
 * app navigates there on tap (cold-start links are queued until session restore).
 */
export const PushRoutes = {
  storyReady: (storyId: string) => `/story/${storyId}`,
  voiceReady: () => '/voice',
  illustrationsReady: (storyId: string) => `/story/${storyId}/illustrate`,
  bookReady: (bookId: string) => `/book/${bookId}/preview`,
  orderShipped: (orderId: string) => `/orders/${orderId}`,
} as const;
