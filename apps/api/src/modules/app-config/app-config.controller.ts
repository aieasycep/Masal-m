import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppConfig } from '@masalim/validation';
import { Public } from '../../common/auth/public.decorator';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('app')
@Controller('app')
export class AppConfigController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('config')
  async config(): Promise<AppConfig> {
    const flags = await this.prisma.featureFlag.findMany({ where: { isPublic: true } });
    return {
      minSupportedVersion: this.env.MIN_SUPPORTED_APP_VERSION,
      latestVersion: this.env.LATEST_APP_VERSION,
      storeUrls: {
        ios: this.env.IOS_STORE_URL || null,
        android: this.env.ANDROID_STORE_URL || null,
      },
      maintenanceMode: false,
      features: Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled])),
    };
  }
}
