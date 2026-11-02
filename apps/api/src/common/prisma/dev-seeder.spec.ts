import { AppEnvironment } from '@line-connect/shared';
import { EncryptionService } from '../crypto/encryption.service';
import { PrismaService } from './prisma.service';
import { runDevSeed } from './dev-seeder';

// ชุดทดสอบสคริปต์จำลองข้อมูลเริ่มต้นสำหรับนักพัฒนา (Dev Seed Script)
describe('runDevSeed (Development Database Seeder)', () => {
  const testHexKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testHmacSecret = 'blind_index_hmac_secret_key_for_unit_testing_32chars';

  it('ควรปฏิเสธการรัน Seed ทันทีหากสภาพแวดล้อมเป็น prod เพื่อป้องกันข้อมูลทับซ้อนบน Production', async () => {
    const prismaMock = {} as unknown as PrismaService;
    const encryption = new EncryptionService(testHexKey, testHmacSecret);

    await expect(
      runDevSeed(prismaMock, encryption, AppEnvironment.PROD),
    ).rejects.toThrow(/ไม่อนุญาตให้รัน Seed/);
  });

  it('ควรสร้างข้อมูลจำลองครบทั้ง 11 ตารางเมื่อรันในสภาพแวดล้อม dev', async () => {
    const prismaMock = {
      lineLink: { upsert: jest.fn().mockResolvedValue({ id: 'link-1' }) },
      consent: { create: jest.fn().mockResolvedValue({ id: 'consent-1' }) },
      the1Token: { upsert: jest.fn().mockResolvedValue({ memberId: 'T1_DEV_001' }) },
      memberProfile: { upsert: jest.fn().mockResolvedValue({ memberId: 'T1_DEV_001' }) },
      spendingTxn: { upsert: jest.fn().mockResolvedValue({ txnId: 'TXN-DEV-001' }) },
      mission: {
        upsert: jest.fn().mockResolvedValue({ missionId: 'MIS-DEV-001' }),
      },
      missionProgress: {
        upsert: jest.fn().mockResolvedValue({ id: 'prog-1' }),
      },
      coupon: {
        upsert: jest.fn().mockResolvedValue({ couponId: 'CPN-DEV-001' }),
      },
      couponWallet: {
        create: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      },
      targetBatch: {
        upsert: jest.fn().mockResolvedValue({ batchId: 'BATCH-DEV-001' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as unknown as PrismaService;

    const encryption = new EncryptionService(testHexKey, testHmacSecret);
    const summary = await runDevSeed(prismaMock, encryption, AppEnvironment.DEV);

    expect(summary.seededMemberId).toBe('T1_DEV_001');
    expect(summary.tablesSeeded).toBe(11);
    expect(prismaMock.lineLink.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.consent.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.the1Token.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.memberProfile.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.spendingTxn.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.mission.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.missionProgress.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.coupon.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.couponWallet.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.targetBatch.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
