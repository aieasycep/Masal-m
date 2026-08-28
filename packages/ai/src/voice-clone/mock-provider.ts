import { randomUUID } from 'node:crypto';
import { VoiceCloneError, type VoiceCloneProvider, type VoiceCloneStatus } from './types';

/**
 * Mock voice cloning: "clones" instantly after a short delay. The returned id
 * is a mock TTS voice id, so narrations with a cloned voice work end-to-end
 * (each clone gets a distinct melody seed in MockTtsProvider).
 */
export class MockVoiceCloneProvider implements VoiceCloneProvider {
  readonly name = 'mock';
  private readonly delayMs: number;
  private readonly deleted = new Set<string>();

  constructor(options?: { delayMs?: number }) {
    this.delayMs = options?.delayMs ?? 2500;
  }

  async createVoice(input: { displayName: string; audio: Buffer }): Promise<{ providerVoiceId: string }> {
    if (input.audio.byteLength === 0) {
      throw new VoiceCloneError('Empty recording');
    }
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return { providerVoiceId: `mock-clone-${randomUUID()}` };
  }

  async deleteVoice(providerVoiceId: string): Promise<void> {
    this.deleted.add(providerVoiceId);
  }

  async getStatus(providerVoiceId: string): Promise<VoiceCloneStatus> {
    return this.deleted.has(providerVoiceId) ? 'FAILED' : 'READY';
  }
}
