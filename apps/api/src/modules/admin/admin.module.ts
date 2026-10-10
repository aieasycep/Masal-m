import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthController, AdminController } from './admin.controller';

/** Admin realm: separate JWT, RBAC, audit trail (§39–§40, §45). */
@Module({
  imports: [OrdersModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService, AdminAuthGuard],
})
export class AdminModule {}
