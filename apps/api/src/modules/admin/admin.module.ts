import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IntegrationModule } from '../integration/integration.module';
import { AdminController } from './admin.controller';
import { AdminAuthGuard, AdminAuthService } from './guards/admin-auth.guard';
import { AdminBackofficeService } from './services/admin-backoffice.service';
import { AdminMemberSearchService } from './services/admin-member-search.service';

// โมดูล Admin สำหรับทีม IT-Division, ทีมการตลาด และฝ่ายบริการลูกค้า (SSO, RBAC, Mission, Coupon, Target Batch, Member Lookup)
@Module({
  imports: [AuditModule, IntegrationModule],
  controllers: [AdminController],
  providers: [
    {
      provide: AdminAuthService,
      useFactory: () => new AdminAuthService(),
    },
    AdminAuthGuard,
    AdminMemberSearchService,
    AdminBackofficeService,
  ],
  exports: [
    AdminAuthService,
    AdminAuthGuard,
    AdminMemberSearchService,
    AdminBackofficeService,
  ],
})
export class AdminModule {}
