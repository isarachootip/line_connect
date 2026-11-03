import { Brand, ConsentType, LineLinkStatus, Prisma, TargetBatch } from '@prisma/client';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { DomainEventBus, MISSION_COMPLETED_EVENT } from '../../../common/events/domain-event-bus';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { EarnPointQueueService } from '../earn-point/earn-point-queue.service';
import { CreateTargetBatchInput, TargetBatchRepository } from '../repositories/target-batch.repository';
import { The1MockClient } from '../the1/the1-mock.client';
import { SftpMockClient } from './sftp.client';
import { TargetBatchExportService } from './target-batch-export.service';

// ชุดทดสอบสำหรับ Prompt 9: คิวเติมแต้ม The 1 (BullMQ บน Redis, refId กันซ้ำ, Retry และ Alert เมื่อพลาดเกิน 3 ครั้ง) และส่งออก Batch File ด้วย SFTP Mock
describe('Prompt 9 — EarnPointQueueService & TargetBatchExportService (SFTP Mock)', () => {
  const testEncKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testHmacSecret = 'test_hmac_secret_at_least_32_characters_long_for_batch';

  it('EarnPointQueueService: ควรเติมแต้มผ่านคิว Redis ด้วย refId กันบันทึกซ้ำ, รองรับการ Retry และแจ้งเตือนเมื่อพลาดเกิน 3 ครั้ง', async () => {
    const eventBus = new DomainEventBus();
    const redis = new RedisService();
    const the1Mock = new The1MockClient();
    const auditLogs: Array<{ action: string; target: string; metadata: Record<string, unknown> }> = [];
    const prismaMock = {
      auditLog: {
        create: jest.fn(async ({ data }: { data: { action: string; target: string; metadata: Record<string, unknown> } }) => {
          auditLogs.push(data);
          return data;
        }),
      },
    } as unknown as PrismaService;
    const queue = new EarnPointQueueService(the1Mock, redis, new AuditLogRepository(prismaMock), eventBus);
    const earnSpy = jest.spyOn(the1Mock, 'earnPoint');

    // 1. ทดสอบรับอีเวนต์ mission.completed และกันบันทึกซ้ำด้วย refId
    const completedEvt = {
      eventName: MISSION_COMPLETED_EVENT,
      missionId: 'MIS-100',
      memberId: 'T1_MEM_001',
      progress: 5000,
      target: 5000,
      reward: { type: 'THE1_POINT', points: 250 },
      completedAt: new Date('2026-11-03T10:00:00.000Z'),
    };
    await eventBus.publish(MISSION_COMPLETED_EVENT, completedEvt);
    const dupOutcome = await queue.enqueueEarnPoint({
      missionId: 'MIS-100',
      memberId: 'T1_MEM_001',
      points: 250,
      refId: 'MISSION:MIS-100:T1_MEM_001',
    });

    expect(dupOutcome.status).toBe('duplicate_skipped');
    expect(earnSpy).toHaveBeenCalledTimes(1);
    expect(earnSpy).toHaveBeenCalledWith('T1_MEM_001', 250, 'MISSION:MIS-100:T1_MEM_001');

    // 2. ทดสอบกรณีล้มเหลวชั่วคราว 2 ครั้งแรก แล้วสำเร็จในครั้งที่ 3 (Retry ได้)
    let transientCalls = 0;
    earnSpy.mockImplementation(async (memberId, points, refId) => {
      transientCalls += 1;
      if (transientCalls < 3) throw new Error('THE1_GATEWAY_TIMEOUT');
      return { transactionId: 'TX-RETRY-OK', memberId, earnedPoints: points, newBalance: 1500, refId };
    });

    const retryOutcome = await queue.enqueueEarnPoint({
      missionId: 'MIS-200',
      memberId: 'T1_MEM_002',
      points: 500,
      refId: 'MISSION:MIS-200:T1_MEM_002',
    });
    expect(retryOutcome.status).toBe('completed');
    expect(retryOutcome.attemptsMade).toBe(3);

    // 3. ทดสอบกรณีพลาดเกิน 3 ครั้ง (ล้มเหลวทั้ง 4 ครั้ง = ครั้งแรก + Retry 3 ครั้ง) ต้องแจ้งเตือน EARN_POINT_FAILED_ALERT
    earnSpy.mockRejectedValue(new Error('THE1_SERVICE_UNAVAILABLE'));
    const failedOutcome = await queue.enqueueEarnPoint({
      missionId: 'MIS-300',
      memberId: 'T1_MEM_003',
      points: 1000,
      refId: 'MISSION:MIS-300:T1_MEM_003',
    });

    expect(failedOutcome.status).toBe('failed');
    expect(failedOutcome.attemptsMade).toBe(4);
    expect(queue.getFailureAlerts()).toHaveLength(1);
    expect(queue.getFailureAlerts()[0]).toMatchObject({
      refId: 'MISSION:MIS-300:T1_MEM_003',
      memberId: 'T1_MEM_003',
      attemptsMade: 4,
    });
    expect(auditLogs.some((a) => a.action === 'EARN_POINT_FAILED_ALERT' && a.target === 'T1_MEM_003')).toBe(true);
    queue.onModuleDestroy();
  });

  it('TargetBatchExportService: ควรคัดกรองตาม Segment และรวมเฉพาะสมาชิกที่ Consent MARKETING ยังมีผล เข้ารหัสไฟล์ส่งผ่าน SFTP Mock พร้อมบันทึก target_batch และ audit_log', async () => {
    const encryption = new EncryptionService(testEncKey, testHmacSecret);
    const sftpMock = new SftpMockClient({
      host: 'sftp.thaiwatsadu.local',
      username: 'twd_crm_sftp',
      privateKeyPath: './secrets/id_ed25519_twd',
      remoteDir: '/incoming/target-batches',
    });
    const savedBatches: TargetBatch[] = [];
    const savedAudits: Array<{ action: string; target: string; metadata: Record<string, unknown> }> = [];

    const prismaMock = {
      consent: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', memberId: 'T1_MEM_001', type: ConsentType.MARKETING, version: 'v2.0', grantedAt: new Date('2026-11-01T10:00:00Z'), revokedAt: null },
          { id: 'c2', memberId: 'T1_MEM_002', type: ConsentType.MARKETING, version: 'v1.0', grantedAt: new Date('2026-11-01T09:00:00Z'), revokedAt: null },
          { id: 'c3', memberId: 'T1_MEM_002', type: ConsentType.MARKETING, version: 'v1.0', grantedAt: null, revokedAt: new Date('2026-11-02T09:00:00Z') },
          { id: 'c4', memberId: 'T1_MEM_003', type: ConsentType.MARKETING, version: 'v2.0', grantedAt: new Date('2026-11-01T10:00:00Z'), revokedAt: null },
        ]),
      },
      lineLink: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'l1', lineUid: 'U1', memberId: 'T1_MEM_001', brand: Brand.TWD, status: LineLinkStatus.active },
          { id: 'l2', lineUid: 'U2', memberId: 'T1_MEM_002', brand: Brand.TWD, status: LineLinkStatus.active },
          { id: 'l3', lineUid: 'U3', memberId: 'T1_MEM_003', brand: Brand.TWD, status: LineLinkStatus.active },
        ]),
      },
      missionProgress: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'mp1', memberId: 'T1_MEM_001', missionId: 'MIS-X', progress: new Prisma.Decimal(12000), completedAt: new Date('2026-11-02T15:00:00Z') },
          { id: 'mp2', memberId: 'T1_MEM_002', missionId: 'MIS-X', progress: new Prisma.Decimal(15000), completedAt: new Date('2026-11-02T16:00:00Z') },
          { id: 'mp3', memberId: 'T1_MEM_003', missionId: 'MIS-X', progress: new Prisma.Decimal(3000), completedAt: null },
        ]),
      },
      spendingTxn: {
        findMany: jest.fn().mockResolvedValue([
          { txnId: 'T1', memberId: 'T1_MEM_001', store: 'TWD-01', amount: new Prisma.Decimal(12000), category: 'STEEL', sku: 'S1', txnAt: new Date('2026-11-02T12:00:00Z') },
          { txnId: 'T2', memberId: 'T1_MEM_002', store: 'TWD-01', amount: new Prisma.Decimal(15000), category: 'STEEL', sku: 'S1', txnAt: new Date('2026-11-02T12:00:00Z') },
          { txnId: 'T3', memberId: 'T1_MEM_003', store: 'TWD-01', amount: new Prisma.Decimal(3000), category: 'STEEL', sku: 'S1', txnAt: new Date('2026-11-02T12:00:00Z') },
        ]),
      },
      targetBatch: {
        create: jest.fn(async ({ data }: { data: CreateTargetBatchInput }) => {
          const row: TargetBatch = { batchId: `BATCH-${savedBatches.length + 1}`, segment: data.segment, filePath: data.filePath, rowCount: data.rowCount, sentAt: data.sentAt ?? null };
          savedBatches.push(row);
          return row;
        }),
      },
      auditLog: {
        create: jest.fn(async ({ data }: { data: { action: string; target: string; metadata: Record<string, unknown> } }) => {
          savedAudits.push(data);
          return data;
        }),
      },
    } as unknown as PrismaService;

    const exportService = new TargetBatchExportService(
      prismaMock,
      encryption,
      new TargetBatchRepository(prismaMock),
      new AuditLogRepository(prismaMock),
      sftpMock,
    );

    const exportRes = await exportService.exportTargetSegment(
      {
        segment: 'TWD_MISSION_X_HIGH_VALUE',
        completedMissionId: 'MIS-X',
        minTotalSpend: 10000,
        brand: Brand.TWD,
        actor: 'admin:marketing-01',
      },
      new Date('2026-11-03T12:00:00.000Z'),
    );

    expect(exportRes.rowCount).toBe(1);
    expect(exportRes.exportedMemberIds).toEqual(['T1_MEM_001']);

    const uploaded = sftpMock.getUploadedFiles();
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].host).toBe('sftp.thaiwatsadu.local');
    expect(uploaded[0].remotePath).toContain('/incoming/target-batches/twd_mission_x_high_value_');
    expect(uploaded[0].encryptedContent).not.toContain('T1_MEM_001');

    const decryptedCsv = encryption.decrypt(uploaded[0].encryptedContent);
    expect(decryptedCsv).toContain('member_id,brand,segment,completed_mission_id,total_spend,marketing_consent_version,exported_at');
    expect(decryptedCsv).toContain('T1_MEM_001,TWD,TWD_MISSION_X_HIGH_VALUE,MIS-X,12000.00,v2.0,2026-11-03T12:00:00.000Z');
    expect(decryptedCsv).not.toContain('T1_MEM_002');

    expect(savedBatches).toHaveLength(1);
    expect(savedBatches[0].rowCount).toBe(1);
    expect(savedAudits.some((a) => a.action === 'TARGET_BATCH_EXPORTED' && a.target === 'BATCH-1')).toBe(true);
  });
});
