import { z } from 'zod';
import { localeSchema, personNameSchema } from './common';

export const passwordSchema = z
  .string()
  .min(8, 'password_too_short')
  .max(128)
  .regex(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/, 'password_needs_letter')
  .regex(/[0-9]/, 'password_needs_digit');

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  name: personNameSchema,
  locale: localeSchema.default('tr'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const appleAuthSchema = z.object({
  identityToken: z.string().min(10),
  /**
   * Server-issued raw nonce (`POST /auth/apple/nonce`). The client sends Apple
   * its SHA-256 hex; the token carries that hash and the server re-derives it.
   * Required: a token without a live nonce is a replay.
   */
  nonce: z.string().min(16).max(256),
  /** Apple only provides the name on the FIRST authorization — client forwards it once. */
  fullName: personNameSchema.optional(),
});
export type AppleAuthInput = z.infer<typeof appleAuthSchema>;

export const appleNonceResponseSchema = z.object({
  nonce: z.string().min(16),
});
export type AppleNonceResponse = z.infer<typeof appleNonceResponseSchema>;

export const googleAuthSchema = z.object({
  idToken: z.string().min(10),
});
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().length(6).regex(/^\d+$/),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** E-mail verification (active only while the server mails for real). */
export const verifyEmailSchema = z.object({
  code: z.string().length(6).regex(/^\d+$/),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const emailVerificationSendResponseSchema = z.object({
  /** false = nothing to do (already verified, or verification is off). */
  sent: z.boolean(),
  /** Seconds until another code may be requested. */
  cooldownSeconds: z.number().int().min(0),
});
export type EmailVerificationSendResponse = z.infer<typeof emailVerificationSendResponseSchema>;

export const verifyEmailResponseSchema = z.object({
  verified: z.literal(true),
  /** Whether this verification released the signup gift credits. */
  giftGranted: z.boolean(),
});
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Epoch seconds when the access token expires. */
  accessTokenExpiresAt: z.number().int(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authSessionSchema = z.object({
  tokens: authTokensSchema,
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    locale: localeSchema,
    onboardingCompleted: z.boolean(),
    avatarUrl: z.string().nullable(),
  }),
});
export type AuthSession = z.infer<typeof authSessionSchema>;
