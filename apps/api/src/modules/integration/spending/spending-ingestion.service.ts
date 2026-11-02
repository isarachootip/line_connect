import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DomainEventBus, SPENDING_RECORDED_EVENT } from '../../../common/events/domain-event-bus';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { SpendingDeadLetterRepository } from '../repositories/spending-dead-letter.repository';
import { CreateSpendingTxnInput, SpendingTxnRepository } from '../repositories/spending-txn.repository';
import {
  RawSpendingTransactionItem,
  TWD_SPENDING_CLIENT_TOKEN,
  TwdSpendingClient,
} from './twd-spending.client';

export interface SpendingBatchIngestSummary {
  readonly channel: 'PUSH' | 'PULL';
  readonly totalReceived: number;
  readonly recordedCount: number;
  readonly duplicateCount: number;
  readonly invalidCount: number;
  readonly deadLetterIds: readonly string[];
}

const singleSpendingItemSchema = z.object({
  txnId: z.string().trim().min(1, 'ต้องระบุ txn_id'),
  memberId: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  store: z.string().trim().min(1, 'ต้องระบุสาขา (store)'),
  amount: z.coerce
    .number({ invalid_type_error: 'ยอดซื้อ (amount) ต้องเป็นตัวเลข' })
    .positive('ยอดซื้อ (amount) ต้องมากกว่า 0'),
  category: z.string().trim().min(1, 'ต้องระบุหมวดหมู่สินค้า (category)'),
  sku: z.string().trim().min(1, 'ต้องระบุรหัสสินค้า (sku)'),
  txnAt: z.union([z.string(), z.date()]).transform((val, ctx) => {
    const parsed = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'รูปแบบวันที่ธุรกรรม (txn_at) ไม่ถูกต้อง' });
      return z.NEVER;
    }
    return parsed;
  }),
});

// บริการรับและประมวลผลรายการยอดใช้จ่ายจากไทวัสดุ (Validate, Dead-Letter, Idempotency และ Publish spending.recorded)
@Injectable()
export class SpendingIngestionService {
  public static readonly MAX_BATCH_SIZE = 1000;

  constructor(
    private readonly spendingTxnRepo: SpendingTxnRepository,
    private readonly deadLetterRepo: SpendingDeadLetterRepository,
    @Inject(TWD_SPENDING_CLIENT_TOKEN)
    private readonly twdSpendingClient: TwdSpendingClient,
    private readonly eventBus: DomainEventBus,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  // ประมวลผลรายการธุรกรรมเป็น Batch (สูงสุด 1,000 รายการต่อครั้ง)
  async ingestBatch(
    rawItems: readonly unknown[],
    channel: 'PUSH' | 'PULL',
  ): Promise<SpendingBatchIngestSummary> {
    if (!Array.isArray(rawItems)) {
      throw new BadRequestException('ข้อมูลรายการยอดใช้จ่ายต้องอยู่ในรูปแบบ Array');
    }
    if (rawItems.length > SpendingIngestionService.MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `จำนวนรายการต่อ Batch เกินขีดจำกัดสูงสุด ${SpendingIngestionService.MAX_BATCH_SIZE} รายการ (ได้รับ ${rawItems.length} รายการ)`,
      );
    }

    let recordedCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    const deadLetterIds: string[] = [];

    for (const rawEntry of rawItems) {
      const entryObj =
        rawEntry && typeof rawEntry === 'object'
          ? (rawEntry as RawSpendingTransactionItem & Record<string, unknown>)
          : {};

      const validated = await this.validateAndResolveItem(entryObj);
      if (!validated.ok) {
        invalidCount += 1;
        const dlq = await this.deadLetterRepo.recordDeadLetter({
          txnId:
            typeof (entryObj.txn_id ?? entryObj.txnId) === 'string'
              ? String(entryObj.txn_id ?? entryObj.txnId)
              : null,
          channel,
          rawPayload: entryObj,
          reason: validated.reason,
        });
        deadLetterIds.push(dlq.id);
        continue;
      }

      const { created } = await this.spendingTxnRepo.createIfNotExists(validated.data);
      if (!created) {
        duplicateCount += 1;
        continue;
      }

      recordedCount += 1;
      await this.eventBus.publish(SPENDING_RECORDED_EVENT, {
        eventName: SPENDING_RECORDED_EVENT,
        txnId: validated.data.txnId,
        memberId: validated.data.memberId,
        store: validated.data.store,
        amount: validated.data.amount,
        category: validated.data.category,
        sku: validated.data.sku,
        txnAt: validated.data.txnAt,
        channel,
        occurredAt: new Date(),
      });
    }

    await this.auditRepo.recordAudit({
      actor: `integration:spending:${channel.toLowerCase()}`,
      action: 'SPENDING_BATCH_INGESTED',
      target: channel,
      metadata: { totalReceived: rawItems.length, recordedCount, duplicateCount, invalidCount },
    });

    return { channel, totalReceived: rawItems.length, recordedCount, duplicateCount, invalidCount, deadLetterIds };
  }

  private async validateAndResolveItem(
    raw: RawSpendingTransactionItem,
  ): Promise<{ readonly ok: true; readonly data: CreateSpendingTxnInput } | { readonly ok: false; readonly reason: string }> {
    const normalized = {
      txnId: raw.txn_id ?? raw.txnId,
      memberId: raw.member_id ?? raw.memberId,
      phone: raw.phone,
      store: raw.store,
      amount: raw.amount,
      category: raw.category,
      sku: raw.sku,
      txnAt: raw.txn_at ?? raw.txnAt,
    };

    const parsed = singleSpendingItemSchema.safeParse(normalized);
    if (!parsed.success) {
      const reason = parsed.error.issues.map((iss) => `${iss.path.join('.') || 'item'}: ${iss.message}`).join('; ');
      return { ok: false, reason };
    }

    let resolvedMemberId = parsed.data.memberId ?? '';
    if (!resolvedMemberId && parsed.data.phone) {
      const fromPhone = await this.twdSpendingClient.resolveMemberIdByPhone(parsed.data.phone);
      if (!fromPhone) {
        return { ok: false, reason: 'ไม่พบรหัสสมาชิก (member_id) ที่ผูกกับเบอร์โทรศัพท์ที่ระบุ' };
      }
      resolvedMemberId = fromPhone;
    }

    if (!resolvedMemberId) {
      return { ok: false, reason: 'ต้องระบุ member_id หรือเบอร์โทรศัพท์ (phone) ของสมาชิก' };
    }

    return {
      ok: true,
      data: {
        txnId: parsed.data.txnId,
        memberId: resolvedMemberId,
        store: parsed.data.store,
        amount: parsed.data.amount,
        category: parsed.data.category,
        sku: parsed.data.sku,
        txnAt: parsed.data.txnAt,
      },
    };
  }
}
