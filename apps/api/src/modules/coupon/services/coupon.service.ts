import {
  CouponSource as SharedCouponSource,
  CouponWalletStatus as SharedCouponWalletStatus,
  MemberCouponItemDto,
  MemberCouponListResponseDto,
  UseCouponResponseDto,
} from '@line-connect/shared';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { CouponSource, CouponWalletStatus } from '@prisma/client';
import {
  DomainEventBus,
  MEMBER_REGISTERED_EVENT,
  MISSION_COMPLETED_EVENT,
  MemberRegisteredEvent,
  MissionCompletedEvent,
} from '../../../common/events/domain-event-bus';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { THE1_CLIENT_TOKEN, The1Client } from '../../integration/the1/the1.interface';
import { CouponRepository, CouponWalletWithDetail } from '../repositories/coupon.repository';

export const FIRST_REGISTRATION_COUPON_CODE = 'ONLINE_FIRST_REG_20';

// บริการหลักของโมดูล Coupon: แจกคูปองลงทะเบียนครั้งแรก, แจก Reward จาก Mission, แสดงรายการคูปอง และตัดสิทธิ์คูปองแบบ Atomic
@Injectable()
export class CouponService implements OnModuleDestroy {
  private readonly unsubscribers: Array<() => void> = [];
  private readonly registrationLocks = new Set<string>();
  private readonly fulfilledMissionKeys = new Set<string>();
  private readonly inFlightRedemptions = new Set<string>();

  constructor(
    private readonly couponRepo: CouponRepository,
    @Inject(THE1_CLIENT_TOKEN) private readonly the1Client: The1Client,
    private readonly eventBus: DomainEventBus,
    private readonly auditRepo: AuditLogRepository,
  ) {
    this.unsubscribers.push(
      this.eventBus.subscribe(MEMBER_REGISTERED_EVENT, (evt) => this.handleMemberRegistered(evt)),
      this.eventBus.subscribe(MISSION_COMPLETED_EVENT, (evt) => this.handleMissionCompleted(evt)),
    );
  }

  onModuleDestroy(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
  }

  // รับอีเวนต์ member.registered: แจกคูปอง "Online First Registration" ส่วนลด 20% สูงสุด 400 บาท เพียงครั้งเดียวต่อสมาชิก
  async handleMemberRegistered(event: MemberRegisteredEvent): Promise<void> {
    if (this.registrationLocks.has(event.memberId)) return;
    this.registrationLocks.add(event.memberId);

    try {
      const now = event.occurredAt ?? new Date();
      const welcomeCoupon = await this.couponRepo.upsertCouponByCode({
        couponId: 'CPN-ONLINE-FIRST-REG',
        code: FIRST_REGISTRATION_COUPON_CODE,
        source: CouponSource.TWD,
        type: 'ONLINE_FIRST_REGISTRATION_20_PERCENT',
        value: 20,
        maxDiscount: 400,
        validFrom: now,
        validTo: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      });

      if (await this.couponRepo.hasMemberReceivedCoupon(event.memberId, welcomeCoupon.couponId)) return;
      await this.couponRepo.grantCouponToMember(event.memberId, welcomeCoupon.couponId);
      await this.auditRepo.recordAudit({
        actor: 'system:coupon-service',
        action: 'FIRST_REGISTRATION_COUPON_GRANTED',
        target: event.memberId,
        metadata: { couponCode: FIRST_REGISTRATION_COUPON_CODE, discountPercent: 20, maxDiscount: 400 },
      });
    } finally {
      this.registrationLocks.delete(event.memberId);
    }
  }

  // รับอีเวนต์ mission.completed: แจก Reward ตามที่กำหนดใน mission.reward (คูปอง และ/หรือ คะแนน The 1)
  async handleMissionCompleted(event: MissionCompletedEvent): Promise<void> {
    const dedupKey = `${event.memberId}:${event.missionId}`;
    if (this.fulfilledMissionKeys.has(dedupKey)) return;
    this.fulfilledMissionKeys.add(dedupKey);

    const reward = event.reward ?? {};
    const points = typeof reward.points === 'number' ? reward.points : 0;
    if ((reward.type === 'THE1_POINT' || points > 0) && points > 0) {
      const refId = `MISSION:${event.missionId}:${event.memberId}`;
      await this.the1Client.earnPoint(event.memberId, points, refId);
      await this.auditRepo.recordAudit({
        actor: 'system:coupon-service',
        action: 'MISSION_REWARD_POINTS_EARNED',
        target: event.memberId,
        metadata: { missionId: event.missionId, points, refId },
      });
    }

    const couponCode =
      typeof reward.couponCode === 'string'
        ? reward.couponCode
        : reward.type === 'COUPON'
          ? `MISSION_CPN_${event.missionId}`
          : null;

    if (couponCode) {
      const now = event.completedAt ?? new Date();
      const value = typeof reward.value === 'number' ? reward.value : 100;
      const coupon = await this.couponRepo.upsertCouponByCode({
        code: couponCode,
        source: CouponSource.TWD,
        type: typeof reward.discountType === 'string' ? reward.discountType : 'DISCOUNT_AMOUNT',
        value,
        maxDiscount: typeof reward.maxDiscount === 'number' ? reward.maxDiscount : value,
        validFrom: now,
        validTo: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      });
      await this.couponRepo.grantCouponToMember(event.memberId, coupon.couponId);
      await this.auditRepo.recordAudit({
        actor: 'system:coupon-service',
        action: 'MISSION_REWARD_COUPON_GRANTED',
        target: event.memberId,
        metadata: { missionId: event.missionId, couponId: coupon.couponId, couponCode },
      });
    }
  }

