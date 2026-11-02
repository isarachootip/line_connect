import { ConflictException } from '@nestjs/common';
import {
  Brand,
  Coupon,
  CouponSource,
  CouponWallet,
  CouponWalletStatus,
  Prisma,
} from '@prisma/client';
import {
  DomainEventBus,
  MEMBER_REGISTERED_EVENT,
  MISSION_COMPLETED_EVENT,
} from '../../common/events/domain-event-bus';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { The1MockClient } from '../integration/the1/the1-mock.client';
import { CouponController } from './coupon.controller';
import { NoopThe1ECouponProvider } from './interfaces/the1-ecoupon.interface';
import { CouponRepository, CreateCouponInput } from './repositories/coupon.repository';
import { CouponExpirySchedulerService } from './services/coupon-expiry.scheduler';
import { CouponService, FIRST_REGISTRATION_COUPON_CODE } from './services/coupon.service';

// ชุดทดสอบสำหรับโมดูล Coupon Wallet, คูปองลงทะเบียนครั้งแรก, การใช้คูปองพร้อมกัน 2 Request, Reward จาก Mission และ Nightly Job
describe('CouponModule Unit & Concurrency Tests (Prompt 8)', () => {
  function createInMemoryCouponTestContext() {
    const eventBus = new DomainEventBus();
    const the1Mock = new The1MockClient();
    const couponsByCode = new Map<string, Coupon>();
    const couponsById = new Map<string, Coupon>();
    const walletRows = new Map<string, CouponWallet>();

    const prismaMock = {
      coupon: {
        create: jest.fn(async ({ data }: { data: CreateCouponInput & { value: Prisma.Decimal; maxDiscount: Prisma.Decimal | null } }) => {
          const coupon: Coupon = {
            couponId: data.couponId ?? `cpn-${couponsById.size + 1}`,
            code: data.code,
            source: data.source,
            type: data.type,
            value: data.value,
            maxDiscount: data.maxDiscount,
            validFrom: data.validFrom,
            validTo: data.validTo,
          };
          couponsByCode.set(coupon.code, coupon);
          couponsById.set(coupon.couponId, coupon);
          return coupon;
        }),
        upsert: jest.fn(async ({ where, create, update }: { where: { code: string }; create: Coupon; update: Partial<Coupon> }) => {
          const existing = couponsByCode.get(where.code);
          const saved: Coupon = existing
            ? { ...existing, ...update }
            : { ...create, couponId: create.couponId ?? `cpn-${couponsById.size + 1}` };
          couponsByCode.set(saved.code, saved);
          couponsById.set(saved.couponId, saved);
          return saved;
        }),
        findUnique: jest.fn(async ({ where }: { where: { couponId?: string; code?: string } }) => {
          if (where.couponId) return couponsById.get(where.couponId) ?? null;
          if (where.code) return couponsByCode.get(where.code) ?? null;
          return null;
        }),
      },
      couponWallet: {
        create: jest.fn(async ({ data }: { data: Omit<CouponWallet, 'id'> }) => {
          const row: CouponWallet = { id: `wallet-${walletRows.size + 1}`, ...data };
          walletRows.set(row.id, row);
          return row;
        }),
        findMany: jest.fn(async ({ where }: { where?: { memberId?: string; couponId?: string; status?: CouponWalletStatus } }) =>
          Array.from(walletRows.values())
            .filter(
              (r) =>
                (!where?.memberId || r.memberId === where.memberId) &&
                (!where?.couponId || r.couponId === where.couponId) &&
                (!where?.status || r.status === where.status),
            )
            .map((r) => ({ ...r, coupon: couponsById.get(r.couponId)! })),
        ),
        updateMany: jest.fn(async ({ where, data }: { where: { id?: string; memberId?: string; status?: CouponWalletStatus; coupon?: { validTo: { lt: Date } } }; data: Partial<CouponWallet> }) => {
          let count = 0;
          for (const [id, row] of walletRows.entries()) {
            const cpn = couponsById.get(row.couponId);
            const matchId = !where.id || row.id === where.id;
            const matchMember = !where.memberId || row.memberId === where.memberId;
            const matchStatus = !where.status || row.status === where.status;
            const matchExpired = !where.coupon?.validTo?.lt || (cpn && cpn.validTo.getTime() < where.coupon.validTo.lt.getTime());
            if (matchId && matchMember && matchStatus && matchExpired) {
              walletRows.set(id, { ...row, ...data });
              count += 1;
            }
          }
          return { count };
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;

    const couponRepo = new CouponRepository(prismaMock);
    const auditRepo = new AuditLogRepository(prismaMock);
    const couponService = new CouponService(couponRepo, the1Mock, eventBus, auditRepo);
    const expiryScheduler = new CouponExpirySchedulerService(couponRepo, auditRepo);
    const controller = new CouponController(couponService);

    return { eventBus, the1Mock, couponRepo, couponService, expiryScheduler, controller };
  }

  it('ลงทะเบียนซ้ำไม่ได้คูปองซ้ำ: เมื่อได้รับ member.registered ซ้ำหลายครั้ง ต้องแจกคูปอง Online First Registration (ลด 20% สูงสุด 400 บาท) เพียงใบเดียว', async () => {
    const { eventBus, controller, couponService } = createInMemoryCouponTestContext();
    const memberId = 'T1_MEM_001';

    await Promise.all([
      eventBus.publish(MEMBER_REGISTERED_EVENT, {
        eventName: MEMBER_REGISTERED_EVENT,
        memberId,
        lineUid: 'U_LINE_1',
        brand: Brand.TWD,
        occurredAt: new Date('2026-11-02T10:00:00.000Z'),
      }),
      eventBus.publish(MEMBER_REGISTERED_EVENT, {
        eventName: MEMBER_REGISTERED_EVENT,
        memberId,
        lineUid: 'U_LINE_1',
        brand: Brand.BNB,
        occurredAt: new Date('2026-11-02T10:00:00.000Z'),
      }),
    ]);
    await eventBus.publish(MEMBER_REGISTERED_EVENT, {
      eventName: MEMBER_REGISTERED_EVENT,
      memberId,
      lineUid: 'U_LINE_1',
      brand: Brand.TWD,
      occurredAt: new Date('2026-11-02T10:05:00.000Z'),
    });

    const req = { sessionUser: { jti: 'j1', sub: memberId, lineUid: 'U_LINE_1', brand: Brand.TWD, type: 'access' as const, iat: 1, exp: 9999999999 } };
    const listRes = await controller.listMyCoupons(req, 'available');

    expect(listRes.coupons).toHaveLength(1);
    expect(listRes.coupons[0]).toMatchObject({
      code: FIRST_REGISTRATION_COUPON_CODE,
      value: 20,
      maxDiscount: 400,
      status: 'available',
    });
    couponService.onModuleDestroy();
  });

  it('ใช้คูปองซ้ำพร้อมกัน 2 Request (Concurrent Redemption): ต้องสำเร็จเพียง 1 Request และอีก 1 Request ต้องถูกปฏิเสธด้วย ConflictException', async () => {
    const { eventBus, controller, couponService } = createInMemoryCouponTestContext();
    const memberId = 'T1_MEM_001';

    await eventBus.publish(MEMBER_REGISTERED_EVENT, {
      eventName: MEMBER_REGISTERED_EVENT,
      memberId,
      lineUid: 'U_LINE_1',
      brand: Brand.TWD,
      occurredAt: new Date('2026-11-02T10:00:00.000Z'),
    });

    const req = { sessionUser: { jti: 'j1', sub: memberId, lineUid: 'U_LINE_1', brand: Brand.TWD, type: 'access' as const, iat: 1, exp: 9999999999 } };
    const available = await controller.listMyCoupons(req, 'available');
    const walletId = available.coupons[0].walletId;

    const results = await Promise.allSettled([
      controller.useMyCoupon(req, walletId),
      controller.useMyCoupon(req, walletId),
    ]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof controller.useMyCoupon>>> => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(fulfilled[0].value.status).toBe('used');
    expect(fulfilled[0].value.redemptionCode).toContain(FIRST_REGISTRATION_COUPON_CODE);
    expect(fulfilled[0].value.qrPayload).toContain(`LINECONNECT:COUPON:${memberId}`);

    const usedList = await controller.listMyCoupons(req, 'used');
    expect(usedList.coupons).toHaveLength(1);
    couponService.onModuleDestroy();
  });

  it('ควรแจก Reward จาก mission.completed (ทั้งคะแนน The 1 และคูปอง), เปลี่ยนคูปองหมดอายุเป็น expired ด้วย Nightly Job และรองรับ The1ECouponProvider', async () => {
    const { eventBus, the1Mock, couponRepo, expiryScheduler, controller, couponService } = createInMemoryCouponTestContext();
    const memberId = 'T1_MEM_001';
    const earnSpy = jest.spyOn(the1Mock, 'earnPoint');

    await eventBus.publish(MISSION_COMPLETED_EVENT, {
      eventName: MISSION_COMPLETED_EVENT,
      missionId: 'MIS-REWARD-01',
      memberId,
      progress: 10000,
      target: 10000,
      reward: { type: 'THE1_POINT', points: 300, couponCode: 'MISSION_BONUS_150', value: 150, maxDiscount: 150 },
      completedAt: new Date('2026-11-02T12:00:00.000Z'),
    });

    expect(earnSpy).toHaveBeenCalledTimes(1);
    expect(earnSpy).toHaveBeenCalledWith(memberId, 300, 'MISSION:MIS-REWARD-01:T1_MEM_001');

    const expiredCoupon = await couponRepo.createCoupon({
      code: 'EXPIRED_CPN_01',
      source: CouponSource.TWD,
      type: 'DISCOUNT_AMOUNT',
      value: 100,
      maxDiscount: 100,
      validFrom: new Date('2026-10-01T00:00:00.000Z'),
      validTo: new Date('2026-10-31T23:59:59.000Z'),
    });
    await couponRepo.grantCouponToMember(memberId, expiredCoupon.couponId);

    const jobResult = await expiryScheduler.expireOutdatedCoupons(new Date('2026-11-02T23:59:00.000Z'));
    expect(jobResult.expiredCount).toBe(1);

    const req = { sessionUser: { jti: 'j1', sub: memberId, lineUid: 'U_LINE_1', brand: Brand.TWD, type: 'access' as const, iat: 1, exp: 9999999999 } };
    const expiredList = await controller.listMyCoupons(req, 'expired');
    expect(expiredList.coupons).toHaveLength(1);
    expect(expiredList.coupons[0].code).toBe('EXPIRED_CPN_01');

    const ecouponProvider = new NoopThe1ECouponProvider();
    expect(await ecouponProvider.listMemberECoupons(memberId)).toEqual([]);
    couponService.onModuleDestroy();
  });
});
