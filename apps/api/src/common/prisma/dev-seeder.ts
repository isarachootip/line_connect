import {
  Brand,
  ConsentType,
  CouponSource,
  CouponWalletStatus,
  LineLinkStatus,
  Prisma,
} from '@prisma/client';
import { AppEnvironment } from '@line-connect/shared';
import { EncryptionService } from '../crypto/encryption.service';
import { PrismaService } from './prisma.service';

export interface DevSeedSummary {
  readonly seededMemberId: string;
  readonly tablesSeeded: number;
}

// ฟังก์ชันสร้างข้อมูลจำลองเริ่มต้นสำหรับสภาพแวดล้อมการพัฒนา (dev) ครบทั้ง 11 ตาราง
export async function runDevSeed(
  prisma: PrismaService,
  encryption: EncryptionService,
  appEnv: AppEnvironment = AppEnvironment.DEV,
): Promise<DevSeedSummary> {
  if (appEnv === AppEnvironment.PROD) {
    throw new Error('ไม่อนุญาตให้รัน Seed บนสภาพแวดล้อม Production (prod)');
  }

  const memberId = 'T1_DEV_001';
  const lineUid = 'U_DEV_LINE_001';
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // 1. ผูกบัญชี LINE กับ The 1 ทั้งแบรนด์ TWD และ BNB
  await prisma.lineLink.upsert({
    where: { lineUid_brand: { lineUid, brand: Brand.TWD } },
    create: { lineUid, memberId, brand: Brand.TWD, status: LineLinkStatus.active },
    update: { memberId, status: LineLinkStatus.active },
  });
  await prisma.lineLink.upsert({
    where: { lineUid_brand: { lineUid, brand: Brand.BNB } },
    create: { lineUid, memberId, brand: Brand.BNB, status: LineLinkStatus.active },
    update: { memberId, status: LineLinkStatus.active },
  });

  // 2. เพิ่มประวัติความยินยอม (Append-only: insert แถวใหม่)
  await prisma.consent.create({
    data: { memberId, type: ConsentType.TNC, version: 'v1.0', grantedAt: now },
  });
  await prisma.consent.create({
    data: { memberId, type: ConsentType.PDPA, version: 'v1.0', grantedAt: now },
  });

  // 3. เก็บ The 1 Token แบบเข้ารหัสระดับ Column
  await prisma.the1Token.upsert({
    where: { memberId },
    create: {
      memberId,
      accessToken: encryption.encrypt('dev-the1-access-token-sample'),
      refreshToken: encryption.encrypt('dev-the1-refresh-token-sample'),
      expiresAt: nextMonth,
    },
    update: {
      accessToken: encryption.encrypt('dev-the1-access-token-sample'),
      refreshToken: encryption.encrypt('dev-the1-refresh-token-sample'),
      expiresAt: nextMonth,
    },
  });

  // 4. แคชโปรไฟล์สมาชิก (เข้ารหัสชื่อ-นามสกุล)
  await prisma.memberProfile.upsert({
    where: { memberId },
    create: {
      memberId,
      firstName: encryption.encrypt('สมชาย'),
      lastName: encryption.encrypt('สร้างบ้าน'),
      tier: 'GOLD',
      points: 3250,
      refreshedAt: now,
    },
    update: { points: 3250, refreshedAt: now },
  });

  // 5. ยอดใช้จ่ายตัวอย่างจากไทวัสดุ
  await prisma.spendingTxn.upsert({
    where: { txnId: 'TXN-DEV-001' },
    create: {
      txnId: 'TXN-DEV-001',
      memberId,
      store: 'TWD-BANGNA',
      amount: new Prisma.Decimal(4500),
      category: 'CONSTRUCTION',
      sku: 'SKU-STEEL-001',
      txnAt: now,
    },
    update: { amount: new Prisma.Decimal(4500) },
  });

  // 6. แคมเปญ Mission ตัวอย่าง และ 7. ความคืบหน้าภารกิจ
  const missionId = 'MIS-DEV-001';
  await prisma.mission.upsert({
    where: { missionId },
    create: {
      missionId,
      name: 'ช้อปครบ 10,000 บาทที่ไทวัสดุ รับเพิ่ม 500 คะแนน The 1',
      rule: { brand: 'TWD', minSpendPerTxn: 1000, category: 'ALL' },
      target: new Prisma.Decimal(10000),
      startAt: now,
      endAt: nextMonth,
      reward: { type: 'THE1_POINT', points: 500 },
      status: 'active',
    },
    update: { status: 'active' },
  });

  await prisma.missionProgress.upsert({
    where: { memberId_missionId: { memberId, missionId } },
    create: { memberId, missionId, progress: new Prisma.Decimal(4500) },
    update: { progress: new Prisma.Decimal(4500) },
  });

  // 8. คูปองส่วนลดตัวอย่าง และ 9. กระเป๋าคูปองของสมาชิก
  const couponId = 'CPN-DEV-001';
  await prisma.coupon.upsert({
    where: { code: 'TWDWELCOME300' },
    create: {
      couponId,
      code: 'TWDWELCOME300',
      source: CouponSource.TWD,
      type: 'DISCOUNT_AMOUNT',
      value: new Prisma.Decimal(300),
      maxDiscount: new Prisma.Decimal(300),
      validFrom: now,
      validTo: nextMonth,
    },
    update: { validTo: nextMonth },
  });

  await prisma.couponWallet.create({
    data: {
      memberId,
      couponId,
      status: CouponWalletStatus.available,
    },
  });

  // 10. ประวัติการส่งไฟล์ Batch และ 11. Audit Log
  await prisma.targetBatch.upsert({
    where: { batchId: 'BATCH-DEV-001' },
    create: {
      batchId: 'BATCH-DEV-001',
      segment: 'TWD_ACTIVE_BUILDERS',
      filePath: './exports/batch/twd_active_builders_dev.csv',
      rowCount: 1,
      sentAt: now,
    },
    update: { rowCount: 1 },
  });

  await prisma.auditLog.create({
    data: {
      actor: 'system:dev-seed',
      action: 'SEED_DEV_DATA',
      target: memberId,
      metadata: { environment: appEnv, tablesSeeded: 11 },
    },
  });

  return { seededMemberId: memberId, tablesSeeded: 11 };
}
