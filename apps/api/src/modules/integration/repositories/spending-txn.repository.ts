import { Injectable } from '@nestjs/common';
import { Prisma, SpendingTxn } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface CreateSpendingTxnInput {
  readonly txnId: string;
  readonly memberId: string;
  readonly store: string;
  readonly amount: number;
  readonly category: string;
  readonly sku: string;
  readonly txnAt: Date;
}

// Repository สำหรับตาราง spending_txn (บันทึกยอดใช้จ่ายรายลูกค้าจากไทวัสดุแบบ Idempotent)
@Injectable()
export class SpendingTxnRepository {
  constructor(private readonly prisma: PrismaService) {}

  // บันทึกธุรกรรมยอดใช้จ่ายโดยใช้ txn_id (unique) ป้องกันการบันทึกซ้ำ
  async recordTransaction(input: CreateSpendingTxnInput): Promise<SpendingTxn> {
    const decimalAmount = new Prisma.Decimal(input.amount);
    return this.prisma.spendingTxn.upsert({
      where: { txnId: input.txnId },
      create: {
        txnId: input.txnId,
        memberId: input.memberId,
        store: input.store,
        amount: decimalAmount,
        category: input.category,
        sku: input.sku,
        txnAt: input.txnAt,
      },
      update: {
        amount: decimalAmount,
        store: input.store,
        category: input.category,
        sku: input.sku,
        txnAt: input.txnAt,
      },
    });
  }

  // บันทึกธุรกรรมแบบ Idempotent แท้จริง: หาก txn_id มีอยู่แล้วจะข้ามทันทีและคืนค่า created=false เพื่อไม่ให้นับซ้ำ
  async createIfNotExists(
    input: CreateSpendingTxnInput,
  ): Promise<{ readonly created: boolean; readonly record: SpendingTxn }> {
    const existing = await this.prisma.spendingTxn.findUnique({
      where: { txnId: input.txnId },
    });
    if (existing) {
      return { created: false, record: existing };
    }

    const decimalAmount = new Prisma.Decimal(input.amount);
    const createdRecord = await this.prisma.spendingTxn.create({
      data: {
        txnId: input.txnId,
        memberId: input.memberId,
        store: input.store,
        amount: decimalAmount,
        category: input.category,
        sku: input.sku,
        txnAt: input.txnAt,
      },
    });

    return { created: true, record: createdRecord };
  }

  // ค้นหารายการยอดใช้จ่ายของสมาชิกตามช่วงเวลาสำหรับคำนวณ Mission
  async findByMemberAndPeriod(
    memberId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<SpendingTxn[]> {
    return this.prisma.spendingTxn.findMany({
      where: {
        memberId,
        txnAt: {
          gte: startAt,
          lte: endAt,
        },
      },
      orderBy: { txnAt: 'asc' },
    });
  }
}
