import { Global, Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import { MonetizationConfigService } from './monetization-config.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';

/** Entitlement + credit engine and store-subscription sync (§37). */
@Global()
@Module({
  controllers: [SubscriptionController],
  providers: [EntitlementService, SubscriptionService, MonetizationConfigService],
  exports: [EntitlementService, SubscriptionService, MonetizationConfigService],
})
export class SubscriptionModule {}
