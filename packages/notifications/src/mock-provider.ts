import type { PushMessage, PushProvider, PushSendReport, PushTicket } from './types';

/** Mock push provider — records messages in memory for tests/dev inspection. */
export class MockPushProvider implements PushProvider {
  readonly name = 'mock';
  readonly sentMessages: PushMessage[] = [];

  async send(messages: PushMessage[]): Promise<PushSendReport> {
    this.sentMessages.push(...messages);
    // No delivery stage to poll: nothing is queued for the receipt sweep.
    return { sent: messages.length, deadTokens: [], tickets: [] };
  }

  async getReceipts(_tickets: PushTicket[]): Promise<{ deadTokens: string[] }> {
    return { deadTokens: [] };
  }
}
