import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma, SpendingDeadLetter, SpendingTxn } from '@prisma/client';
import { DomainEventBus, SPENDING_RECORDED_EVENT } from '../../../common/events/domain-event-bus';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { SpendingDeadLetterRepository } from '../repositories/spending-dead-letter.repository';
import { SpendingTxnRepository } from '../repositories/spending-txn.repository';
import { SpendingAuthVerifier } from './spending-auth.verifier';
import { SpendingIngestionService } from './spending-ingestion.service';
import { SpendingPullJob } from './spending-pull.job';
import { SpendingController } from './spending.controller';
import { TwdSpendingMockClient } from './twd-spending.client';

// ชุดทดสอบสำหรับโมดูล integration/spending (Push & Pull, Idempotency, Dead-Letter, HMAC/mTLS/IP และ Batch 1,000 รายการ)
describe('Integration Spending Module (Push, Pull, Idempotent, Dead-Letter & 1,000 Batch)', () => {
  const hmacSecret = 'twd_spending_unit_test_hmac_secret_key_32chars';
  let txnStore: Map<string, SpendingTxn>;
  let deadLetters: SpendingDeadLetter[];
  let eventBus: DomainEventBus;
  let authVerifier: SpendingAuthVerifier;
  let controller: SpendingController;
  let pullJob: SpendingPullJob;

  beforeEach(() => {
    process.env.TWD_SPENDING_MODE = 'BOTH';
    txnStore = new Map<string, SpendingTxn>();
    deadLetters = [];
    eventBus = new DomainEventBus();

    const prismaMock = {
      spendingTxn: {
        findUnique: jest.fn(async ({ where }: { where: { txnId: string } }) => txnStore.get(where.txnId) ?? null),
        create: jest.fn(async ({ data }: { data: SpendingTxn }) => {
          txnStore.set(data.txnId, data);
          return data;
        }),
      },
      spendingDeadLetter: {
        create: jest.fn(async ({ data }: { data: { txnId: string | null; channel: string; rawPayload: Prisma.JsonValue; reason: string } }) => {
          const row: SpendingDeadLetter = { id: `dlq-${deadLetters.length + 1}`, createdAt: new Date(), ...data };
          deadLetters.push(row);
          return row;
        }),
        findMany: jest.fn(async () => [...deadLetters]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;

    authVerifier = new SpendingAuthVerifier({ authMode: 'HMAC', hmacSecret, allowedIps: ['10.20.30.40', '127.0.0.1'] });
    const twdMockClient = new TwdSpendingMockClient();
    const ingestionService = new SpendingIngestionService(
      new SpendingTxnRepository(prismaMock),
      new SpendingDeadLetterRepository(prismaMock),
      twdMockClient,
      eventBus,
      new AuditLogRepository(prismaMock),
    );
    controller = new SpendingController(authVerifier, ingestionService);
    pullJob = new SpendingPullJob(twdMockClient, ingestionService, new RedisService());
  });

  it('กรณีรายการซ้ำ (Idempotent): txn_id ซ้ำต้องไม่ถูกนับซ้ำ และไม่ส่งอีเวนต์ spending.recorded ซ้ำ', async () => {
    const item = { txn_id: 'TXN-DUP-001', member_id: 'T1_MEM_001', store: 'TWD-BANGNA', amount: 2500, category: 'TOOLS', sku: 'SKU-01', txn_at: '2026-11-02T10:00:00.000Z' };
    const payload = { items: [item, item] };
    const sig = authVerifier.computeHmacSignature(payload);
    const res = await controller.receiveSpendingBatch(payload, '10.20.30.40', undefined, sig);

    expect(res.totalReceived).toBe(2);
    expect(res.recordedCount).toBe(1);
    expect(res.duplicateCount).toBe(1);
    expect(txnStore.size).toBe(1);
    expect(eventBus.getPublishedEvents(SPENDING_RECORDED_EVENT)).toHaveLength(1);
  });

  it('กรณีข้อมูลผิดรูปแบบ: ต้องเก็บลงตาราง spending_dead_letter พร้อมเหตุผล (โดยซ่อน PII) และบันทึกเฉพาะรายการที่ถูกต้อง', async () => {
    const payload = {
      items: [
        { txn_id: 'TXN-VALID-01', phone: '0812345678', store: 'TWD-BANGNA', amount: 1200, category: 'PAINT', sku: 'SKU-PAINT-1', txn_at: '2026-11-02T11:00:00.000Z' },
        { txn_id: 'TXN-BAD-AMOUNT', member_id: 'T1_MEM_001', store: 'TWD-BANGNA', amount: -500, category: 'PAINT', sku: 'SKU-PAINT-2', txn_at: '2026-11-02T11:00:00.000Z' },
        { txn_id: 'TXN-UNKNOWN-PHONE', phone: '0899999999', store: 'TWD-BANGNA', amount: 900, category: 'PAINT', sku: 'SKU-PAINT-3', txn_at: '2026-11-02T11:00:00.000Z' },
      ],
    };
    const sig = authVerifier.computeHmacSignature(payload);
    const res = await controller.receiveSpendingBatch(payload, '10.20.30.40', undefined, sig);

    expect(res.recordedCount).toBe(1);
    expect(res.invalidCount).toBe(2);
    expect(deadLetters).toHaveLength(2);
    expect(deadLetters[0].txnId).toBe('TXN-BAD-AMOUNT');
    expect(deadLetters[0].reason).toContain('amount');
    expect(deadLetters[1].txnId).toBe('TXN-UNKNOWN-PHONE');
    expect(deadLetters[1].reason).toContain('ไม่พบรหัสสมาชิก');
    expect(JSON.stringify(deadLetters[1].rawPayload)).not.toContain('0899999999');
  });

  it('กรณี Signature ผิด หรือ IP ไม่อยู่ใน Whitelist หรือ mTLS ไม่ผ่าน: ต้องปฏิเสธด้วย 401 / 403 ทันที', async () => {
    const payload = { items: [] };
    const validSig = authVerifier.computeHmacSignature(payload);

    await expect(controller.receiveSpendingBatch(payload, '10.20.30.40', undefined, 'invalid-signature-hex')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.receiveSpendingBatch(payload, '192.168.99.99', undefined, validSig)).rejects.toBeInstanceOf(ForbiddenException);

    const mtlsVerifier = new SpendingAuthVerifier({ authMode: 'MTLS', hmacSecret, allowedIps: ['10.20.30.40'] });
    expect(() => mtlsVerifier.verifyPushRequest('10.20.30.40', payload, { clientCertVerified: 'FAILED' })).toThrow(UnauthorizedException);
    expect(() => mtlsVerifier.verifyPushRequest('10.20.30.40', payload, { clientCertVerified: 'SUCCESS' })).not.toThrow();
  });

  it('กรณีปริมาณ 1,000 รายการ และกรณีเกิน 1,000 รายการ รวมถึงการดึงผ่าน Pull Job ด้วย Cursor ล่าสุด', async () => {
    const batch1000 = {
      items: Array.from({ length: 1000 }, (_, idx) => ({
        txn_id: `TXN-BULK-${idx + 1}`,
        member_id: 'T1_MEM_001',
        store: 'TWD-BANGNA',
        amount: 100 + idx,
        category: 'CONSTRUCTION',
        sku: `SKU-${idx + 1}`,
        txn_at: '2026-11-02T12:00:00.000Z',
      })),
    };
    const sig1000 = authVerifier.computeHmacSignature(batch1000);
    const res1000 = await controller.receiveSpendingBatch(batch1000, '10.20.30.40', undefined, sig1000);
    expect(res1000.recordedCount).toBe(1000);
    expect(eventBus.getPublishedEvents(SPENDING_RECORDED_EVENT)).toHaveLength(1000);

    const batch1001 = { items: [...batch1000.items, batch1000.items[0]] };
    const sig1001 = authVerifier.computeHmacSignature(batch1001);
    await expect(controller.receiveSpendingBatch(batch1001, '10.20.30.40', undefined, sig1001)).rejects.toBeInstanceOf(BadRequestException);

    const pull1 = await pullJob.runPullCycle();
    expect(pull1.previousCursor).toBeNull();
    expect(pull1.nextCursor).toBe('CURSOR_PAGE_2');
    expect(pull1.summary?.recordedCount).toBe(2);

    const pull2 = await pullJob.runPullCycle();
    expect(pull2.previousCursor).toBe('CURSOR_PAGE_2');
    expect(pull2.nextCursor).toBe('CURSOR_END');
    expect(pull2.summary?.recordedCount).toBe(1);
  });
});
