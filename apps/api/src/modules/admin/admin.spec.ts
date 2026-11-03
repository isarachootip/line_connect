import { AdminRole } from '@line-connect/shared';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Brand, ConsentType, Coupon, CouponSource, LineLinkStatus, Mission, Prisma } from '@prisma/client';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { SftpMockClient } from '../integration/batch/sftp.client';
import { TargetBatchExportService } from '../integration/batch/target-batch-export.service';
import { TargetBatchRepository } from '../integration/repositories/target-batch.repository';
import { AdminController } from './admin.controller';
import { AdminAuthGuard, AdminAuthService } from './guards/admin-auth.guard';
import { AdminBackofficeService } from './services/admin-backoffice.service';
import { AdminMemberSearchService } from './services/admin-member-search.service';

// ชุดทดสอบสำหรับโมดูล Admin Backoffice: SSO, RBAC (ADMIN/MARKETING/VIEWER), Mission, Coupon, Target Batch, ค้นหาสมาชิกแบบ Mask และ Audit Log
describe('AdminBackofficeModule Unit & RBAC Tests (Prompt 10)', () => {
  const testEncKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testHmacSecret = 'test_hmac_secret_at_least_32_characters_long_for_admin';

  function createAdminTestFixture() {
    const encryption = new EncryptionService(testEncKey, testHmacSecret);
    const sftpMock = new SftpMockClient();
    const missions = new Map<string, Mission>();
    const coupons = new Map<string, Coupon>();
    const auditLogs: Array<{ actor: string; action: string; target: string }> = [];

    const prismaMock = {
      mission: {
        findMany: jest.fn(async () => Array.from(missions.values())),
        create: jest.fn(async ({ data }: { data: Mission }) => {
          const saved: Mission = { ...data, missionId: data.missionId ?? `MIS-${missions.size + 1}` };
          missions.set(saved.missionId, saved);
          return saved;
        }),
        update: jest.fn(async ({ where, data }: { where: { missionId: string }; data: Partial<Mission> }) => {
          const updated: Mission = { ...missions.get(where.missionId)!, ...data };
          missions.set(where.missionId, updated);
          return updated;
        }),
      },
      missionProgress: {
        findMany: jest.fn(async () => [
          { id: 'mp1', memberId: 'T1_MEM_001', missionId: 'MIS-1', progress: new Prisma.Decimal(5000), completedAt: new Date('2026-11-03T10:00:00Z') },
          { id: 'mp2', memberId: 'T1_MEM_002', missionId: 'MIS-1', progress: new Prisma.Decimal(2000), completedAt: null },
        ]),
      },
      coupon: {
        create: jest.fn(async ({ data }: { data: Coupon }) => {
          const saved: Coupon = { ...data, couponId: data.couponId ?? `CPN-${coupons.size + 1}` };
          coupons.set(saved.couponId, saved);
          return saved;
        }),
      },
      couponWallet: {
        findMany: jest.fn().mockResolvedValue([{ id: 'w1', memberId: 'T1_MEM_001', couponId: 'CPN-1' }]),
      },
      memberProfile: {
        findUnique: jest.fn(async ({ where }: { where: { memberId: string } }) =>
          where.memberId === 'T1_MEM_001'
            ? {
                memberId: 'T1_MEM_001',
                firstName: encryption.encrypt('สมชาย'),
                lastName: encryption.encrypt('สร้างบ้าน'),
                tier: 'GOLD',
                points: 4200,
                refreshedAt: new Date('2026-11-03T11:00:00Z'),
              }
            : null,
        ),
      },
      lineLink: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'l1', lineUid: 'U1', memberId: 'T1_MEM_001', brand: Brand.TWD, status: LineLinkStatus.active },
        ]),
      },
      consent: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', memberId: 'T1_MEM_001', type: ConsentType.MARKETING, version: 'v2.0', grantedAt: new Date('2026-11-01T10:00:00Z'), revokedAt: null },
        ]),
      },
      spendingTxn: {
        findMany: jest.fn().mockResolvedValue([
          { txnId: 'T1', memberId: 'T1_MEM_001', store: 'TWD-01', amount: new Prisma.Decimal(8500), category: 'STEEL', sku: 'S1', txnAt: new Date('2026-11-02T12:00:00Z') },
        ]),
      },
      targetBatch: {
        create: jest.fn(async ({ data }: { data: { segment: string; filePath: string; rowCount: number; sentAt?: Date | null } }) => ({
          batchId: 'BATCH-ADM-01',
          ...data,
        })),
      },
      auditLog: {
        create: jest.fn(async ({ data }: { data: { actor: string; action: string; target: string } }) => {
          auditLogs.push(data);
          return data;
        }),
      },
    } as unknown as PrismaService;

    const auditRepo = new AuditLogRepository(prismaMock);
    const adminAuth = new AdminAuthService('test_admin_jwt_secret_at_least_32_characters');
    const batchExport = new TargetBatchExportService(prismaMock, encryption, new TargetBatchRepository(prismaMock), auditRepo, sftpMock);
    const memberSearch = new AdminMemberSearchService(prismaMock, encryption, auditRepo);
    const adminService = new AdminBackofficeService(prismaMock, auditRepo, adminAuth, batchExport, memberSearch);
    const controller = new AdminController(adminService);
    const guard = new AdminAuthGuard(adminAuth, new Reflector());

    return { controller, guard, auditLogs };
  }

  it('SSO & RBAC: ควรจำแนกสิทธิ์ ADMIN, MARKETING, VIEWER ได้ถูกต้อง และปฏิเสธ VIEWER เมื่อพยายามแก้ไขข้อมูล', async () => {
    const { controller, guard } = createAdminTestFixture();
    const viewerLogin = await controller.loginSso({ ssoToken: 'mock-sso-viewer' });
    expect(viewerLogin.user.role).toBe(AdminRole.VIEWER);

    const marketingLogin = await controller.loginSso({ ssoToken: 'mock-sso-marketing' });
    expect(marketingLogin.user.role).toBe(AdminRole.MARKETING);

    const fakeCtx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${viewerLogin.accessToken}` } }) }),
      getHandler: () => AdminController.prototype.createMission,
      getClass: () => AdminController,
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(fakeCtx)).toThrow(ForbiddenException);
  });

  it('ควรจัดการ Mission (สร้าง/แก้ไข/เปิด-ปิด/ดูยอดผู้ทำสำเร็จ), สร้างชุดคูปอง, สั่ง Export Batch, ค้นหาสมาชิกแบบ Mask และบันทึก Audit Log ทุก Action', async () => {
    const { controller, auditLogs } = createAdminTestFixture();
    const adminLogin = await controller.loginSso({ ssoToken: 'mock-sso-admin' });
    const req = { adminUser: adminLogin.user };

    const createdMission = await controller.createMission(req, {
      missionId: 'MIS-1',
      name: 'ช้อปครบ 5,000 บาท รับ 200 แต้ม',
      rule: { type: 'TOTAL_SPEND', periodType: 'MONTH' },
      target: 5000,
      startAt: '2026-11-01T00:00:00.000Z',
      endAt: '2026-11-30T23:59:59.000Z',
      reward: { type: 'THE1_POINT', points: 200 },
    });
    expect(createdMission.missionId).toBe('MIS-1');

    const updatedMission = await controller.updateMission(req, 'MIS-1', {
      name: 'ช้อปครบ 6,000 บาท รับ 300 แต้ม',
      rule: { type: 'TOTAL_SPEND', periodType: 'MONTH' },
      target: 6000,
      startAt: '2026-11-01T00:00:00.000Z',
      endAt: '2026-11-30T23:59:59.000Z',
      reward: { type: 'THE1_POINT', points: 300 },
    });
    expect(updatedMission.target).toBe(6000);
    expect(updatedMission.totalParticipants).toBe(2);
    expect(updatedMission.completedCount).toBe(1);

    const toggledMission = await controller.setMissionStatus(req, 'MIS-1', { status: 'inactive' });
    expect(toggledMission.status).toBe('inactive');

    const missionList = await controller.listMissions(req);
    expect(missionList[0].completedCount).toBe(1);

    const coupon = await controller.createCoupon(req, {
      code: 'TWDBUILDER500',
      source: CouponSource.TWD,
      type: 'DISCOUNT_PERCENT',
      value: 15,
      maxDiscount: 500,
      validFrom: '2026-11-01T00:00:00.000Z',
      validTo: '2026-12-31T23:59:59.000Z',
    });
    expect(coupon.maxDiscount).toBe(500);

    const batchRes = await controller.exportSegmentBatch(req, {
      segment: 'NOV_ACTIVE_BUILDERS',
      completedMissionId: 'MIS-1',
      minTotalSpend: 5000,
      brand: Brand.TWD,
    });
    expect(batchRes.rowCount).toBe(1);

    const memberInfo = await controller.searchMember(req, 'T1_MEM_001');
    expect(memberInfo.maskedFullName).toBe('สม*** สร***');

    expect(auditLogs.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'ADMIN_SSO_LOGIN',
        'ADMIN_MISSION_CREATED',
        'ADMIN_MISSION_UPDATED',
        'ADMIN_MISSION_STATUS_CHANGED',
        'ADMIN_MISSIONS_VIEWED',
        'ADMIN_COUPON_CREATED',
        'TARGET_BATCH_EXPORTED',
        'ADMIN_MEMBER_SEARCHED',
      ]),
    );
  });
});
