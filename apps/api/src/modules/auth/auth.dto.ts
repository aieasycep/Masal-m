import { createZodDto } from 'nestjs-zod';
import {
  appleAuthSchema,
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '@masalim/validation';

export class RegisterDto extends createZodDto(registerSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class AppleAuthDto extends createZodDto(appleAuthSchema) {}
export class GoogleAuthDto extends createZodDto(googleAuthSchema) {}
export class RefreshDto extends createZodDto(refreshSchema) {}
export class LogoutDto extends createZodDto(logoutSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