  // GET /me/coupons — ดึงรายการคูปองของสมาชิกพร้อมกรองตามสถานะ (available, used, expired)
  async getMemberCoupons(memberId: string, status?: CouponWalletStatus): Promise<MemberCouponListResponseDto> {
    const rows = await this.couponRepo.findMemberCouponsByStatus(memberId, status);
    return {
      memberId,
      filterStatus: status ? (status as unknown as SharedCouponWalletStatus) : null,
      coupons: rows.map((row) => this.toCouponItemDto(row)),
    };
  }

  // POST /me/coupons/:id/use — เปลี่ยนสถานะเป็น used แบบ Atomic ป้องกันใช้ซ้ำ และคืนโค้ด/QR สำหรับหน้าร้าน
  async useCoupon(memberId: string, idOrCouponId: string, now: Date = new Date()): Promise<UseCouponResponseDto> {
    const walletItem = await this.couponRepo.findMemberWalletItem(memberId, idOrCouponId);
    if (!walletItem) throw new NotFoundException(`ไม่พบคูปองรหัส ${idOrCouponId} ในกระเป๋าของสมาชิก`);

    const lockKey = `${memberId}:${walletItem.id}`;
    if (this.inFlightRedemptions.has(lockKey)) {
      throw new ConflictException('คูปองนี้ถูกใช้งานไปแล้วหรือกำลังอยู่ระหว่างดำเนินการ');
    }
    this.inFlightRedemptions.add(lockKey);

    try {
      if (walletItem.status !== CouponWalletStatus.available) {
        throw new ConflictException(`ไม่สามารถใช้คูปองได้เนื่องจากสถานะปัจจุบันคือ ${walletItem.status}`);
      }
      if (walletItem.coupon.validTo.getTime() < now.getTime()) {
        throw new ConflictException('คูปองนี้หมดอายุแล้ว ไม่สามารถใช้งานได้');
      }
      const redeemed = await this.couponRepo.redeemWalletCouponAtomically(walletItem.id, memberId, now);
      if (!redeemed) throw new ConflictException('คูปองนี้ถูกใช้งานไปแล้ว');

      const redemptionCode = `${walletItem.coupon.code}-${walletItem.id.slice(0, 8).toUpperCase()}`;
      const qrPayload = `LINECONNECT:COUPON:${memberId}:${walletItem.coupon.code}:${walletItem.id}`;
      await this.auditRepo.recordAudit({
        actor: memberId,
        action: 'COUPON_USED',
        target: walletItem.id,
        metadata: { couponId: walletItem.couponId, code: walletItem.coupon.code },
      });

      return {
        walletId: walletItem.id,
        couponId: walletItem.couponId,
        code: walletItem.coupon.code,
        status: SharedCouponWalletStatus.USED,
        usedAt: now.toISOString(),
        redemptionCode,
        qrPayload,
      };
    } finally {
      this.inFlightRedemptions.delete(lockKey);
    }
  }

  private toCouponItemDto(row: CouponWalletWithDetail): MemberCouponItemDto {
    return {
      walletId: row.id,
      couponId: row.couponId,
      code: row.coupon.code,
      source: row.coupon.source as unknown as SharedCouponSource,
      type: row.coupon.type,
      value: Number(row.coupon.value),
      maxDiscount: row.coupon.maxDiscount !== null ? Number(row.coupon.maxDiscount) : null,
      status: row.status as unknown as SharedCouponWalletStatus,
      usedAt: row.usedAt ? row.usedAt.toISOString() : null,
      validFrom: row.coupon.validFrom.toISOString(),
      validTo: row.coupon.validTo.toISOString(),
    };
  }
}
