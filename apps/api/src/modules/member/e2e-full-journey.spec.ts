import {
  Brand,
  Coupon,
  CouponWallet,
  CouponWalletStatus,
  LineLinkStatus,
  Mission,
  MissionProgress,
  Prisma,
  SpendingTxn,
  TargetBatch,
} from '@prisma/client';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { DomainEventBus } from '../../common/events/domain-event-bus';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { ConsentRepository } from '../auth/repositories/consent.repository';
import { LineLinkRepository } from '../auth/repositories/line-link.repository';
import { The1TokenRepository } from '../auth/repositories/the1-token.repository';
import { AuthRateLimiterService } from '../auth/services/auth-rate-limiter.service';
import { AuthService } from '../auth/services/auth.service';
import { LineMockTokenVerifier } from '../auth/services/line-token-verifier.service';
import { SessionTokenService } from '../auth/services/session-token.service';
import { The1LinkingTransactionService } from '../auth/services/the1-linking-transaction.service';
import { createInMemoryAuthPrisma } from '../auth/testing/in-memory-auth-prisma.helper';
import { CouponRepository } from '../coupon/repositories/coupon.repository';
import { CouponService, FIRST_REGISTRATION_COUPON_CODE } from '../coupon/services/coupon.service';
import { SftpMockClient } from '../integration/batch/sftp.client';
import { TargetBatchExportService } from '../integration/batch/target-batch-export.service';
import { SpendingDeadLetterRepository } from '../integration/repositories/spending-dead-letter.repository';
import { SpendingTxnRepository } from '../integration/repositories/spending-txn.repository';
import { TargetBatchRepository } from '../integration/repositories/target-batch.repository';
import { SpendingIngestionService } from '../integration/spending/spending-ingestion.service';
import { TwdSpendingMockClient } from '../integration/spending/twd-spending.client';
import { The1MockClient } from '../integration/the1/the1-mock.client';
import { MissionRepository } from '../mission/repositories/mission.repository';
import { MissionEngineService } from '../mission/services/mission-engine.service';
import { MissionRuleEvaluator } from '../mission/services/mission-rule.evaluator';
import { MemberProfileRepository } from './repositories/member-profile.repository';
import { MemberConsentService } from './services/member-consent.service';
import { PdpaRetentionService } from './services/pdpa-retention.service';

