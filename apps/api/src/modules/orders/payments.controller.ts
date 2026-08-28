import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ErrorCode, PaymentStatus } from '@masalim/types';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app.exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PaymentsService } from './payments.service';

/** iyzico checkout-form callback POSTs a token form field. */
const iyzicoCallbackSchema = z.object({ token: z.string().min(1) });
class IyzicoCallbackDto extends createZodDto(iyzicoCallbackSchema) {}

const mockCompleteSchema = z.object({ providerToken: z.string().min(1) });
class MockCompleteDto extends createZodDto(mockCompleteSchema) {}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** iyzico redirects the buyer here after 3DS/checkout (§34). */
  @Public()
  @Post('iyzico/callback')
  @HttpCode(200)
  async iyzicoCallback(
    @Body() body: IyzicoCallbackDto,
  ): Promise<{ status: PaymentStatus; orderId: string }> {
    return this.payments.completeByToken(body.token);
  }

  /** Dev-only completion for the mock provider (no hosted checkout). */
  @Post('mock/complete')
  async mockComplete(
    @Body() body: MockCompleteDto,
  ): Promise<{ status: PaymentStatus; orderId: string }> {
    if (this.env.NODE_ENV === 'production' || this.env.PAYMENT_PROVIDER !== 'mock') {
      throw new AppException(
        ErrorCode.FEATURE_DISABLED,
        'Mock payment endpoints are disabled',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.payments.completeByToken(body.providerToken);
  }
}
