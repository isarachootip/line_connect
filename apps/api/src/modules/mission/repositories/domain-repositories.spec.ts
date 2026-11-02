import { CouponSource, CouponWalletStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MissionRepository } from './mission.repository';
import { CouponRepository } from '../../coupon/repositories/coupon.repository';
import { TargetBatchRepository } from '../../integration/repositories/target-batch.repository';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';

// ชุดทดสอบสำหรับ Mission, Coupon, TargetBatch และ AuditLog Repositories
describe('Mission, Coupon, TargetBatch & AuditLog Repositories', () => {
  it('MissionRepository ควรจัดการความคืบหน้าภารกิจตาม unique (member_id, mission_id)', async () => {
    const mockProgressUpsert = jest.fn().mockResolvedValue({
      id: 'prog-1',
      memberId: 'T1_MEM_001',
      missionId: 'MIS-001',
      progress: new Prisma.Decimal(5000),
      completedAt: new Date('2026-11-02T12:00:00Z'),
    });

    const prismaMock = {
      mission: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      missionProgress: {
        upsert: mockProgressUpsert,
      },
    } as unknown as PrismaService;

    const repo = new MissionRepository(prismaMock);
    const updated = await repo.upsertProgress({
      memberId: 'T1_MEM_001',
      missionId: 'MIS-001',
      progress: 5000,
      completedAt: new Date('2026-11-02T12:00:00Z'),
    });

    expect(updated.missionId).toBe('MIS-001');
    expect(mockProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          memberId_missionId: {
            memberId: 'T1_MEM_001',
            missionId: 'MIS-001',
          },
        },
      }),
    );
  });

  it('CouponRepository ควรสร้างคูปอง แจกเข้ากระเป๋า (available) และเปลี่ยนสถานะเป็น used ได้', async () => {
    const mockWalletCreate = jest.fn().mockResolvedValue({
      id: 'wallet-1',
      memberId: 'T1_MEM_001',
      couponId: 'CPN-001',
      status: CouponWalletStatus.available,
      usedAt: null,
    });
    const mockWalletUpdate = jest.fn().mockResolvedValue({
      id: 'wallet-1',
      memberId: 'T1_MEM_001',
      couponId: 'CPN-001',
      status: CouponWalletStatus.used,
      usedAt: new Date('2026-11-02T14:00:00Z'),
    });

    const prismaMock = {
      coupon: {
        create: jest.fn().mockResolvedValue({
          couponId: 'CPN-001',
          code: 'TWD500',
          source: CouponSource.TWD,
        }),
      },
      couponWallet: {
        create: mockWalletCreate,
        update: mockWalletUpdate,
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const repo = new CouponRepository(prismaMock);
    const walletItem = await repo.grantCouponToMember('T1_MEM_001', 'CPN-001');
    expect(walletItem.status).toBe(CouponWalletStatus.available);

    const usedItem = await repo.markWalletCouponUsed(
      'wallet-1',
      new Date('2026-11-02T14:00:00Z'),
    );
    expect(usedItem.status).toBe(CouponWalletStatus.used);
  });

  it('TargetBatchRepository และ AuditLogRepository ควรบันทึกข้อมูลและกรอง PII ใน metadata ของ AuditLog อัตโนมัติ', async () => {
    const mockBatchCreate = jest.fn().mockResolvedValue({
      batchId: 'BATCH-001',
      segment: 'VIP_CONSTRUCTION',
      filePath: './exports/batch/vip_20261102.csv',
      rowCount: 250,
      sentAt: null,
    });
    let capturedAuditMetadata: Record<string, unknown> = {};
    const mockAuditCreate = jest.fn().mockImplementation(
      (args: { data: { metadata: Record<string, unknown> } }) => {
        capturedAuditMetadata = args.data.metadata;
        return Promise.resolve({ id: 'audit-1', ...args.data });
      },
    );

    const prismaMock = {
      targetBatch: {
        create: mockBatchCreate,
        update: jest.fn(),
      },
      auditLog: {
        create: mockAuditCreate,
      },
    } as unknown as PrismaService;

    const batchRepo = new TargetBatchRepository(prismaMock);
    const batch = await batchRepo.createBatchRecord({
      segment: 'VIP_CONSTRUCTION',
      filePath: './exports/batch/vip_20261102.csv',
      rowCount: 250,
    });
    expect(batch.rowCount).toBe(250);

    const auditRepo = new AuditLogRepository(prismaMock);
    await auditRepo.recordAudit({
      actor: 'T1_MEM_001',
      action: 'LINK_MEMBER',
      target: 'line_link:U_LINE_001',
      metadata: {
        brand: 'TWD',
        phone: '0812345678',
        accessToken: 'secret-token',
      },
    });

    expect(capturedAuditMetadata.brand).toBe('TWD');
    expect(capturedAuditMetadata.phone).toBe('[REDACTED]');
    expect(capturedAuditMetadata.accessToken).toBe('[REDACTED]');
  });
});
