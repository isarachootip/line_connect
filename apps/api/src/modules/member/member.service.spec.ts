import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Brand, Consent, ConsentType, CouponSource, CouponWalletStatus, Prisma } from '@prisma/client';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ConsentRepository } from '../auth/repositories/consent.repository';
import { SessionTokenService } from '../auth/services/session-token.service';
import { CouponRepository } from '../coupon/repositories/coupon.repository';
import { The1MockClient } from '../integration/the1/the1-mock.client';
import { The1ApiError } from '../integration/the1/the1.interface';
import { MissionRepository } from '../mission/repositories/mission.repository';
import { MemberProfileRepository } from './repositories/member-profile.repository';
import { MemberConsentService } from './services/member-consent.service';
import { MemberProfileCacheService } from './services/member-profile-cache.service';
import { MemberService } from './services/member.service';

// ชุดทดสอบ Unit Test สำหรับโมดูล Member (SessionAuthGuard, Redis Cache 10 นาที, Stale Fallback, Home, Profile, Consent)
describe('MemberModule Unit Tests (Cache 10m, Stale Fallback, Home, Profile & Consent)', () => {
  const testHexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testHmacSecret = 'blind_index_hmac_secret_key_for_unit_testing_32chars';

  it('SessionAuthGuard ต้องอนุญาตเฉพาะ Session JWT จาก Prompt 4 ที่ยังไม่หมดอายุหรือถูก Logout เท่านั้น', () => {
    const tokenService = new SessionTokenService('member_test_jwt_secret_key_at_least_32_characters', 900, 604800);
    const guard = new SessionAuthGuard(tokenService);
    const makeContext = (authHeader?: string) => {
      const req: { headers: Record<string, string | undefined>; sessionUser?: unknown } = {
        headers: { authorization: authHeader },
      };
      const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
      return { ctx, req };
    };

    expect(() => guard.canActivate(makeContext().ctx)).toThrow(UnauthorizedException);

    const issued = tokenService.issueSessionTokens({ memberId: 'T1_MEM_001', lineUid: 'U_LINE_001', brand: Brand.TWD });
    const valid = makeContext(`Bearer ${issued.accessToken}`);
    expect(guard.canActivate(valid.ctx)).toBe(true);
    expect(valid.req.sessionUser).toMatchObject({ sub: 'T1_MEM_001', lineUid: 'U_LINE_001', brand: Brand.TWD });

    tokenService.revokeSession(issued.sessionId);
    expect(() => guard.canActivate(makeContext(`Bearer ${issued.accessToken}`).ctx)).toThrow(UnauthorizedException);
  });

  it('MemberProfileCacheService ต้องแคช member_profile ใน Redis นาน 10 นาที (เข้ารหัสข้อมูล) และเมื่อ The 1 ล่มต้องคืนค่าแคชพร้อม stale=true และ refreshed_at', async () => {
    const redis = new RedisService();
    const encryption = new EncryptionService(testHexKey, testHmacSecret);
    const the1Mock = new The1MockClient();
    const getProfileSpy = jest.spyOn(the1Mock, 'getProfile');

    const prismaMock = {
      memberProfile: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const profileRepo = new MemberProfileRepository(prismaMock, encryption);
    const cacheService = new MemberProfileCacheService(redis, encryption, profileRepo, the1Mock, 600);

    const t0 = new Date('2026-11-02T10:00:00.000Z');
    const firstCall = await cacheService.getProfileWithFallback('T1_MEM_001', t0);
    expect(firstCall.stale).toBe(false);
    expect(firstCall.refreshedAt).toBe(t0.toISOString());
    expect(getProfileSpy).toHaveBeenCalledTimes(1);

    const rawRedisValue = await redis.getCache('member_profile:fresh:T1_MEM_001', t0.getTime());
    expect(rawRedisValue).not.toContain('สมชาย');

    const t5Min = new Date(t0.getTime() + 5 * 60 * 1000);
    const secondCall = await cacheService.getProfileWithFallback('T1_MEM_001', t5Min);
    expect(secondCall.stale).toBe(false);
    expect(secondCall.refreshedAt).toBe(t0.toISOString());
    expect(getProfileSpy).toHaveBeenCalledTimes(1);

    getProfileSpy.mockRejectedValueOnce(new The1ApiError('THE1_DOWN', 'The 1 Service Unavailable', 503, true));
    const t11Min = new Date(t0.getTime() + 11 * 60 * 1000);
    const fallbackCall = await cacheService.getProfileWithFallback('T1_MEM_001', t11Min);
    expect(fallbackCall.stale).toBe(true);
    expect(fallbackCall.refreshedAt).toBe(t0.toISOString());
    expect(fallbackCall.profile.firstName).toBe('สมชาย');
  });

  it('MemberService ควรจำกัดคูปองหน้า Home สูงสุด 5 ใบล่าสุด, คัดเฉพาะ Mission ที่กำลังทำ และบันทึก Consent MARKETING แบบ Insert แถวใหม่เสมอ', async () => {
    const redis = new RedisService();
    const encryption = new EncryptionService(testHexKey, testHmacSecret);
    const the1Mock = new The1MockClient();
    const now = new Date('2026-11-02T12:00:00.000Z');
    const consentStore: Consent[] = [];
    const mockConsentUpdate = jest.fn();

    const prismaMock = {
      memberProfile: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
      couponWallet: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 7 }, (_, idx) => ({
            id: `wallet-${idx + 1}`,
            memberId: 'T1_MEM_001',
            couponId: `cpn-${idx + 1}`,
            status: CouponWalletStatus.available,
            usedAt: null,
            coupon: {
              couponId: `cpn-${idx + 1}`,
              code: `CODE-${idx + 1}`,
              source: idx % 2 === 0 ? CouponSource.TWD : CouponSource.THE1,
              type: 'DISCOUNT_AMOUNT',
              value: new Prisma.Decimal(100),
              maxDiscount: new Prisma.Decimal(100),
              validFrom: now,
              validTo: new Date(now.getTime() + 86400000),
            },
          })),
        ),
      },
      mission: {
        findMany: jest.fn().mockResolvedValue([
          { missionId: 'M-IN-PROGRESS', name: 'สะสมยอดซื้อครบ 10,000 บาท', rule: {}, target: new Prisma.Decimal(10000), startAt: now, endAt: new Date(now.getTime() + 86400000), reward: {}, status: 'active' },
          { missionId: 'M-COMPLETED', name: 'ภารกิจที่สำเร็จแล้ว', rule: {}, target: new Prisma.Decimal(5000), startAt: now, endAt: new Date(now.getTime() + 86400000), reward: {}, status: 'active' },
        ]),
      },
      missionProgress: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'mp-1', memberId: 'T1_MEM_001', missionId: 'M-IN-PROGRESS', progress: new Prisma.Decimal(4000), completedAt: null },
          { id: 'mp-2', memberId: 'T1_MEM_001', missionId: 'M-COMPLETED', progress: new Prisma.Decimal(5000), completedAt: now },
        ]),
      },
      consent: {
        create: jest.fn(async ({ data }: { data: Omit<Consent, 'id'> }) => {
          const row: Consent = { id: `c-${consentStore.length + 1}`, ...data };
          consentStore.push(row);
          return row;
        }),
        update: mockConsentUpdate,
        findMany: jest.fn(async () => [...consentStore]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;

    const service = new MemberService(
      new MemberProfileCacheService(redis, encryption, new MemberProfileRepository(prismaMock, encryption), the1Mock, 600),
      new CouponRepository(prismaMock),
      new MissionRepository(prismaMock),
      new MemberConsentService(new ConsentRepository(prismaMock), new AuditLogRepository(prismaMock)),
      the1Mock,
    );

    const session = { jti: 'sess-1', sub: 'T1_MEM_001', lineUid: 'U_LINE_001', brand: Brand.TWD, type: 'access' as const, iat: 1000, exp: 2000 };

    const home = await service.getHome(session, now);
    expect(home.availableCoupons).toHaveLength(5);
    expect(home.activeMissions).toHaveLength(1);
    expect(home.activeMissions[0].missionId).toBe('M-IN-PROGRESS');
    expect(home.activeMissions[0].progressPercent).toBe(40);

    await service.updateMarketingConsent(session, { granted: true, version: 'v1.0' });
    const afterRevoke = await service.updateMarketingConsent(session, { granted: false, version: 'v1.0' });

    expect(afterRevoke.marketing?.granted).toBe(false);
    expect(afterRevoke.history).toHaveLength(2);
    expect(afterRevoke.history[0].type).toBe(ConsentType.MARKETING);
    expect(mockConsentUpdate).not.toHaveBeenCalled();
  });
});
