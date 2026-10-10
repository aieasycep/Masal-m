import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isTransientUploadKey, LocalStorageProvider } from '../index';

describe('LocalStorageProvider.listObjects', () => {
  let rootDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'masalim-storage-'));
    provider = new LocalStorageProvider({
      provider: 'local',
      bucket: 'test',
      localRootDir: rootDir,
      localBaseUrl: 'http://localhost:3001',
    });
    await provider.putObject('users/a/avatars/one', Buffer.from('xx'), 'image/png');
    await provider.putObject('users/a/voice-recordings/two', Buffer.from('xxxx'), 'audio/mp4');
    await provider.putObject('users/ab/avatars/three', Buffer.from('x'), 'image/png');
    await provider.putObject('orders/o1/print.pdf', Buffer.from('pdf'), 'application/pdf');
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const collect = async (prefix: string) => {
    const keys: string[] = [];
    for await (const entry of provider.listObjects(prefix)) keys.push(entry.key);
    return keys.sort();
  };

  it('lists every object under a directory prefix, excluding metadata files', async () => {
    expect(await collect('users/')).toEqual([
      'users/a/avatars/one',
      'users/a/voice-recordings/two',
      'users/ab/avatars/three',
    ]);
  });

  it('treats the prefix as a key prefix, not a directory', async () => {
    expect(await collect('users/a')).toEqual([
      'users/a/avatars/one',
      'users/a/voice-recordings/two',
      'users/ab/avatars/three',
    ]);
    expect(await collect('users/a/')).toEqual([
      'users/a/avatars/one',
      'users/a/voice-recordings/two',
    ]);
    expect(await collect('users/a/av')).toEqual(['users/a/avatars/one']);
  });

  it('reports size and modification time', async () => {
    const entries = [];
    for await (const entry of provider.listObjects('users/a/voice-recordings/')) {
      entries.push(entry);
    }
    expect(entries).toHaveLength(1);
    expect(entries[0]?.size).toBe(4);
    expect(entries[0]?.lastModified).toBeInstanceOf(Date);
  });

  it('yields nothing for a prefix that does not exist', async () => {
    expect(await collect('nope/')).toEqual([]);
  });
});

describe('isTransientUploadKey', () => {
  it('matches client uploads and narration caches only', () => {
    expect(isTransientUploadKey('users/u/avatars/x')).toBe(true);
    expect(isTransientUploadKey('users/u/voice-recordings/x')).toBe(true);
    expect(isTransientUploadKey('users/u/stories/s/narration-cache/v/0-abc')).toBe(true);
    expect(isTransientUploadKey('users/u/stories/s/narrations/n.mp3')).toBe(false);
    expect(isTransientUploadKey('users/u/stories/s/illustrations/i.png')).toBe(false);
    expect(isTransientUploadKey('orders/o/print.pdf')).toBe(false);
  });
});
