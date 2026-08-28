import { hitsBlocklist } from './blocklist';
import type { ContentModerator, ModerationVerdict } from './types';

/** Blocklist-only moderator for development — no API calls. */
export class MockContentModerator implements ContentModerator {
  readonly name = 'mock';

  async checkStoryIdea(idea: string): Promise<ModerationVerdict> {
    return hitsBlocklist(idea) ? { safe: false, category: 'blocklist' } : { safe: true };
  }

  async checkStoryText(text: string): Promise<ModerationVerdict> {
    return hitsBlocklist(text) ? { safe: false, category: 'blocklist' } : { safe: true };
  }
}
