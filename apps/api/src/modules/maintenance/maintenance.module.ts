import { Module } from '@nestjs/common';
import { MaintenanceProcessor } from './maintenance.processor';

/** Scheduled housekeeping: auth-row pruning, push receipts, orphan upload sweeps. */
@Module({
  providers: [MaintenanceProcessor],
  exports: [MaintenanceProcessor],
})
export class MaintenanceModule {}
