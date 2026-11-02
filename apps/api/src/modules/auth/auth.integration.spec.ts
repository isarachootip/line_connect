import { ConflictException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Brand } from '@prisma/client';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { DomainEventBus, MEMBER_REGISTERED_EVENT } from '../../common/events/domain-event-bus';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { The1MockClient } from '../integration/the1/the1-mock.client';
import { The1ApiError } from '../integration/the1/the1.interface';
import { MemberProfileRepository } from '../member/repositories/member-profile.repository';
import { AuthController } from './auth.controller';
import { ConsentRepository } from './repositories/consent.repository';
import { LineLinkRepository } from './repositories/line-link.repository';
import { The1TokenRepository } from './repositories/the1-token.repository';
import { AuthRateLimiterService } from './services/auth-rate-limiter.service';
import { AuthService } from './services/auth.service';
import { LineMockTokenVerifier } from './services/line-token-verifier.service';
import { SessionTokenService } from './services/session-token.service';
import { The1LinkingTransactionService } from './services/the1-linking-transaction.service';
import { InMemoryAuthDbState, createInMemoryAuthPrisma } from './testing/in-memory-auth-prisma.helper';

// ชุดทดสอบ Integration Test สำหรับโมดูล Auth & Linking ครบทุกเส้นทางตาม Prompt 4
describe('AuthModule Integration Tests (LINE Auth, The 1 Callback, Transaction, Duplicate Link, Logout & Rate Limit)', () => {
  const testHexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testHmacSecret = 'blind_index_hmac_secret_key_for_unit_testing_32chars';

  let controller: AuthController;
  let eventBus: DomainEventBus;
  let lineLinkRepo: LineLinkRepository;
  let dbState: InMemoryAuthDbState;

  beforeEach(() => {
    const { prisma, state } = createInMemoryAuthPrisma();
    dbState = state;
    const encryption = new EncryptionService(testHexKey, testHmacSecret);
    lineLinkRepo = new LineLinkRepository(prisma);
    const consentRepo = new ConsentRepository(prisma);
    const tokenRepo = new The1TokenRepository(prisma, encryption);
    const profileRepo = new MemberProfileRepository(prisma, encryption);
    const auditRepo = new AuditLogRepository(prisma);
    const the1Client = new The1MockClient();
    const lineVerifier = new LineMockTokenVerifier();
    const sessionService = new SessionTokenService('integration_test_jwt_secret_key_at_least_32_chars', 900, 604800);
    const rateLimiter = new AuthRateLimiterService({ maxPerIp: 10, maxPerLineUid: 5, windowMs: 60_000 });
    eventBus = new DomainEventBus();
    const txService = new The1LinkingTransactionService(prisma, lineLinkRepo, consentRepo, tokenRepo, profileRepo);
    const authService = new AuthService(lineVerifier, the1Client, lineLinkRepo, tokenRepo, txService, sessionService, rateLimiter, eventBus, auditRepo);
    controller = new AuthController(authService);
  });

  it('เส้นทางที่ 1: ลูกค้ายังไม่ผูกบัญชี -> POST /auth/line คืน linked=false (ไม่เชื่อ UID จาก client) -> POST /auth/the1/callback บันทึกครบใน Transaction เดียว + ส่ง member.registered -> POST /auth/line ครั้งถัดไปคืน linked=true', async () => {
    const step1 = await controller.loginWithLine(
      { idToken: 'mock-line-token-U_CUSTOMER_001', brand: Brand.TWD, lineUid: 'U_SPOOFED_BY_CLIENT' },
      '203.0.113.10',
    );
    expect(step1.linked).toBe(false);
    if (step1.linked) throw new Error('Expected linked=false');
    expect(step1.passportUrl).toContain('brand=TWD');
    expect(step1.passportUrl).toContain('state=');

    const callbackRes = await controller.handleThe1Callback(
      {
        state: step1.state,
        otpRef: 'OTP-REF-100',
        otpCode: '123456',
        memberId: 'T1_MEM_001',
        consent: { tncVersion: 'v2.1', pdpaVersion: 'v1.4' },
      },
      '203.0.113.10',
    );
    expect(callbackRes.linked).toBe(true);
    expect(callbackRes.memberId).toBe('T1_MEM_001');
    expect(callbackRes.isFirstRegistration).toBe(true);
    expect(callbackRes.accessToken).toBeDefined();

    expect(dbState.the1Tokens.get('T1_MEM_001')?.accessToken).not.toContain('mock-access');
    expect(dbState.memberProfiles.get('T1_MEM_001')?.firstName).not.toContain('สมชาย');
    expect(dbState.consents.map((c) => `${c.type}:${c.version}`)).toEqual(['TNC:v2.1', 'PDPA:v1.4']);
    expect(dbState.lineLinks.has('U_CUSTOMER_001:TWD')).toBe(true);
    expect(dbState.lineLinks.has('U_SPOOFED_BY_CLIENT:TWD')).toBe(false);

    const events = eventBus.getPublishedEvents(MEMBER_REGISTERED_EVENT);
    expect(events).toHaveLength(1);
    expect(events[0].memberId).toBe('T1_MEM_001');
    expect(events[0].lineUid).toBe('U_CUSTOMER_001');

    const step3 = await controller.loginWithLine(
      { idToken: 'mock-line-token-U_CUSTOMER_001', brand: Brand.TWD },
      '203.0.113.10',
    );
    expect(step3.linked).toBe(true);
  });

  it('เส้นทางที่ 2: ป้องกันการผูกซ้ำ (1 line_uid ต่อ 1 brand ผูกได้ 1 member) แต่ผูกคนละ brand ได้ และกรณีผูกใหม่หลัง unlink จะไม่ส่ง member.registered ซ้ำ', async () => {
    await controller.handleThe1Callback(
      { idToken: 'mock-line-token-U_DUP_USER', brand: Brand.TWD, otpRef: 'REF-1', otpCode: '123456', memberId: 'T1_MEM_001', tncVersion: 'v1.0', pdpaVersion: 'v1.0' },
      '203.0.113.20',
    );

    await expect(
      controller.handleThe1Callback(
        { idToken: 'mock-line-token-U_DUP_USER', brand: Brand.TWD, otpRef: 'REF-2', otpCode: '123456', memberId: 'T1_MEM_002', tncVersion: 'v1.0', pdpaVersion: 'v1.0' },
        '203.0.113.20',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const bnbRes = await controller.handleThe1Callback(
      { idToken: 'mock-line-token-U_DUP_USER', brand: Brand.BNB, otpRef: 'REF-3', otpCode: '123456', memberId: 'T1_MEM_001', tncVersion: 'v1.0', pdpaVersion: 'v1.0' },
      '203.0.113.20',
    );
    expect(bnbRes.linked).toBe(true);

    eventBus.clearPublishedEvents();
    await lineLinkRepo.unlinkMember('U_DUP_USER', Brand.TWD);
    const relinkRes = await controller.handleThe1Callback(
      { idToken: 'mock-line-token-U_DUP_USER', brand: Brand.TWD, otpRef: 'REF-4', otpCode: '123456', memberId: 'T1_MEM_001', tncVersion: 'v2.0', pdpaVersion: 'v2.0' },
      '203.0.113.20',
    );
    expect(relinkRes.isFirstRegistration).toBe(false);
    expect(eventBus.getPublishedEvents(MEMBER_REGISTERED_EVENT)).toHaveLength(0);
  });

  it('เส้นทางที่ 3: กรณี OTP ผิดพลาด, ส่งแต่ lineUid ดิบโดยไม่มี Token หรือเกิดข้อผิดพลาดระหว่าง Transaction ต้อง Rollback ทั้งหมด', async () => {
    await expect(
      controller.handleThe1Callback(
        { lineUid: 'U_RAW_CLIENT_UID_ONLY', brand: Brand.TWD, otpRef: 'REF-X', otpCode: '123456', tncVersion: 'v1.0', pdpaVersion: 'v1.0' },
        '203.0.113.30',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      controller.handleThe1Callback(
        { idToken: 'mock-line-token-U_BAD_OTP', brand: Brand.TWD, otpRef: 'REF-OTP', otpCode: '000000', tncVersion: 'v1.0', pdpaVersion: 'v1.0' },
        '203.0.113.30',
      ),
    ).rejects.toBeInstanceOf(The1ApiError);

    dbState.failOnConsentCreate = true;
    await expect(
      controller.handleThe1Callback(
        { idToken: 'mock-line-token-U_TX_ROLLBACK', brand: Brand.TWD, otpRef: 'REF-TX', otpCode: '123456', memberId: 'T1_MEM_002', tncVersion: 'v1.0', pdpaVersion: 'v1.0' },
        '203.0.113.30',
      ),
    ).rejects.toThrow('DB_TRANSACTION_SIMULATED_FAILURE');

    expect(dbState.the1Tokens.size).toBe(0);
    expect(dbState.lineLinks.size).toBe(0);
    expect(dbState.memberProfiles.size).toBe(0);
    expect(eventBus.getPublishedEvents(MEMBER_REGISTERED_EVENT)).toHaveLength(0);
  });

  it('เส้นทางที่ 4: POST /auth/logout ต้องเรียก The 1 logout, ลบ the1_token และเพิกถอน Session ทันที รวมถึงทดสอบ Rate Limit ต่อ IP และ line_uid', async () => {
    const linked = await controller.handleThe1Callback(
      { idToken: 'mock-line-token-U_LOGOUT_USER', brand: Brand.TWD, otpRef: 'REF-LOGOUT', otpCode: '123456', memberId: 'T1_MEM_003', tncVersion: 'v1.0', pdpaVersion: 'v1.0' },
      '203.0.113.40',
    );

    const logoutRes = await controller.logout({}, `Bearer ${linked.accessToken}`, '203.0.113.40');
    expect(logoutRes.success).toBe(true);
    expect(dbState.the1Tokens.has('T1_MEM_003')).toBe(false);

    await expect(
      controller.logout({}, `Bearer ${linked.accessToken}`, '203.0.113.40'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    for (let i = 0; i < 5; i += 1) {
      await controller.loginWithLine(
        { idToken: 'mock-line-token-U_SPAM_UID', brand: Brand.TWD },
        `198.51.100.${i + 1}`,
      );
    }
    await expect(
      controller.loginWithLine(
        { idToken: 'mock-line-token-U_SPAM_UID', brand: Brand.TWD },
        '198.51.100.99',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });
});
