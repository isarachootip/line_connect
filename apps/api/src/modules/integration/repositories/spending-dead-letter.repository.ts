import { Injectable } from '@nestjs/common';
import { Prisma, SpendingDeadLetter } from '@prisma/client';
import { redactPii } from '../../../common/logger/pii-redactor';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface CreateSpendingDeadLetterInput {
  readonly txnId?: string | null;
  readonly channel: 'PUSH' | 'PULL';
  readonly rawPayload: Record<string, unknown>;
  readonly reason: string;
}

// Repository สำหรับตาราง spending_dead_letter เก็บรายการยอดใช้จ่ายที่ข้อมูลผิดรูปแบบพร้อมเหตุผล (กรอง PII ก่อนบันทึกเสมอ)
@Injectable()
export class SpendingDeadLetterRepository {
  constructor(private readonly prisma: PrismaService) {}

  // บันทึกรายการที่ตรวจสอบไม่ผ่านลงตาราง Dead-Letter โดยกรองข้อมูลส่วนบุคคล (เบอร์โทร/Token) ออกก่อนเสมอ
  async recordDeadLetter(
    input: CreateSpendingDeadLetterInput,
  ): Promise<SpendingDeadLetter> {
    const sanitizedPayload = redactPii(
      input.rawPayload,
    ) as Prisma.InputJsonObject;

    return this.prisma.spendingDeadLetter.create({
      data: {
        txnId: input.txnId ?? null,
        channel: input.channel,
        rawPayload: sanitizedPayload,
        reason: redactPii(input.reason),
      },
    });
  }

  // ดึงรายการ Dead-Letter ล่าสุดสำหรับตรวจสอบและแก้ไขปัญหา
  async findRecentDeadLetters(limit = 50): Promise<SpendingDeadLetter[]> {
    return this.prisma.spendingDeadLetter.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
