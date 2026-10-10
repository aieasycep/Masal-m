import { z } from 'zod';

export const appConfigSchema = z.object({
  minSupportedVersion: z.string(),
  latestVersion: z.string(),
  storeUrls: z.object({
    ios: z.string().nullable(),
    android: z.string().nullable(),
  }),
  maintenanceMode: z.boolean(),
  /** True when the server mails for real and unverified accounts should be nudged. */
  emailVerificationRequired: z.boolean(),
  /** Public feature flags exposed to clients. */
  features: z.record(z.string(), z.boolean()),
});
export type AppConfig = z.infer<typeof appConfigSchema>;
