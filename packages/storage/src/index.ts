import type { StorageConfig, StorageProvider } from './types';
import { LocalStorageProvider } from './local-provider';
import { S3StorageProvider } from './s3-provider';

export * from './types';
export { S3StorageProvider } from './s3-provider';
export { LocalStorageProvider } from './local-provider';

export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.provider) {
    case 's3':
      return new S3StorageProvider(config);
    case 'local':
      return new LocalStorageProvider(config);
  }
}

/** Canonical object-key layout — single place that defines the bucket structure. */
export const StorageKeys = {
  voiceRecording: (userId: string) => `users/${userId}/voice-recordings`,
  voicePreview: (userId: string, voiceProfileId: string) =>
    `users/${userId}/voice-previews/${voiceProfileId}.mp3`,
  avatar: (userId: string) => `users/${userId}/avatars`,
  narrationAudio: (userId: string, storyId: string, narrationId: string) =>
    `users/${userId}/stories/${storyId}/narrations/${narrationId}.mp3`,
  illustration: (userId: string, storyId: string, illustrationId: string) =>
    `users/${userId}/stories/${storyId}/illustrations/${illustrationId}.png`,
  bookPdf: (userId: string, bookId: string) => `users/${userId}/books/${bookId}/print.pdf`,
  systemVoicePreview: (systemVoiceId: string, ext: string) =>
    `system-voices/${systemVoiceId}/preview.${ext}`,
  /** Immutable order snapshot prefix — excluded from user deletion (§81). */
  orderSnapshot: (orderId: string) => `orders/${orderId}`,
  userPrefix: (userId: string) => `users/${userId}`,
} as const;
