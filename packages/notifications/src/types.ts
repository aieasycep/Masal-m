export interface PushMessage {
  expoPushToken: string;
  title: string;
  body: string;
  /** Deep-link payload — the mobile app routes on `data.route` (see push contract). */
  data: Record<string, string>;
}

export interface PushSendReport {
  sent: number;
  /** Tokens the provider reported as dead — callers must prune these DeviceToken rows. */
  deadTokens: string[];
}

export interface PushProvider {
  readonly name: string;
  send(messages: PushMessage[]): Promise<PushSendReport>;
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
