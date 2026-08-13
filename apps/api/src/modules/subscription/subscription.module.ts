import { Global, Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';

/** Entitlement engine + store-subscription sync (§37). */
@Global()
@Module({
  controllers: [SubscriptionController],
  providers: [EntitlementService, SubscriptionService],
  exports: [EntitlementService, SubscriptionService],
})
export class SubscriptionModule {}
