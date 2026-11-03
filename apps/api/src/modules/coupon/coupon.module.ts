import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { IntegrationModule } from '../integration/integration.module';
import { The1Module } from '../integration/the1/the1.module';
import { CouponController } from './coupon.controller';
import {
  NoopThe1ECouponProvider,
  THE1_ECOUPON_PROVIDER_TOKEN,
} from './interfaces/the1-ecoupon.interface';
import { CouponRepository } from './repositories/coupon.repository';
import { CouponExpirySchedulerService } from './services/coupon-expiry.scheduler';
import { CouponService } from './services/coupon.service';

// โมดูล Coupon สำหรับจัดการคูปองส่วนลด กระเป๋าคูปอง คูปองลงทะเบียนครั้งแรก และงานเปลี่ยนสถานะคูปองหมดอายุ
@Module({
  imports: [AuditModule, The1Module, IntegrationModule, forwardRef(() => AuthModule)],
  controllers: [CouponController],
  providers: [
    CouponRepository,
    CouponService,
    CouponExpirySchedulerService,
    NoopThe1ECouponProvider,
    {
      provide: THE1_ECOUPON_PROVIDER_TOKEN,
      useExisting: NoopThe1ECouponProvider,
    },
  ],
  exports: [
    CouponRepository,
    CouponService,
    CouponExpirySchedulerService,
    THE1_ECOUPON_PROVIDER_TOKEN,
  ],
})
export class CouponModule {}
