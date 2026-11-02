import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { StructuredJsonLogger } from '../../../common/logger/structured-json.logger';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { CouponRepository } from '../repositories/coupon.repository';

export interface CouponExpiryJobResult {
  readonly expiredCount: number;
  readonly executedAt: Date;
}

// บริการรันงานประจำวันทุกคืน (Nightly Job) สำหรับเปลี่ยนสถานะคูปองที่หมดอายุแล้วให้เป็น expired
@Injectable()
export class CouponExpirySchedulerService implements OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly logger = new StructuredJsonLogger();

  constructor(
    private readonly couponRepo: CouponRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  // เริ่มต้นตั้งเวลาตรวจสอบคูปองหมดอายุอัตโนมัติ (ค่าเริ่มต้นทุก 24 ชั่วโมง)
  startScheduler(intervalMs = 24 * 60 * 60 * 1000): void {
    this.stopScheduler();
    this.timer = setInterval(() => {
      void this.expireOutdatedCoupons();
    }, intervalMs);
    this.timer.unref();
  }

  // หยุดการทำงานของ Scheduler
  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onModuleDestroy(): void {
    this.stopScheduler();
  }

  // ประมวลผลเปลี่ยนสถานะคูปองในกระเป๋าที่ validTo < now และยังเป็น available ให้เป็น expired
  async expireOutdatedCoupons(now: Date = new Date()): Promise<CouponExpiryJobResult> {
    const expiredCount = await this.couponRepo.expireOutdatedWalletCoupons(now);
    await this.auditRepo.recordAudit({
      actor: 'system:coupon-expiry-scheduler',
      action: 'COUPONS_EXPIRED_BATCH',
      target: 'coupon_wallet',
      metadata: {
        expiredCount,
        executedAt: now.toISOString(),
      },
    });
    this.logger.log('ประมวลผลเปลี่ยนสถานะคูปองหมดอายุประจำวันสำเร็จ', {
      expiredCount,
      executedAt: now.toISOString(),
    });
    return { expiredCount, executedAt: now };
  }
}
