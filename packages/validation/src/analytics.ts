import { z } from 'zod';

export const analyticsEventSchema = z.object({
  name: z.string().min(1).max(80),
  /** Client timestamp (epoch ms). */
  timestamp: z.number().int(),
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;

export const analyticsBatchSchema = z.object({
  events: z.array(analyticsEventSchema).min(1).max(50),
});
export type AnalyticsBatchInput = z.infer<typeof analyticsBatchSchema>;
