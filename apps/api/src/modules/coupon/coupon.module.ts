import { Module } from '@nestjs/common';
import { CouponRepository } from './repositories/coupon.repository';

// โมดูล Coupon สำหรับจัดการคูปองส่วนลดและสิทธิพิเศษแยกตามแบรนด์ (TWD / BNB)
@Module({
  providers: [CouponRepository],
  exports: [CouponRepository],
})
export class CouponModule {}