describe('Prompt 14 — End-to-End Full Customer Journey (7 E2E Scenarios)', () => {
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testSecret = 'e2e_blind_index_secret_32_characters_long_minimum';

  it('ทดสอบครบวงจร: ลงทะเบียนครั้งแรกได้คูปอง 20% -> Login ซ้ำไม่ต้อง OTP -> ยอดซื้อเข้า Mission progress ขึ้น -> Mission ครบได้ Reward -> ใช้คูปอง -> ถอน Consent -> Unlink', async () => {
    const { prisma: basePrisma, state } = createInMemoryAuthPrisma();
    const coupons = new Map<string, Coupon>();
    const wallets: CouponWallet[] = [];
    const txns = new Map<string, SpendingTxn>();
    const progresses = new Map<string, MissionProgress>();
    const missions: Mission[] = [
      {
        missionId: 'MIS-E2E-001',
        name: 'ช้อปครบ 10,000 บาท รับคูปองและแต้มพิเศษ',
        rule: { type: 'TOTAL_SPEND', brand: 'TWD' },
        target: new Prisma.Decimal(10000),
        startAt: new Date('2026-01-01T00:00:00Z'),
        endAt: new Date('2026-12-31T23:59:59Z'),
        reward: { points: 500, couponCode: 'MISSION_REWARD_500', value: 500 },
        status: 'active',
      },
    ];

    const prisma = {
      ...basePrisma,
      lineLink: {
        ...basePrisma.lineLink,
        findMany: jest.fn(async ({ where }: { where?: { status?: LineLinkStatus; brand?: Brand } }) =>
          Array.from(state.lineLinks.values()).filter((r) => (!where?.status || r.status === where.status) && (!where?.brand || r.brand === where.brand)),
        ),
      },
      consent: {
        ...basePrisma.consent,
        findMany: jest.fn(async ({ where }: { where?: { memberId?: string; type?: string } }) =>
          state.consents.filter((c) => (!where?.memberId || c.memberId === where.memberId) && (!where?.type || c.type === where.type)),
        ),
      },
      coupon: {
        upsert: jest.fn(async ({ where, create, update }: { where: { code: string }; create: Coupon; update: Partial<Coupon> }) => {
          const existing = Array.from(coupons.values()).find((c) => c.code === where.code);
          const row: Coupon = existing ? { ...existing, ...update } : { ...create, couponId: create.couponId ?? `CPN-${coupons.size + 1}` };
          coupons.set(row.couponId, row);
          return row;
        }),
      },
      couponWallet: {
        findMany: jest.fn(async ({ where }: { where: { memberId: string; couponId?: string; status?: CouponWalletStatus } }) =>
          wallets
            .filter((w) => w.memberId === where.memberId && (!where.couponId || w.couponId === where.couponId) && (!where.status || w.status === where.status))
            .map((w) => ({ ...w, coupon: coupons.get(w.couponId)! })),
        ),
        create: jest.fn(async ({ data }: { data: Omit<CouponWallet, 'id'> }) => {
          const row: CouponWallet = { id: `W-${wallets.length + 1}`, ...data };
          wallets.push(row);
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }: { where: { id: string; memberId: string; status: CouponWalletStatus }; data: Partial<CouponWallet> }) => {
          const idx = wallets.findIndex((w) => w.id === where.id && w.memberId === where.memberId && w.status === where.status);
          if (idx === -1) return { count: 0 };
          wallets[idx] = { ...wallets[idx], ...data };
          return { count: 1 };
        }),
      },
      spendingTxn: {
        findUnique: jest.fn(async ({ where }: { where: { txnId: string } }) => txns.get(where.txnId) ?? null),
        create: jest.fn(async ({ data }: { data: SpendingTxn }) => {
          txns.set(data.txnId, data);
          return data;
        }),
        findMany: jest.fn(async ({ where }: { where?: { memberId?: string } }) =>
          Array.from(txns.values()).filter((t) => !where?.memberId || t.memberId === where.memberId),
        ),
      },
      mission: {
        findMany: jest.fn(async () => missions),
        findUnique: jest.fn(async ({ where }: { where: { missionId: string } }) => missions.find((m) => m.missionId === where.missionId) ?? null),
      },
      missionProgress: {
        findUnique: jest.fn(async ({ where }: { where: { memberId_missionId: { memberId: string; missionId: string } } }) =>
          progresses.get(`${where.memberId_missionId.memberId}:${where.memberId_missionId.missionId}`) ?? null,
        ),
        upsert: jest.fn(async ({ where, create, update }: { where: { memberId_missionId: { memberId: string; missionId: string } }; create: MissionProgress; update: Partial<MissionProgress> }) => {
          const k = `${where.memberId_missionId.memberId}:${where.memberId_missionId.missionId}`;
          const row = progresses.get(k) ? { ...progresses.get(k)!, ...update } : { ...create, id: `mp-${progresses.size + 1}` };
          progresses.set(k, row);
          return row;
        }),
        findMany: jest.fn(async ({ where }: { where?: { memberId?: string; missionId?: string } }) =>
          Array.from(progresses.values()).filter((p) => (!where?.memberId || p.memberId === where.memberId) && (!where?.missionId || p.missionId === where.missionId)),
        ),
      },
      spendingDeadLetter: { create: jest.fn().mockResolvedValue({ id: 'dlq-1' }) },
      targetBatch: { create: jest.fn(async ({ data }: { data: Omit<TargetBatch, 'batchId'> }) => ({ batchId: 'B-E2E-1', ...data })) },
      $transaction: jest.fn(async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma)),
    } as unknown as PrismaService;

    const encryption = new EncryptionService(testKey, testSecret);
    const eventBus = new DomainEventBus();
    const auditRepo = new AuditLogRepository(prisma);
    const lineLinkRepo = new LineLinkRepository(prisma);
    const consentRepo = new ConsentRepository(prisma);
    const tokenRepo = new The1TokenRepository(prisma, encryption);
    const profileRepo = new MemberProfileRepository(prisma, encryption);
    const couponRepo = new CouponRepository(prisma);
    const missionRepo = new MissionRepository(prisma);
    const spendingTxnRepo = new SpendingTxnRepository(prisma);
    const the1Client = new The1MockClient();
    const sessionService = new SessionTokenService('e2e_test_jwt_secret_key_at_least_32_characters_long');

    const authService = new AuthService(
      new LineMockTokenVerifier(),
      the1Client,
      lineLinkRepo,
      tokenRepo,
      new The1LinkingTransactionService(prisma, lineLinkRepo, consentRepo, tokenRepo, profileRepo),
      sessionService,
      new AuthRateLimiterService({ maxPerIp: 50, maxPerLineUid: 50, windowMs: 60_000 }),
      eventBus,
      auditRepo,
    );
    const couponService = new CouponService(couponRepo, the1Client, eventBus, auditRepo);
    const missionEngine = new MissionEngineService(missionRepo, spendingTxnRepo, new MissionRuleEvaluator(), eventBus, auditRepo);
    const spendingIngestion = new SpendingIngestionService(spendingTxnRepo, new SpendingDeadLetterRepository(prisma), new TwdSpendingMockClient(), eventBus, auditRepo);
    const consentService = new MemberConsentService(consentRepo, auditRepo);
    const batchExporter = new TargetBatchExportService(prisma, encryption, new TargetBatchRepository(prisma), auditRepo, new SftpMockClient({ host: 'h', username: 'u', privateKeyPath: 'k', remoteDir: '/r' }));
    const pdpaService = new PdpaRetentionService(prisma, lineLinkRepo, tokenRepo, sessionService, auditRepo, the1Client);

    // 1. ลงทะเบียนครั้งแรก -> ได้รับคูปองต้อนรับ 20% (ONLINE_FIRST_REG_20)
    const regRes = await authService.handleThe1Callback({ idToken: 'mock-id-token:U_E2E_01', brand: Brand.TWD, otpRef: 'R1', otpCode: '123456', tncVersion: 'v1.0', pdpaVersion: 'v1.0' }, '127.0.0.1');
    expect(regRes.isFirstRegistration).toBe(true);
    const walletAfterReg = await couponService.getMemberCoupons(regRes.memberId);
    expect(walletAfterReg.coupons.some((c) => c.code === FIRST_REGISTRATION_COUPON_CODE)).toBe(true);

    // 2. Login ซ้ำไม่ต้องยืนยัน OTP
    const relogin = await authService.loginWithLine({ idToken: 'mock-id-token:U_E2E_01', brand: Brand.TWD }, '127.0.0.1');
    expect(relogin.linked).toBe(true);

    // 3. ยอดใช้จ่ายก้อนแรกเข้า (4,000 บาท) -> Mission progress เพิ่มขึ้นเป็น 40%
    await spendingIngestion.ingestBatch([{ txnId: 'TX-E2E-1', memberId: regRes.memberId, store: 'TWD-01', amount: 4000, category: 'TOOLS', sku: 'SKU-1', txnAt: '2026-06-01T10:00:00Z' }], 'PUSH');
    expect((await missionEngine.getMemberMissionById(regRes.memberId, 'MIS-E2E-001')).progress).toBe(4000);

    // 4. ยอดใช้จ่ายก้อนที่สองเข้า (6,500 บาท, รวม 10,500 >= 10,000) -> Mission ครบ ได้รับคูปอง MISSION_REWARD_500
    await spendingIngestion.ingestBatch([{ txnId: 'TX-E2E-2', memberId: regRes.memberId, store: 'TWD-01', amount: 6500, category: 'TOOLS', sku: 'SKU-2', txnAt: '2026-06-02T10:00:00Z' }], 'PUSH');
    expect((await missionEngine.getMemberMissionById(regRes.memberId, 'MIS-E2E-001')).completed).toBe(true);
    expect((await couponService.getMemberCoupons(regRes.memberId)).coupons.some((c) => c.code === 'MISSION_REWARD_500')).toBe(true);

    // 5. กดใช้คูปอง (Use Coupon) -> ได้รับรหัสหน้าร้านและ QR Payload
    const used = await couponService.useCoupon(regRes.memberId, walletAfterReg.coupons[0].walletId);
    expect(used.redemptionCode).toContain(FIRST_REGISTRATION_COUPON_CODE);

    // 6. ถอนความยินยอม MARKETING -> ตัดออกจาก Batch ถัดไปทันที
    const session = sessionService.verifyToken(regRes.accessToken, 'access');
    await consentService.updateMarketingConsent(session, { granted: true, version: 'v1.0' });
    expect((await batchExporter.exportTargetSegment({ segment: 'E2E_SEG' })).exportedMemberIds).toContain(regRes.memberId);
    await consentService.updateMarketingConsent(session, { granted: false, version: 'v1.0' });
    expect((await batchExporter.exportTargetSegment({ segment: 'E2E_SEG' })).exportedMemberIds).not.toContain(regRes.memberId);

    // 7. ยกเลิกการผูกบัญชี (Unlink)
    expect((await pdpaService.unlinkMemberAccount(session)).status).toBe('unlinked');

    couponService.onModuleDestroy();
    missionEngine.onModuleDestroy();
  });
});
