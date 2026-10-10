import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  sendPushNotificationsAsync: vi.fn(),
  getPushNotificationReceiptsAsync: vi.fn(),
}));

vi.mock('expo-server-sdk', () => {
  class Expo {
    static isExpoPushToken(token: unknown): boolean {
      return typeof token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(token);
    }
    sendPushNotificationsAsync = sdk.sendPushNotificationsAsync;
    getPushNotificationReceiptsAsync = sdk.getPushNotificationReceiptsAsync;
    chunkPushNotifications<T>(messages: T[]): T[][] {
      return chunk(messages, 2);
    }
    chunkPushNotificationReceiptIds(ids: string[]): string[][] {
      return chunk(ids, 2);
    }
  }
  function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }
  return { Expo };
});

import { ExpoPushProvider } from '../expo-provider';

const token = (n: number) => `ExponentPushToken[device-${n}]`;
const message = (n: number) => ({ expoPushToken: token(n), title: 't', body: 'b', data: {} });

describe('ExpoPushProvider.send', () => {
  const onError = vi.fn();
  beforeEach(() => {
    sdk.sendPushNotificationsAsync.mockReset();
    onError.mockReset();
  });

  it('isolates a failed chunk, keeps sending the rest and returns tickets for accepted messages', async () => {
    sdk.sendPushNotificationsAsync
      .mockRejectedValueOnce(new Error('expo 502'))
      .mockResolvedValueOnce([
        { status: 'ok', id: 'ticket-3' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ]);
    const provider = new ExpoPushProvider({ onError });

    const report = await provider.send([
      message(1),
      message(2),
      message(3),
      message(4),
      { ...message(5), expoPushToken: 'not-a-token' },
    ]);

    expect(sdk.sendPushNotificationsAsync).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(report.sent).toBe(1);
    expect(report.tickets).toEqual([{ id: 'ticket-3', token: token(3) }]);
    // malformed tokens and DeviceNotRegistered tickets are both dead
    expect(report.deadTokens).toEqual(['not-a-token', token(4)]);
  });
});

describe('ExpoPushProvider.getReceipts', () => {
  const onError = vi.fn();
  beforeEach(() => {
    sdk.getPushNotificationReceiptsAsync.mockReset();
    onError.mockReset();
  });

  it('maps DeviceNotRegistered receipts back to their tokens and skips a failed lookup', async () => {
    sdk.getPushNotificationReceiptsAsync
      .mockResolvedValueOnce({
        t1: { status: 'ok' },
        t2: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      })
      .mockRejectedValueOnce(new Error('expo 502'))
      .mockResolvedValueOnce({
        t5: { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
      });
    const provider = new ExpoPushProvider({ onError });

    const result = await provider.getReceipts([
      { id: 't1', token: token(1) },
      { id: 't2', token: token(2) },
      { id: 't3', token: token(3) },
      { id: 't4', token: token(4) },
      { id: 't5', token: token(5) },
    ]);

    expect(sdk.getPushNotificationReceiptsAsync).toHaveBeenCalledTimes(3);
    expect(sdk.getPushNotificationReceiptsAsync).toHaveBeenNthCalledWith(1, ['t1', 't2']);
    expect(onError).toHaveBeenCalledTimes(1);
    // only a DeviceNotRegistered receipt kills a token; transient errors do not
    expect(result.deadTokens).toEqual([token(2)]);
  });
});
