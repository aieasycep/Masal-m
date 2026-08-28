import { AIJobType } from '@masalim/types';

/** BullMQ queue names — one queue per job family (§7). */
export const QueueName = {
  STORY_GENERATION: 'story-generation',
  VOICE_CLONE: 'voice-clone',
  NARRATION: 'narration',
  ILLUSTRATION: 'illustration',
  BOOK_RENDER: 'book-render',
  PRINT_FILE: 'print-file',
  ORDER_SNAPSHOT: 'order-snapshot',
  DELETION: 'deletion',
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const QUEUE_FOR_JOB_TYPE: Record<AIJobType, QueueName> = {
  [AIJobType.STORY_GENERATION]: QueueName.STORY_GENERATION,
  [AIJobType.VOICE_CLONE]: QueueName.VOICE_CLONE,
  [AIJobType.NARRATION_GENERATION]: QueueName.NARRATION,
  [AIJobType.ILLUSTRATION_GENERATION]: QueueName.ILLUSTRATION,
  [AIJobType.BOOK_RENDER]: QueueName.BOOK_RENDER,
  [AIJobType.PRINT_FILE_GENERATION]: QueueName.PRINT_FILE,
  [AIJobType.ORDER_SNAPSHOT]: QueueName.ORDER_SNAPSHOT,
  [AIJobType.ACCOUNT_DELETION]: QueueName.DELETION,
};

/** Every queue payload carries the mirroring AIJob row id. */
export interface QueueJobData {
  aiJobId: string;
}
