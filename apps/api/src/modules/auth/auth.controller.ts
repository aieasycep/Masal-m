import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { AuthSession, AuthTokens } from '@masalim/validation';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { AuthService } from './auth.service';
import {
  AppleAuthDto,
  ForgotPasswordDto,
  GoogleAuthDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() body: RegisterDto): Promise<AuthSession> {
    return this.authService.register(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() body: LoginDto): Promise<AuthSession> {
    return this.authService.login(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('apple')
  apple(@Body() body: AppleAuthDto): Promise<AuthSession> {
    return this.authService.loginWithApple(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('google')
  google(@Body() body: GoogleAuthDto): Promise<AuthSession> {
    return this.authService.loginWithGoogle(body);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() body: RefreshDto): Promise<AuthTokens> {
    return this.authService.refresh(body.refreshToken);
  }

  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser, @Body() body: LogoutDto): Promise<void> {
    await this.authService.logout(user.id, body.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('password/forgot')
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<{ sent: boolean }> {
    await this.authService.forgotPassword(body);
    return { sent: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('password/reset')
  async resetPassword(@Body() body: ResetPasswordDto): Promise<{ reset: boolean }> {
    await this.authService.resetPassword(body);
    return { reset: true };
  }
}
