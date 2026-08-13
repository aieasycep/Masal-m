import { Expo } from 'expo-server-sdk';
import type { PushMessage, PushProvider, PushSendReport } from './types';

/** Expo Push adapter — chunks messages and reports DeviceNotRegistered tokens for pruning. */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  private readonly expo: Expo;

  constructor(options?: { accessToken?: string }) {
    this.expo = new Expo({ accessToken: options?.accessToken });
  }

  async send(messages: PushMessage[]): Promise<PushSendReport> {
    const valid = messages.filter((m) => Expo.isExpoPushToken(m.expoPushToken));
    const deadTokens: string[] = messages
      .filter((m) => !Expo.isExpoPushToken(m.expoPushToken))
      .map((m) => m.expoPushToken);

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
      const tickets = await this.expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'ok') {
          sent++;
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          const to = chunk[index]?.to;
          if (typeof to === 'string') deadTokens.push(to);
        }
      });
    }
    return { sent, deadTokens };
  }
}
