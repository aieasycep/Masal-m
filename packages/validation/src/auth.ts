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
  /** Raw nonce used when requesting the credential (hashed nonce lives inside the token). */
  nonce: z.string().min(1).max(256).optional(),
  /** Apple only provides the name on the FIRST authorization — client forwards it once. */
  fullName: personNameSchema.optional(),
});
export type AppleAuthInput = z.infer<typeof appleAuthSchema>;

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
