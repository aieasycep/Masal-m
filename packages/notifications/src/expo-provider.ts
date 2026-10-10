import { Expo, type ExpoPushTicket } from 'expo-server-sdk';
import type { PushMessage, PushProvider, PushSendReport, PushTicket } from './types';

export interface ExpoPushProviderOptions {
  accessToken?: string;
  /** Called when one chunk fails outright (network, 5xx); the other chunks still go out. */
  onError?: (message: string, error: unknown) => void;
}

/**
 * Expo Push adapter — chunks messages, reports DeviceNotRegistered tokens for
 * pruning (ticket stage) and resolves receipts later (delivery stage), where
 * uninstalled apps actually show up.
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  private readonly expo: Expo;
  private readonly onError: (message: string, error: unknown) => void;

  constructor(options?: ExpoPushProviderOptions) {
    this.expo = new Expo({ accessToken: options?.accessToken });
    this.onError = options?.onError ?? ((message, error) => console.warn(message, error));
  }

  async send(messages: PushMessage[]): Promise<PushSendReport> {
    const valid = messages.filter((m) => Expo.isExpoPushToken(m.expoPushToken));
    const deadTokens: string[] = messages
      .filter((m) => !Expo.isExpoPushToken(m.expoPushToken))
      .map((m) => m.expoPushToken);
    const tickets: PushTicket[] = [];

    const chunks = this.expo.chunkPushNotifications(
      valid.map((m) => ({
        to: m.expoPushToken,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: 'default' as const,
      })),
    );

    let sent = 0;
    for (const chunk of chunks) {
      let results: ExpoPushTicket[];
      try {
        results = await this.expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        // One bad chunk must not drop the remaining recipients.
        this.onError(`expo push chunk of ${chunk.length} failed`, error);
        continue;
      }
      results.forEach((ticket, index) => {
        const to = chunk[index]?.to;
        const token = typeof to === 'string' ? to : null;
        if (ticket.status === 'ok') {
          sent++;
          if (token != null) tickets.push({ id: ticket.id, token });
        } else if (ticket.details?.error === 'DeviceNotRegistered' && token != null) {
          deadTokens.push(token);
        }
      });
    }
    return { sent, deadTokens, tickets };
  }

  async getReceipts(tickets: PushTicket[]): Promise<{ deadTokens: string[] }> {
    const tokenByTicket = new Map(tickets.map((ticket) => [ticket.id, ticket.token]));
    const deadTokens = new Set<string>();
    for (const ids of this.expo.chunkPushNotificationReceiptIds([...tokenByTicket.keys()])) {
      let receipts: Awaited<ReturnType<Expo['getPushNotificationReceiptsAsync']>>;
      try {
        receipts = await this.expo.getPushNotificationReceiptsAsync(ids);
      } catch (error) {
        this.onError(`expo receipt lookup for ${ids.length} tickets failed`, error);
        continue;
      }
      for (const [id, receipt] of Object.entries(receipts)) {
        if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
          const token = tokenByTicket.get(id);
          if (token != null) deadTokens.add(token);
        }
      }
    }
    return { deadTokens: [...deadTokens] };
  }
}
