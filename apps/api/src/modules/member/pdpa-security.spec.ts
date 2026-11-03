import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Brand, Consent, LineLink, LineLinkStatus, MemberProfile, TargetBatch, The1Token } from '@prisma/client';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildStrictCorsOptions,
  createSecurityHeadersMiddleware,
  OWASP_SECURITY_HEADERS,
  sanitizeCsvCell,
} from '../../common/security/security-hardening';
import { AdminAuthService } from '../admin/guards/admin-auth.guard';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ConsentRepository } from '../auth/repositories/consent.repository';
import { LineLinkRepository } from '../auth/repositories/line-link.repository';
import { The1TokenRepository } from '../auth/repositories/the1-token.repository';
import { SessionTokenService } from '../auth/services/session-token.service';
import { SftpMockClient } from '../integration/batch/sftp.client';
import { TargetBatchExportService } from '../integration/batch/target-batch-export.service';
import { TargetBatchRepository } from '../integration/repositories/target-batch.repository';
import { The1MockClient } from '../integration/the1/the1-mock.client';
import { MemberConsentService } from './services/member-consent.service';
import { PdpaRetentionService } from './services/pdpa-retention.service';

describe('Prompt 13 — PDPA & OWASP Security Hardening Suite', () => {
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testSecret = 'test_blind_index_secret_32_characters_long_min';

  function setupTestContext() {
    const lineLinks = new Map<string, LineLink>();
    const the1Tokens = new Map<string, The1Token>();
    const memberProfiles = new Map<string, MemberProfile>();
    const consents: Consent[] = [];
    const auditLogs: Array<{ action: string; target: string; metadata: Record<string, unknown> }> = [];
    const batches: TargetBatch[] = [];

    const prisma = {
      lineLink: {
        findUnique: jest.fn(async ({ where }: { where: { lineUid_brand: { lineUid: string; brand: Brand } } }) =>
          lineLinks.get(`${where.lineUid_brand.lineUid}:${where.lineUid_brand.brand}`) ?? null,
        ),
        upsert: jest.fn(async ({ where, create, update }: { where: { lineUid_brand: { lineUid: string; brand: Brand } }; create: LineLink; update: Partial<LineLink> }) => {
          const k = `${where.lineUid_brand.lineUid}:${where.lineUid_brand.brand}`;
          const row = lineLinks.get(k) ? { ...lineLinks.get(k)!, ...update } : { ...create, id: `ll-${lineLinks.size + 1}` };
          lineLinks.set(k, row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: { where: { lineUid_brand: { lineUid: string; brand: Brand } }; data: Partial<LineLink> }) => {
          const k = `${where.lineUid_brand.lineUid}:${where.lineUid_brand.brand}`;
          const existing = lineLinks.get(k)!;
          const updated = { ...existing, ...data };
          lineLinks.delete(k);
          lineLinks.set(`${updated.lineUid}:${updated.brand}`, updated);
          return updated;
        }),
        findMany: jest.fn(async ({ where }: { where?: { status?: LineLinkStatus; brand?: Brand; memberId?: string } }) =>
          Array.from(lineLinks.values()).filter(
            (r) =>
              (!where?.status || r.status === where.status) &&
              (!where?.brand || r.brand === where.brand) &&
              (!where?.memberId || r.memberId === where.memberId),
          ),
        ),
      },
      the1Token: {
        upsert: jest.fn(async ({ where, create, update }: { where: { memberId: string }; create: The1Token; update: Partial<The1Token> }) => {
          const row = the1Tokens.get(where.memberId) ? { ...the1Tokens.get(where.memberId)!, ...update } : { ...create };
          the1Tokens.set(where.memberId, row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }: { where: { memberId: string } }) => the1Tokens.get(where.memberId) ?? null),
        delete: jest.fn(async ({ where }: { where: { memberId: string } }) => the1Tokens.delete(where.memberId)),
      },
      memberProfile: {
        findUnique: jest.fn(async ({ where }: { where: { memberId: string } }) => memberProfiles.get(where.memberId) ?? null),
        update: jest.fn(async ({ where, data }: { where: { memberId: string }; data: Partial<MemberProfile> }) => {
          const updated = { ...memberProfiles.get(where.memberId)!, ...data };
          memberProfiles.set(where.memberId, updated);
          return updated;
        }),
      },
      consent: {
        create: jest.fn(async ({ data }: { data: Omit<Consent, 'id'> }) => {
          const row: Consent = { id: `c-${consents.length + 1}`, ...data };
          consents.push(row);
          return row;
        }),
        findMany: jest.fn(async ({ where }: { where?: { memberId?: string; type?: string } }) =>
          consents.filter((c) => (!where?.memberId || c.memberId === where.memberId) && (!where?.type || c.type === where.type)),
        ),
      },
      missionProgress: { findMany: jest.fn().mockResolvedValue([]) },
      spendingTxn: { findMany: jest.fn().mockResolvedValue([]) },
      targetBatch: {
        create: jest.fn(async ({ data }: { data: Omit<TargetBatch, 'batchId'> }) => {
          const b: TargetBatch = { batchId: `B-${batches.length + 1}`, ...data };
          batches.push(b);
          return b;
        }),
      },
      auditLog: {
        create: jest.fn(async ({ data }: { data: { action: string; target: string; metadata: Record<string, unknown> } }) => {
          auditLogs.push(data);
          return data;
        }),
      },
    } as unknown as PrismaService;

    const encryption = new EncryptionService(testKey, testSecret);
    const auditRepo = new AuditLogRepository(prisma);
    const lineLinkRepo = new LineLinkRepository(prisma);
    const the1TokenRepo = new The1TokenRepository(prisma, encryption);
    const consentRepo = new ConsentRepository(prisma);
    const sessionTokenService = new SessionTokenService('unit_test_jwt_secret_at_least_32_characters_long');
    const pdpaService = new PdpaRetentionService(
      prisma,
      lineLinkRepo,
      the1TokenRepo,
      sessionTokenService,
      auditRepo,
      new The1MockClient(),
    );
    const memberConsentService = new MemberConsentService(consentRepo, auditRepo);
    const batchExportService = new TargetBatchExportService(
      prisma,
      encryption,
      new TargetBatchRepository(prisma),
      auditRepo,
      new SftpMockClient({ host: 'sftp.local', username: 'u', privateKeyPath: 'k', remoteDir: '/out' }),
    );

    return { lineLinks, memberProfiles, auditLogs, lineLinkRepo, the1TokenRepo, sessionTokenService, pdpaService, memberConsentService, batchExportService };
  }

  it('1. POST /me/unlink: ยกเลิกผูก LINE UID, ลบ the1_token, เปลี่ยน line_link เป็น unlinked, เพิกถอน JWT และบันทึก audit_log', async () => {
    const ctx = setupTestContext();
    await ctx.lineLinkRepo.linkMember({ lineUid: 'U_UNLINK_01', memberId: 'T1_MEM_001', brand: Brand.TWD });
    await ctx.the1TokenRepo.saveToken({
      memberId: 'T1_MEM_001',
      accessToken: 'acc-secret',
      refreshToken: 'ref-secret',
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const issued = ctx.sessionTokenService.issueSessionTokens({ memberId: 'T1_MEM_001', lineUid: 'U_UNLINK_01', brand: Brand.TWD });
    const sessionPayload = ctx.sessionTokenService.verifyToken(issued.accessToken, 'access');

    const res = await ctx.pdpaService.unlinkMemberAccount(sessionPayload);
    expect(res.success).toBe(true);
    expect((await ctx.lineLinkRepo.findByLineUidAndBrand('U_UNLINK_01', Brand.TWD))?.status).toBe(LineLinkStatus.unlinked);
    expect(await ctx.the1TokenRepo.findByMemberId('T1_MEM_001')).toBeNull();
    expect(() => ctx.sessionTokenService.verifyToken(issued.accessToken, 'access')).toThrow(UnauthorizedException);
    expect(ctx.auditLogs.some((l) => l.action === 'MEMBER_UNLINKED' && l.target === 'T1_MEM_001')).toBe(true);
  });

  it('2. เมื่อถอน consent MARKETING: ตัดสมาชิกออกจาก segment และ batch ถัดไปทันที', async () => {
    const ctx = setupTestContext();
    await ctx.lineLinkRepo.linkMember({ lineUid: 'U_MKT_01', memberId: 'T1_MEM_001', brand: Brand.TWD });
    await ctx.lineLinkRepo.linkMember({ lineUid: 'U_MKT_02', memberId: 'T1_MEM_002', brand: Brand.TWD });

    const s1 = ctx.sessionTokenService.verifyToken(
      ctx.sessionTokenService.issueSessionTokens({ memberId: 'T1_MEM_001', lineUid: 'U_MKT_01', brand: Brand.TWD }).accessToken,
    );
    const s2 = ctx.sessionTokenService.verifyToken(
      ctx.sessionTokenService.issueSessionTokens({ memberId: 'T1_MEM_002', lineUid: 'U_MKT_02', brand: Brand.TWD }).accessToken,
    );

    await ctx.memberConsentService.updateMarketingConsent(s1, { granted: true, version: 'v1.0' });
    await ctx.memberConsentService.updateMarketingConsent(s2, { granted: true, version: 'v1.0' });

    const batchBefore = await ctx.batchExportService.exportTargetSegment({ segment: 'SEG_PROMO_A', brand: Brand.TWD });
    expect(batchBefore.exportedMemberIds).toEqual(['T1_MEM_001', 'T1_MEM_002']);

    await ctx.memberConsentService.updateMarketingConsent(s1, { granted: false, version: 'v1.0' });
    const batchAfter = await ctx.batchExportService.exportTargetSegment({ segment: 'SEG_PROMO_A', brand: Brand.TWD });
    expect(batchAfter.exportedMemberIds).toEqual(['T1_MEM_002']);
  });

  it('3. Job ลบ/Anonymize ข้อมูลตาม Retention Policy และตรวจป้องกัน OWASP Top 10 (IDOR, Mock SSO, Headers, CORS, CSV Injection)', async () => {
    const ctx = setupTestContext();
    const oldDate = new Date('2025-01-01T00:00:00.000Z');
    ctx.lineLinks.set('U_OLD:TWD', { id: 'll-old', lineUid: 'U_OLD', memberId: 'T1_MEM_OLD', brand: Brand.TWD, linkedAt: oldDate, status: LineLinkStatus.unlinked });
    ctx.memberProfiles.set('T1_MEM_OLD', { memberId: 'T1_MEM_OLD', firstName: 'ENC', lastName: 'ENC', tier: 'GOLD', points: 100, refreshedAt: oldDate });

    const retentionRes = await ctx.pdpaService.runRetentionCleanup(new Date('2026-11-03T00:00:00.000Z'), 365);
    expect(retentionRes.anonymizedMemberIds).toContain('T1_MEM_OLD');
    expect(ctx.memberProfiles.get('T1_MEM_OLD')?.firstName).toBe('[ANONYMIZED]');

    const guard = new SessionAuthGuard(ctx.sessionTokenService);
    const tokens = ctx.sessionTokenService.issueSessionTokens({ memberId: 'T1_MEM_001', lineUid: 'U_001', brand: Brand.TWD });
    const idorContext = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${tokens.accessToken}`, 'x-member-id': 'T1_MEM_999' } }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(idorContext)).toThrow(ForbiddenException);

    const prevMockEnv = process.env.ADMIN_SSO_USE_MOCK;
    process.env.ADMIN_SSO_USE_MOCK = 'false';
    try {
      await expect(new AdminAuthService().verifyCorporateSsoToken({ ssoToken: 'mock-sso-admin' })).rejects.toThrow(UnauthorizedException);
    } finally {
      process.env.ADMIN_SSO_USE_MOCK = prevMockEnv;
    }

    const writtenHeaders: Record<string, string> = {};
    createSecurityHeadersMiddleware()({}, { setHeader: (k, v) => (writtenHeaders[k] = v) }, () => undefined);
    expect(writtenHeaders['X-Frame-Options']).toBe(OWASP_SECURITY_HEADERS['X-Frame-Options']);

    const cors = buildStrictCorsOptions('https://liff.line.me,https://admin.thaiwatsadu.com');
    let blockedError: Error | null = null;
    cors.origin('https://evil.example.com', (err) => (blockedError = err));
    expect(blockedError).not.toBeNull();
    expect(sanitizeCsvCell('=CMD("calc")')).toBe('\'=CMD("calc")');
  });
});
