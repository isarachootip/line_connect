import {
  BrandCode,
  ConsentType,
  CouponSource,
  MemberConsentResponseDto,
  MemberHomeResponseDto,
  MemberProfileResponseDto,
} from '@line-connect/shared';
import { Brand, CouponWalletStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { ConsentRepository } from '../auth/repositories/consent.repository';
import { CouponRepository } from '../coupon/repositories/coupon.repository';
import { The1MockClient } from '../integration/the1/the1-mock.client';
import { MissionRepository } from '../mission/repositories/mission.repository';
import { MemberController } from './member.controller';
import { MemberProfileRepository } from './repositories/member-profile.repository';
import { MemberConsentService } from './services/member-consent.service';
import { MemberProfileCacheService } from './services/member-profile-cache.service';
import { MemberService } from './services/member.service';

// Contract Schemas สำหรับตรวจสอบว่า Response จากทุก Endpoint ของ /me/* ตรงตามสัญญาใน packages/shared 100%
const memberHomeResponseContractSchema: z.ZodType<MemberHomeResponseDto> = z.object({
  memberId: z.string().min(1),
  brand: z.nativeEnum(BrandCode),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  fullName: z.string().min(1),
  tier: z.string().min(1),
  points: z.object({
    twd: z.number().int().nonnegative(),
    bnb: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  availableCoupons: z.array(
    z.object({
      walletId: z.string().min(1),
      couponId: z.string().min(1),
      code: z.string().min(1),
      source: z.nativeEnum(CouponSource),
      type: z.string().min(1),
      value: z.number().nonnegative(),
      maxDiscount: z.number().nonnegative().nullable(),
      validFrom: z.string().datetime(),
      validTo: z.string().datetime(),
    }),
  ).max(5),
  activeMissions: z.array(
    z.object({
      missionId: z.string().min(1),
      name: z.string().min(1),
      target: z.number().positive(),
      progress: z.number().nonnegative(),
      progressPercent: z.number().min(0).max(100),
      completedAt: z.string().datetime().nullable(),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
    }),
  ),
  stale: z.boolean(),
  refreshed_at: z.string().datetime(),
});

const memberProfileResponseContractSchema: z.ZodType<MemberProfileResponseDto> = z.object({
  memberId: z.string().min(1),
  cardNumber: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  fullName: z.string().min(1),
  maskedPhone: z.string().regex(/^\d{3}-\*\*\*-\d{4}$/),
  maskedEmail: z.string().regex(/^.{1,2}\*\*\*@.+$/),
  tier: z.string().min(1),
  points: z.number().int().nonnegative(),
  pointClaimHistory: z.array(
    z.object({
      claimId: z.string().min(1),
      memberId: z.string().min(1),
      points: z.number().int(),
      type: z.enum(['EARN', 'REDEEM']),
      refId: z.string().min(1),
      occurredAt: z.string().datetime(),
    }),
  ),
  stale: z.boolean(),
  refreshed_at: z.string().datetime(),
});

const memberConsentResponseContractSchema: z.ZodType<MemberConsentResponseDto> = z.object({
  memberId: z.string().min(1),
  marketing: z.object({
    type: z.nativeEnum(ConsentType),
    version: z.string().min(1),
    granted: z.boolean(),
    updatedAt: z.string().datetime(),
  }).nullable(),
  history: z.array(
    z.object({
      id: z.string().min(1),
      type: z.nativeEnum(ConsentType),
      version: z.string().min(1),
      grantedAt: z.string().datetime().nullable(),
      revokedAt: z.string().datetime().nullable(),
    }),
  ),
});

// ชุดทดสอบ Contract Test ของ GET /me/home, GET /me/profile, GET /me/consent และ PUT /me/consent
describe('MemberController Response Contract Tests (/me/home, /me/profile, /me/consent)', () => {
  const testHexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testHmacSecret = 'blind_index_hmac_secret_key_for_unit_testing_32chars';

  it('ทุก Endpoint ภายใต้ /me/* ต้องคืนโครงสร้างตรงตาม Shared DTO Contract และ Mask ข้อมูลส่วนบุคคลครบถ้วน', async () => {
    const now = new Date('2026-11-02T12:00:00.000Z');
    const consentRows: Array<{ id: string; memberId: string; type: string; version: string; grantedAt: Date | null; revokedAt: Date | null }> = [];

    const prismaMock = {
      memberProfile: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
      couponWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-contract-1',
            memberId: 'T1_MEM_001',
            couponId: 'cpn-contract-1',
            status: CouponWalletStatus.available,
            usedAt: null,
            coupon: {
              couponId: 'cpn-contract-1',
              code: 'TWD500',
              source: 'TWD',
              type: 'DISCOUNT_AMOUNT',
              value: new Prisma.Decimal(500),
              maxDiscount: new Prisma.Decimal(500),
              validFrom: now,
              validTo: new Date(now.getTime() + 86400000),
            },
          },
        ]),
      },
      mission: {
        findMany: jest.fn().mockResolvedValue([
          { missionId: 'MIS-CONTRACT-1', name: 'ช้อปครบ 10,000 บาท รับ 500 คะแนน', rule: {}, target: new Prisma.Decimal(10000), startAt: now, endAt: new Date(now.getTime() + 86400000), reward: {}, status: 'active' },
        ]),
      },
      missionProgress: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'mp-contract-1', memberId: 'T1_MEM_001', missionId: 'MIS-CONTRACT-1', progress: new Prisma.Decimal(6500), completedAt: null },
        ]),
      },
      consent: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `consent-${consentRows.length + 1}`, ...data };
          consentRows.push(row);
          return row;
        }),
        findMany: jest.fn(async () => [...consentRows]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;

    const encryption = new EncryptionService(testHexKey, testHmacSecret);
    const the1Mock = new The1MockClient();
    const controller = new MemberController(
      new MemberService(
        new MemberProfileCacheService(new RedisService(), encryption, new MemberProfileRepository(prismaMock, encryption), the1Mock, 600),
        new CouponRepository(prismaMock),
        new MissionRepository(prismaMock),
        new MemberConsentService(new ConsentRepository(prismaMock), new AuditLogRepository(prismaMock)),
        the1Mock,
      ),
    );

    const authReq = {
      sessionUser: { jti: 'sess-contract-1', sub: 'T1_MEM_001', lineUid: 'U_CONTRACT_001', brand: Brand.TWD, type: 'access' as const, iat: 1000, exp: 9999999999 },
    };

    const homeRes = await controller.getHome(authReq);
    expect(memberHomeResponseContractSchema.parse(homeRes)).toEqual(homeRes);

    const profileRes = await controller.getProfile(authReq);
    expect(memberProfileResponseContractSchema.parse(profileRes)).toEqual(profileRes);
    expect(profileRes.maskedPhone).toBe('081-***-5678');
    expect(profileRes.maskedEmail).toBe('so***@thaiwatsadu.com');
    expect(JSON.stringify(profileRes)).not.toContain('0812345678');
    expect(JSON.stringify(profileRes)).not.toContain('somchai.builder@thaiwatsadu.com');
    expect(profileRes.pointClaimHistory.length).toBeGreaterThanOrEqual(1);

    const updatedConsent = await controller.updateConsent(authReq, { granted: true, version: 'v1.2' });
    expect(memberConsentResponseContractSchema.parse(updatedConsent)).toEqual(updatedConsent);

    const fetchedConsent = await controller.getConsent(authReq);
    expect(memberConsentResponseContractSchema.parse(fetchedConsent)).toEqual(fetchedConsent);
    expect(fetchedConsent.marketing?.granted).toBe(true);
    expect(fetchedConsent.marketing?.version).toBe('v1.2');
  });
});
