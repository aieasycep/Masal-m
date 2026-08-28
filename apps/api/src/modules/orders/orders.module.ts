import { Module } from '@nestjs/common';
import { BooksModule } from '../books/books.module';
import { AddressesModule } from '../addresses/addresses.module';
import { PricingService } from './pricing.service';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { OrdersController } from './orders.controller';
import { PaymentsController } from './payments.controller';
import { OrderSnapshotProcessor } from './order-snapshot.processor';
import { PrintSyncService } from './print-sync.service';

/** Physical book commerce (§34–§35, §78, §81–§82). */
@Module({
  imports: [BooksModule, AddressesModule],
  controllers: [OrdersController, PaymentsController],
  providers: [
    PricingService,
    OrdersService,
    PaymentsService,
    OrderSnapshotProcessor,
    PrintSyncService,
  ],
  exports: [OrdersService, PricingService],
})
export class OrdersModule {}
