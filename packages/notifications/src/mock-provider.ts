import type { PushMessage, PushProvider, PushSendReport } from './types';

/** Mock push provider — records messages in memory for tests/dev inspection. */
export class MockPushProvider implements PushProvider {
  readonly name = 'mock';
  readonly sentMessages: PushMessage[] = [];

  async send(messages: PushMessage[]): Promise<PushSendReport> {
    this.sentMessages.push(...messages);
    return { sent: messages.length, deadTokens: [] };
  }
}
