import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Brand } from '@prisma/client';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { The1MockClient } from '../integration/the1/the1-mock.client';
import { The1TokenRefreshJob } from './jobs/the1-token-refresh.job';
import { The1TokenRepository } from './repositories/the1-token.repository';
import { AuthRateLimiterService } from './services/auth-rate-limiter.service';
import { LineHttpTokenVerifier } from './services/line-token-verifier.service';
import { SessionTokenService } from './services/session-token.service';

// ชุดทดสอบ Unit Test สำหรับ LineHttpTokenVerifier, SessionTokenService, AuthRateLimiterService และ The1TokenRefreshJob
describe('Auth Services & Jobs Unit Tests', () => {
  const testHexKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testHmacSecret = 'blind_index_hmac_secret_key_for_unit_testing_32chars';

  it('LineHttpTokenVerifier ควรส่ง id_token และ client_id (LINE_CHANNEL_ID) ไปยัง LINE Verify Endpoint และคืน sub เป็น lineUid', async () => {
    process.env.LINE_LIFF_CHANNEL_ID_TWD = 'TWD_CHANNEL_999';
    const capturedCalls: Array<{ url: string; body: string }> = [];

    const verifier = new LineHttpTokenVerifier(
      'https://api.line.me/oauth2/v2.1/verify',
      async (url, formBody) => {
        capturedCalls.push({ url, body: formBody });
        return {
          status: 200,
          body: {
            sub: 'U_VERIFIED_FROM_LINE_SERVER',
            aud: 'TWD_CHANNEL_999',
            name: 'Somchai',
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
        };
      },
    );

    const verified = await verifier.verifyIdToken('raw-liff-id-token', Brand.TWD);
    expect(verified.lineUid).toBe('U_VERIFIED_FROM_LINE_SERVER');
    expect(verified.channelId).toBe('TWD_CHANNEL_999');
    expect(capturedCalls[0].body).toContain('id_token=raw-liff-id-token');
    expect(capturedCalls[0].body).toContain('client_id=TWD_CHANNEL_999');
  });

  it('LineHttpTokenVerifier ควรโยน UnauthorizedException เมื่อ LINE Verify Endpoint ตอบกลับไม่สำเร็จ', async () => {
    const verifier = new LineHttpTokenVerifier(
      'https://api.line.me/oauth2/v2.1/verify',
      async () => ({
        status: 400,
        body: { error: 'invalid_request', error_description: 'Invalid IdToken' },
      }),
    );

    await expect(
      verifier.verifyIdToken('bad-token', Brand.TWD),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('SessionTokenService ควรออก JWT อายุสั้น + Refresh Token, ตรวจสอบลายเซ็น และเพิกถอน Session ได้', () => {
    const service = new SessionTokenService(
      'super_secret_jwt_signing_key_for_unit_test_12345',
      300,
      86400,
    );

    const issued = service.issueSessionTokens({
      memberId: 'T1_MEM_001',
      lineUid: 'U_LINE_001',
      brand: Brand.TWD,
    });

    const accessPayload = service.verifyToken(issued.accessToken, 'access');
    expect(accessPayload.sub).toBe('T1_MEM_001');
    expect(accessPayload.lineUid).toBe('U_LINE_001');
    expect(accessPayload.brand).toBe(Brand.TWD);

    service.revokeSession(accessPayload.jti);
    expect(() => service.verifyToken(issued.accessToken)).toThrow(
      UnauthorizedException,
    );
    expect(() => service.verifyToken(issued.refreshToken)).toThrow(
      UnauthorizedException,
    );
  });

  it('AuthRateLimiterService ควรบล็อกคำขอที่เกินขีดจำกัดต่อ IP และต่อ line_uid ด้วย HTTP 429', () => {
    const limiter = new AuthRateLimiterService({
      maxPerIp: 2,
      maxPerLineUid: 2,
      windowMs: 60_000,
    });

    limiter.consumeIp('10.0.0.1');
    limiter.consumeIp('10.0.0.1');
    expect(() => limiter.consumeIp('10.0.0.1')).toThrow(HttpException);

    try {
      limiter.consumeIp('10.0.0.1');
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    limiter.consumeLineUid('U_RATE_TEST');
    limiter.consumeLineUid('U_RATE_TEST');
    expect(() => limiter.consumeLineUid('U_RATE_TEST')).toThrow(HttpException);
  });

  it('The1TokenRefreshJob ควรต่ออายุเฉพาะ Token ที่จะหมดเวลาภายใน 5 นาที และบันทึกค่าใหม่แบบเข้ารหัส', async () => {
    const encryption = new EncryptionService(testHexKey, testHmacSecret);
    const the1Mock = new The1MockClient();
    const initialToken = await the1Mock.getToken({
      otpRef: 'REF-1',
      otpCode: '123456',
      memberId: 'T1_MEM_001',
    });

    const now = new Date('2026-11-02T12:00:00.000Z');
    const expiresIn4Min = new Date(now.getTime() + 4 * 60 * 1000);

    const tokenStore = new Map<
      string,
      { memberId: string; accessToken: string; refreshToken: string; expiresAt: Date }
    >();
    tokenStore.set('T1_MEM_001', {
      memberId: 'T1_MEM_001',
      accessToken: encryption.encrypt(initialToken.accessToken),
      refreshToken: encryption.encrypt(initialToken.refreshToken),
      expiresAt: expiresIn4Min,
    });
    tokenStore.set('T1_MEM_002', {
      memberId: 'T1_MEM_002',
      accessToken: encryption.encrypt('expired-access-token'),
      refreshToken: encryption.encrypt('expired-refresh-token'),
      expiresAt: expiresIn4Min,
    });

    const prismaMock = {
      the1Token: {
        findMany: jest.fn().mockImplementation(() =>
          Promise.resolve(Array.from(tokenStore.values())),
        ),
        upsert: jest.fn().mockImplementation((args: { create: { memberId: string; accessToken: string; refreshToken: string; expiresAt: Date } }) => {
          tokenStore.set(args.create.memberId, args.create);
          return Promise.resolve(args.create);
        }),
        findUnique: jest.fn().mockImplementation((args: { where: { memberId: string } }) =>
          Promise.resolve(tokenStore.get(args.where.memberId) ?? null),
        ),
      },
    } as unknown as PrismaService;

    const auditMock = {
      recordAudit: jest.fn().mockResolvedValue({}),
    } as unknown as AuditLogRepository;

    const tokenRepo = new The1TokenRepository(prismaMock, encryption);
    const job = new The1TokenRefreshJob(tokenRepo, the1Mock, auditMock);

    const summary = await job.runRefreshCycle(now);
    expect(summary.scannedCount).toBe(2);
    expect(summary.refreshedCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.refreshedMemberIds).toEqual(['T1_MEM_001']);
    expect(summary.failedMemberIds).toEqual(['T1_MEM_002']);

    const updated = await tokenRepo.findByMemberId('T1_MEM_001');
    expect(updated?.accessToken).toContain('mock-access-refreshed-T1_MEM_001');
  });
});
